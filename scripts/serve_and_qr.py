"""Local LAN preview server, API proxy, and optional QR generator for Ordering System."""

import http.server
import json
import os
import re
import socket
import socketserver
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict

PORT = 8000
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DIRECTORY = str(PROJECT_ROOT / "public")


def load_dotenv_if_present() -> None:
    """Loads key-value pairs from `.env` into `os.environ` without external deps."""
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        clean = line.strip()
        if not clean or clean.startswith("#") or "=" not in clean:
            continue
        key, val = clean.split("=", 1)
        key = key.strip()
        val = val.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = val


def get_system_prompt() -> str:
    """Extracts the shared static menu system prompt from `netlify/functions/agent.mjs`."""
    agent_mjs_path = PROJECT_ROOT / "netlify" / "functions" / "agent.mjs"
    if agent_mjs_path.exists():
        content = agent_mjs_path.read_text(encoding="utf-8")
        match = re.search(r"const STATIC_MENU_SYSTEM_PROMPT = `([\s\S]*?)`;", content)
        if match:
            return match.group(1)
    return "你是一家在韩中韩双语餐厅的智能点单与导购助手，请返回合法的 JSON 对象。"


def get_local_ip() -> str:
    """Detects the machine's LAN IPv4 address for mobile QR code scanning.

    Returns:
        Local IPv4 address string, or '127.0.0.1' if offline.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("10.255.255.255", 1))
        ip_addr = sock.getsockname()[0]
    except Exception:
        ip_addr = "127.0.0.1"
    finally:
        sock.close()
    return ip_addr


class LocalOrderingRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP handler serving `public/` static assets and `/api/agent` locally."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def _send_json(self, status_code: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        """Handles local `/api/agent` requests using DeepSeek API or fallback."""
        if self.path != "/api/agent":
            self._send_json(404, {"error": "Not Found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            payload = json.loads(raw_body)
            message = payload.get("message", "")
            current_cart = payload.get("currentCart", [])
            room_no = payload.get("roomNo", "")
            custom_key = payload.get("customApiKey", "").strip()

            api_key = custom_key or os.environ.get("DEEPSEEK_API_KEY", "").strip()
            base_url = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
            model = os.environ.get("DEEPSEEK_MODEL", "deepseek-flash")

            if not api_key:
                self._send_json(200, {"fallback": True, "reason": "missing_api_key"})
                return

            user_context = json.dumps(
                {
                    "customer_input": message,
                    "current_room_no": room_no,
                    "current_cart_summary": current_cart,
                },
                ensure_ascii=False,
            )

            req_data = json.dumps(
                {
                    "model": model,
                    "temperature": 0.1,
                    "max_tokens": 350,
                    "thinking": {"type": "disabled"},
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": get_system_prompt()},
                        {"role": "user", "content": user_context},
                    ],
                }
            ).encode("utf-8")

            req = urllib.request.Request(
                f"{base_url}/chat/completions",
                data=req_data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp_json = json.loads(resp.read().decode("utf-8"))

            content_str = resp_json["choices"][0]["message"]["content"]
            parsed = json.loads(content_str)
            self._send_json(
                200,
                {
                    "fallback": False,
                    "data": parsed,
                    "usage": resp_json.get("usage"),
                },
            )
        except Exception as exc:
            self._send_json(
                200,
                {
                    "fallback": True,
                    "reason": "local_proxy_exception",
                    "detail": str(exc),
                },
            )


def try_generate_qrcode(url: str) -> None:
    """Generates `qrcode.png` if the `qrcode` package is installed.

    Args:
        url: Target URL to encode into the QR image.
    """
    try:
        import qrcode

        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        qr_path = PROJECT_ROOT / "qrcode.png"
        img.save(str(qr_path))
        print(f"QR Code generated and saved to {qr_path}")
    except ImportError:
        print("Note: 'qrcode' module not installed in current Python env; skipping QR image generation.")


def start_server() -> None:
    """Starts the local HTTP preview and `/api/agent` server."""
    load_dotenv_if_present()
    ip_addr = get_local_ip()
    lan_url = f"http://{ip_addr}:{PORT}"
    local_url = f"http://127.0.0.1:{PORT}"

    try_generate_qrcode(lan_url)
    print(f"Local preview URL: {local_url}")
    print(f"LAN mobile URL:    {lan_url}")

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), LocalOrderingRequestHandler) as httpd:
        print("Server is running (static files + /api/agent endpoint). Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")


if __name__ == "__main__":
    start_server()
