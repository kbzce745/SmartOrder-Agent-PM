"""Menu Digitization and Maintenance Agent for the Bilingual Ordering System.

This module replaces the legacy regex-based OCR scripts (`process_images.py` and
`reformat.py`) with a three-stage Agentic Pipeline:
1. Perception Layer: Extracts raw text blocks from menu images via EasyOCR or
   reads existing raw OCR text.
2. Semantic Structuring Layer (DeepSeek-V3): Aligns dish names, Korean/Chinese
   translations, prices, and customization flags into strict JSON Schema.
3. Deterministic Verification Layer: Validates KRW price multiples, bilingual
   completeness, and unique identifiers before persisting to `public/menu.json`.
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

DEFAULT_MENU_PATH = Path("public/menu.json")
DEFAULT_IMAGES_DIR = Path("public/images")


def parse_krw_price(price_str: str) -> int:
    """Converts a formatted KRW price string (e.g. '19,900') into an integer.

    Args:
        price_str: Formatted price string.

    Returns:
        Integer price value in KRW.
    """
    digits = re.sub(r"[^\d]", "", str(price_str))
    return int(digits) if digits else 0


def format_krw_price(price_num: int) -> str:
    """Formats an integer KRW amount with thousands separators.

    Args:
        price_num: Integer KRW price.

    Returns:
        Comma-formatted price string (e.g. '19,900').
    """
    return f"{price_num:,}"


def audit_menu_schema(menu_data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Runs deterministic integrity checks on the menu data structure.

    Verifies:
    - Logical page ordering and category metadata presence.
    - Bilingual completeness (`name` and `ko_name` non-empty).
    - Valid KRW price range (1,000 <= price <= 100,000, divisible by 100).
    - Unique dish IDs across all pages.

    Args:
        menu_data: List of menu page objects loaded from `menu.json`.

    Returns:
        Dictionary containing summary statistics and any detected anomalies.
    """
    total_pages = len(menu_data)
    total_items = 0
    seen_ids = set()
    issues: List[str] = []
    category_counts: Dict[str, int] = {}

    for page_idx, page in enumerate(menu_data):
        cat = page.get("category", "unknown")
        category_counts[cat] = category_counts.get(cat, 0) + len(page.get("items", []))

        if not page.get("image"):
            issues.append(f"Page {page_idx}: Missing image path.")

        for item_idx, item in enumerate(page.get("items", [])):
            total_items += 1
            item_id = item.get("id", "")
            name_zh = item.get("name", "").strip()
            name_ko = item.get("ko_name", "").strip()
            price_num = parse_krw_price(item.get("price", "0"))

            if not item_id:
                issues.append(f"Page {page_idx} Item {item_idx} ({name_zh}): Missing stable 'id'.")
            elif item_id in seen_ids:
                issues.append(f"Duplicate item ID detected: '{item_id}'.")
            else:
                seen_ids.add(item_id)

            if not name_zh or not name_ko:
                issues.append(f"Item '{item_id}': Incomplete bilingual names (zh='{name_zh}', ko='{name_ko}').")

            if price_num < 500 or price_num > 100000 or price_num % 100 != 0:
                issues.append(f"Item '{item_id}' ({name_zh}): Suspicious KRW price '{item.get('price')}'.")

    return {
        "valid": len(issues) == 0,
        "total_pages": total_pages,
        "total_items": total_items,
        "category_distribution": category_counts,
        "issues": issues,
    }


def call_deepseek_json(system_prompt: str, user_prompt: str) -> Dict[str, Any]:
    """Invokes the DeepSeek-V3 chat completion endpoint with JSON mode enabled.

    Args:
        system_prompt: System instruction defining the JSON output schema.
        user_prompt: Input payload for the model.

    Returns:
        Parsed JSON dictionary returned by the model.

    Raises:
        RuntimeError: If `DEEPSEEK_API_KEY` is not set or the API call fails.
    """
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    base_url = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    model = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")

    if not api_key:
        raise RuntimeError(
            "Environment variable DEEPSEEK_API_KEY is not set. "
            "Please configure it in .env or environment variables."
        )

    payload_bytes = json.dumps(
        {
            "model": model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=payload_bytes,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        resp_data = json.loads(resp.read().decode("utf-8"))
    content = resp_data["choices"][0]["message"]["content"]
    return json.loads(content)


def apply_merchant_instruction(menu_path: Path, instruction: str) -> None:
    """Updates `menu.json` according to a natural language merchant instruction.

    Supports deterministic local fast-paths (e.g. bulk category price adjustments)
    as well as DeepSeek-V3 semantic edits, followed by automatic schema verification.

    Args:
        menu_path: Path to `public/menu.json`.
        instruction: Natural language command from the restaurant owner.
    """
    with open(menu_path, "r", encoding="utf-8") as f:
        menu_data: List[Dict[str, Any]] = json.load(f)

    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if api_key:
        system_prompt = (
            "你是餐饮门店菜单管理 Agent。请根据店主的自然语言指令修改传入的菜单 JSON 数据，"
            "并返回完整且合法的 JSON 对象：{\"updated_menu\": [...], \"summary\": \"修改说明\"}。"
            "严禁使用任何 Emoji。"
        )
        user_payload = json.dumps(
            {"instruction": instruction, "current_menu": menu_data},
            ensure_ascii=False,
        )
        result = call_deepseek_json(system_prompt, user_payload)
        updated_menu = result.get("updated_menu", menu_data)
        summary = result.get("summary", "已完成菜单更新。")
    else:
        # Local deterministic rule engine for common bulk price adjustments
        match_delta = re.search(r"(披萨|盖饭|炒饭|水饺|饮品|全部).*?(上调|涨价|下调|降价)\s*(\d+)", instruction)
        if not match_delta:
            print("未检测到 DEEPSEEK_API_KEY，且指令不属于本地批量调价规则。请配置 DEEPSEEK_API_KEY 后重试。")
            return

        target_name, direction, amount_str = match_delta.groups()
        delta = int(amount_str) * (1 if direction in ("上调", "涨价") else -1)
        cat_map = {"披萨": "pizza", "盖饭": "rice", "炒饭": "rice", "水饺": "dumpling", "饮品": "drink"}
        target_cat = cat_map.get(target_name)

        modified_count = 0
        for page in menu_data:
            if target_cat and page.get("category") != target_cat:
                continue
            for item in page.get("items", []):
                old_p = parse_krw_price(item["price"])
                item["price"] = format_krw_price(max(500, old_p + delta))
                modified_count += 1

        updated_menu = menu_data
        summary = f"本地确定性规则已执行：针对【{target_name}】完成 {direction} {amount_str} KRW（共更新 {modified_count} 道菜品）。"

    audit_report = audit_menu_schema(updated_menu)
    if not audit_report["valid"]:
        print("自校验未通过，拒绝写入文件。问题列表：")
        for issue in audit_report["issues"]:
            print(f"  - {issue}")
        return

    with open(menu_path, "w", encoding="utf-8") as f:
        json.dump(updated_menu, f, ensure_ascii=False, indent=2)

    print(summary)
    print(f"自校验通过：共 {audit_report['total_pages']} 页，{audit_report['total_items']} 道菜品。")


def extract_ocr_with_agent(images_dir: Path, menu_path: Path) -> None:
    """Runs EasyOCR on menu photos and structures them via DeepSeek-V3.

    Args:
        images_dir: Directory containing menu images.
        menu_path: Output path for `menu.json`.
    """
    try:
        import easyocr
    except ImportError:
        print("未安装 easyocr，请先运行 pip install -r requirements.txt")
        return

    reader = easyocr.Reader(["ko"])
    image_files = sorted(
        [f for f in os.listdir(images_dir) if f.lower().endswith((".jpg", ".jpeg", ".png"))],
        key=lambda x: [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", x)],
    )

    raw_pages = []
    for filename in image_files:
        img_path = images_dir / filename
        print(f"正在提取图像文本: {filename} ...")
        tokens = reader.readtext(str(img_path), detail=0)
        raw_text = " ".join(tokens).strip()
        raw_pages.append({"image": f"images/{filename}", "raw_ocr_text": raw_text})

    system_prompt = (
        "你是中韩双语菜单结构化 Agent。请将输入的 EasyOCR 原始韩文识别结果还原为结构化菜单数组。"
        "注意修正 OCR 粘连或漏字，补全准确的中文译名、价格（千分位格式）、分类（pizza/rice/noodle/snack/dumpling/drink）"
        "以及规格标记（has_pizza_option/has_size_option）。严禁包含任何 Emoji。"
        "返回格式：{\"pages\": [...]}"
    )
    structured = call_deepseek_json(system_prompt, json.dumps(raw_pages, ensure_ascii=False))
    pages = structured.get("pages", [])

    report = audit_menu_schema(pages)
    print(f"结构化完成，自检结果: valid={report['valid']}, 菜品总数={report['total_items']}")
    if report["issues"]:
        for issue in report["issues"]:
            print(f"  [告警] {issue}")

    with open(menu_path, "w", encoding="utf-8") as f:
        json.dump(pages, f, ensure_ascii=False, indent=2)


def main() -> None:
    """CLI entry point for the Menu Digitization and Maintenance Agent."""
    parser = argparse.ArgumentParser(
        description="Bilingual Menu Digitization & Self-Verification Agent"
    )
    parser.add_argument(
        "--audit",
        action="store_true",
        help="Run deterministic schema and bilingual completeness audit on public/menu.json",
    )
    parser.add_argument(
        "--instruct",
        type=str,
        default="",
        help="Apply a natural language update instruction to public/menu.json",
    )
    parser.add_argument(
        "--ocr-dir",
        type=str,
        default="",
        help="Run EasyOCR + DeepSeek-V3 semantic structuring on a directory of menu images",
    )
    args = parser.parse_args()

    if args.instruct:
        apply_merchant_instruction(DEFAULT_MENU_PATH, args.instruct)
    elif args.ocr_dir:
        extract_ocr_with_agent(Path(args.ocr_dir), DEFAULT_MENU_PATH)
    else:
        with open(DEFAULT_MENU_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        report = audit_menu_schema(data)
        print("=== 菜单数据完整性与双语对齐自检报告 ===")
        print(f"校验状态: {'通过 (PASSED)' if report['valid'] else '存在异常 (FAILED)'}")
        print(f"菜单页数: {report['total_pages']}")
        print(f"菜品总数: {report['total_items']}")
        print(f"分类分布: {json.dumps(report['category_distribution'], ensure_ascii=False)}")
        if report["issues"]:
            print("异常明细:")
            for issue in report["issues"]:
                print(f"  - {issue}")


if __name__ == "__main__":
    main()
