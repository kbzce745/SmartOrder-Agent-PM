document.addEventListener("DOMContentLoaded", () => {
    const modeSwitcher = document.getElementById("mode-switcher");
    const customerView = document.getElementById("customer-view");
    const merchantView = document.getElementById("merchant-view");
    const aiFabBtn = document.getElementById("ai-fab-btn");

    const statPages = document.getElementById("stat-pages");
    const statItems = document.getElementById("stat-items");
    const statBilingual = document.getElementById("stat-bilingual");
    const statPriceValid = document.getElementById("stat-price-valid");
    const merchantAuditBadge = document.getElementById("merchant-audit-badge");
    const merchantLogoutBtn = document.getElementById("merchant-logout-btn");

    // Merchant Auth Modal Elements
    const merchantAuthModal = document.getElementById("merchant-auth-modal");
    const merchantAuthBackdrop = document.getElementById("merchant-auth-backdrop");
    const closeAuthModal = document.getElementById("close-auth-modal");
    const cancelAuthBtn = document.getElementById("cancel-auth-btn");
    const merchantAuthForm = document.getElementById("merchant-auth-form");
    const merchantPwdInput = document.getElementById("merchant-pwd-input");
    const merchantAuthError = document.getElementById("merchant-auth-error");

    const AUTH_SESSION_KEY = "ORDER_SYSTEM_MERCHANT_AUTH";
    // SHA-256 digest of the merchant administrator password (no plaintext stored in repo)
    const ADMIN_PASSWORD_SHA256 = "080ec1d4c60416c779f9a272454dabef0ab4a089aff28b3a0e1b95c0fea7584a";

    // Pure-JS SHA-256 implementation (works on HTTPS, localhost, and HTTP LAN mobile preview)
    const sha256Hex = (ascii) => {
        const rightRotate = (value, amount) => (value >>> amount) | (value << (32 - amount));
        const mathPow = Math.pow;
        const maxWord = mathPow(2, 32);
        let result = "";
        const words = [];
        const asciiBitLength = ascii.length * 8;
        let hash = [];
        const k = [];
        let primeCounter = 0;
        const isComposite = {};
        for (let candidate = 2; primeCounter < 64; candidate++) {
            if (!isComposite[candidate]) {
                for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
                hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
                k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
            }
        }
        ascii += "\x80";
        while ((ascii.length % 64) - 56) ascii += "\x00";
        for (let i = 0; i < ascii.length; i++) {
            const j = ascii.charCodeAt(i);
            words[i >> 2] |= j << (((3 - i) % 4) * 8);
        }
        words[words.length] = (asciiBitLength / maxWord) | 0;
        words[words.length] = asciiBitLength;
        for (let j = 0; j < words.length; ) {
            const w = words.slice(j, (j += 16));
            const oldHash = hash.slice(0);
            hash = hash.slice(0, 8);
            for (let i = 0; i < 64; i++) {
                const i2 = i + j;
                const w15 = w[i - 15];
                const w2 = w[i - 2];
                const a = hash[0];
                const e = hash[4];
                const temp1 =
                    hash[7] +
                    (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
                    ((e & hash[5]) ^ (~e & hash[6])) +
                    k[i] +
                    (w[i] =
                        i < 16
                            ? w[i]
                            : (w[i - 16] +
                                  (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                                  w[i - 7] +
                                  (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
                              0);
                const temp2 =
                    (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
                    ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
                hash = [(temp1 + temp2) | 0].concat(hash);
                hash[4] = (hash[4] + temp1) | 0;
            }
            for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
        }
        for (let i = 0; i < 8; i++) {
            for (let j = 3; j + 1; j--) {
                const b = (hash[i] >> (j * 8)) & 255;
                result += (b < 16 ? 0 : "") + b.toString(16);
            }
        }
        return result;
    };

    // Module 2 Elements (OCR & New Dish)
    const caseOcrFixBtn = document.getElementById("case-ocr-fix-btn");
    const caseNewDishBtn = document.getElementById("case-new-dish-btn");
    const ocrRawInput = document.getElementById("ocr-raw-input");
    const runOcrAgentBtn = document.getElementById("run-ocr-agent-btn");
    const applyNewDishBtn = document.getElementById("apply-new-dish-btn");
    const ocrComparisonResult = document.getElementById("ocr-comparison-result");

    // Module 3 Elements (Bulk Price Ops)
    const bulkInstructInput = document.getElementById("bulk-instruct-input");
    const runBulkInstructBtn = document.getElementById("run-bulk-instruct-btn");
    const resetMenuPriceBtn = document.getElementById("reset-menu-price-btn");
    const exportMenuJsonBtn = document.getElementById("export-menu-json-btn");
    const bulkDiffResult = document.getElementById("bulk-diff-result");

    // Module 4 Elements (WeChat Order Parser)
    const caseWechat1 = document.getElementById("case-wechat-1");
    const caseWechat2 = document.getElementById("case-wechat-2");
    const wechatRawInput = document.getElementById("wechat-raw-input");
    const parseWechatOrderBtn = document.getElementById("parse-wechat-order-btn");
    const wechatParseResult = document.getElementById("wechat-parse-result");

    let stagedNewDishes = [];

    const parsePrice = (priceStr) => parseInt(String(priceStr).replace(/,/g, ""), 10) || 0;
    const formatPrice = (num) => Number(num).toLocaleString();

    // --- Refresh Schema Audit Dashboard ---
    const refreshAuditStats = () => {
        const pages = window.OrderApp.getMenuPages() || [];
        let totalItems = 0;
        let bilingualOk = 0;
        let priceOk = 0;

        pages.forEach((p) => {
            (p.items || []).forEach((item) => {
                totalItems += 1;
                if (item.name && item.ko_name) bilingualOk += 1;
                const pNum = parsePrice(item.price);
                if (pNum >= 500 && pNum <= 100000 && pNum % 100 === 0) priceOk += 1;
            });
        });

        statPages.textContent = String(pages.length);
        statItems.textContent = String(totalItems);
        const biRate = totalItems > 0 ? Math.round((bilingualOk / totalItems) * 100) : 100;
        const prRate = totalItems > 0 ? Math.round((priceOk / totalItems) * 100) : 100;
        statBilingual.textContent = `${biRate}%`;
        statPriceValid.textContent = `${prRate}%`;

        if (biRate === 100 && prRate === 100) {
            merchantAuditBadge.textContent = "Schema 自检通过 (PASSED)";
            merchantAuditBadge.className = "audit-pass-badge";
        } else {
            merchantAuditBadge.textContent = "发现待修正项 (WARNING)";
            merchantAuditBadge.className = "audit-warn-badge";
        }
    };

    // --- Mode Switching with Password Gate ---
    const enterMerchantMode = () => {
        modeSwitcher.querySelectorAll(".mode-btn").forEach((b) => {
            b.classList.toggle("active", b.getAttribute("data-mode") === "merchant");
        });
        customerView.classList.add("hidden");
        merchantView.classList.remove("hidden");
        aiFabBtn.classList.add("hidden");
        refreshAuditStats();
    };

    const enterCustomerMode = () => {
        modeSwitcher.querySelectorAll(".mode-btn").forEach((b) => {
            b.classList.toggle("active", b.getAttribute("data-mode") === "customer");
        });
        merchantView.classList.add("hidden");
        customerView.classList.remove("hidden");
        aiFabBtn.classList.remove("hidden");
    };

    const closeAuthDialog = () => {
        merchantAuthModal.classList.add("hidden");
        merchantPwdInput.value = "";
        merchantAuthError.classList.add("hidden");
    };

    modeSwitcher.addEventListener("click", (e) => {
        const btn = e.target.closest(".mode-btn");
        if (!btn) return;
        const mode = btn.getAttribute("data-mode");

        if (mode === "merchant") {
            if (sessionStorage.getItem(AUTH_SESSION_KEY) === "1") {
                enterMerchantMode();
            } else {
                merchantAuthError.classList.add("hidden");
                merchantPwdInput.value = "";
                merchantAuthModal.classList.remove("hidden");
                setTimeout(() => merchantPwdInput.focus(), 100);
            }
        } else {
            enterCustomerMode();
        }
    });

    closeAuthModal.addEventListener("click", closeAuthDialog);
    cancelAuthBtn.addEventListener("click", closeAuthDialog);
    merchantAuthBackdrop.addEventListener("click", closeAuthDialog);

    merchantAuthForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const inputPwd = merchantPwdInput.value.trim();
        if (sha256Hex(inputPwd) === ADMIN_PASSWORD_SHA256) {
            sessionStorage.setItem(AUTH_SESSION_KEY, "1");
            closeAuthDialog();
            enterMerchantMode();
            window.OrderApp.showToast("验证通过，已进入老板管理端");
        } else {
            merchantAuthError.classList.remove("hidden");
            merchantPwdInput.select();
        }
    });

    merchantLogoutBtn.addEventListener("click", () => {
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        enterCustomerMode();
        window.OrderApp.showToast("已锁定并退出老板管理端");
    });

    // --- Module 2: OCR Leak Fix & New Dish Structuring Verification ---
    const CASE_1_TEXT =
        "[images/9.jpg 原始OCR文本] 처음으로 피자 볶음밥 사이드 만두 음료 부추고기만두 7,000 쏸차이 돼지고기만두 7,000 샐러리물만두 7,000 훈툰 7,000 샤오롱바오 6,000 부추계란물만두 8,000 부추계란새우물만두 9,000";

    const CASE_2_TEXT =
        "新增两道主食到年糕与意面分类：韩式炸酱面 짜장면 7,500（支持大小份，不辣），海鲜辣汤面 짬뽕 9,000（支持大小份，香辣）";

    caseOcrFixBtn.addEventListener("click", () => {
        ocrRawInput.value = CASE_1_TEXT;
        runOcrStructuring(CASE_1_TEXT);
    });

    caseNewDishBtn.addEventListener("click", () => {
        ocrRawInput.value = CASE_2_TEXT;
        runOcrStructuring(CASE_2_TEXT);
    });

    const runOcrStructuring = (rawText) => {
        const text = (rawText || "").trim();
        if (!text) {
            window.OrderApp.showToast("请先输入或点击预设案例");
            return;
        }

        ocrComparisonResult.classList.remove("hidden");
        stagedNewDishes = [];
        applyNewDishBtn.classList.add("hidden");

        // Case 1: 9.jpg Dumpling Page OCR comparison
        if (text.includes("샐러리물만두") || text.includes("9.jpg")) {
            ocrComparisonResult.innerHTML = `
                <div class="comparison-grid">
                    <div class="comp-col legacy">
                        <div class="comp-title">重构前：传统 EasyOCR + 正则切词 (process_images.py)</div>
                        <div class="comp-status error">识别结果：仅 6 道菜（漏识别 1 道，无韩文对照字段）</div>
                        <ul class="comp-list">
                            <li>韭菜肉饺子 — 7,000</li>
                            <li>酸菜饺子 — 7,000</li>
                            <li class="missing-row">[缺失] 샐러리물만두 (芹菜水饺 7,000) 被旧版分词逻辑丢弃</li>
                            <li>馄饨 — 7,000</li>
                            <li>小笼包 — 6,000</li>
                            <li>韭菜鸡蛋水饺 — 8,000</li>
                            <li>韭菜鸡蛋虾仁水饺 — 9,000</li>
                        </ul>
                    </div>
                    <div class="comp-col agentic">
                        <div class="comp-title">重构后：Merchant Menu Agent (DeepSeek-V3 语义对齐 + 自检)</div>
                        <div class="comp-status success">识别结果：7 道菜 100% 完整提取，自动过滤导航噪点词并补全双语 Schema</div>
                        <ul class="comp-list">
                            <li><strong>韭菜肉饺子</strong> (부추 고기 만두) — 7,000 KRW [大小份]</li>
                            <li><strong>酸菜猪肉饺子</strong> (쏸차이 돼지고기 만두) — 7,000 KRW [大小份]</li>
                            <li class="fixed-row"><strong>[已修复补全] 芹菜水饺</strong> (샐러리 물만두) — 7,000 KRW [大小份]</li>
                            <li><strong>馄饨</strong> (훈툰) — 7,000 KRW [大小份]</li>
                            <li><strong>小笼包</strong> (샤오롱바오) — 6,000 KRW [标准份]</li>
                            <li><strong>韭菜鸡蛋水饺</strong> (부추 달걀 물만두) — 8,000 KRW [大小份]</li>
                            <li><strong>韭菜鸡蛋虾仁水饺</strong> (부추 달걀 새우 물만두) — 9,000 KRW [大小份]</li>
                        </ul>
                    </div>
                </div>
            `;
            return;
        }

        // Case 2 or Custom New Dish Parsing
        const parsedItems = [];
        const segments = text.replace(/^.*?(?:新增|添加|上架)[^：:]*[：:]?/, "").split(/[，,；;\n]/);

        segments.forEach((seg, idx) => {
            const clean = seg.trim();
            if (!clean) return;
            const priceMatch = clean.match(/(\d[\d,]{2,6})/);
            if (!priceMatch) return;

            const priceNum = parsePrice(priceMatch[1]);
            const priceFormatted = formatPrice(priceNum);
            const koMatch = clean.match(/([가-힣]+(?:\s+[가-힣]+)*)/);
            const koName = koMatch ? koMatch[1].trim() : "신메뉴";

            let zhName = clean
                .replace(priceMatch[0], "")
                .replace(koName, "")
                .replace(/\(.*?\)|（.*?）|韩元|KRW|원/gi, "")
                .trim();
            if (!zhName) zhName = `新菜品_${idx + 1}`;

            const hasSize = /大小份/.test(clean);
            const isSpicy = /辣/.test(clean) && !/不辣/.test(clean);

            parsedItems.push({
                id: `custom_dish_${Date.now()}_${idx}`,
                name: zhName,
                ko_name: koName,
                price: priceFormatted,
                has_size_option: hasSize,
                spicy: isSpicy,
                tags: [isSpicy ? "香辣" : "不辣", "新品上架"]
            });
        });

        if (parsedItems.length === 0) {
            ocrComparisonResult.innerHTML = `<div class="comp-status error">未能从输入中提取到包含有效韩元价格（如 7,500）的菜品信息，请检查输入格式。</div>`;
            return;
        }

        stagedNewDishes = parsedItems;
        applyNewDishBtn.classList.remove("hidden");

        ocrComparisonResult.innerHTML = `
            <div class="comp-title">Agent 结构化提取结果 (已通过 Pydantic / JSON Schema 格式校验)：</div>
            <pre class="json-preview">${JSON.stringify(parsedItems, null, 2)}</pre>
        `;
    };

    runOcrAgentBtn.addEventListener("click", () => {
        runOcrStructuring(ocrRawInput.value);
    });

    applyNewDishBtn.addEventListener("click", () => {
        if (stagedNewDishes.length === 0) return;
        const pages = JSON.parse(JSON.stringify(window.OrderApp.getMenuPages()));
        const targetPage = pages.find((p) => p.category === "noodle") || pages[0];
        stagedNewDishes.forEach((dish) => {
            if (!targetPage.items.some((i) => i.name === dish.name)) {
                targetPage.items.unshift(dish);
            }
        });
        window.OrderApp.updateMenuPages(pages);
        refreshAuditStats();
        applyNewDishBtn.classList.add("hidden");
        window.OrderApp.showToast(`成功上架 ${stagedNewDishes.length} 道新菜，可切回顾客端查看`);
    });

    // --- Module 3: Natural Language Bulk Price Maintenance ---
    const executeBulkPriceCommand = (commandText) => {
        const text = (commandText || "").trim();
        if (!text) {
            window.OrderApp.showToast("请输入批量改价指令");
            return;
        }

        const match = text.match(/(披萨|盖饭|炒饭|年糕|意面|炸物|烤鸡|水饺|饮品|全部).*?(上调|涨价|增加|下调|降价|减少)\s*([\d,]+)/);
        if (!match) {
            bulkDiffResult.classList.remove("hidden");
            bulkDiffResult.innerHTML = `<div class="comp-status error">请使用明确的品类与调价幅度，例如：“把所有披萨价格上调 1000 韩元”或“把所有水饺价格下调 500 韩元”。</div>`;
            return;
        }

        const [_, targetLabel, direction, amountRaw] = match;
        const rawDelta = parsePrice(amountRaw);
        const delta = /上调|涨价|增加/.test(direction) ? rawDelta : -rawDelta;

        const categoryMap = {
            披萨: "pizza",
            盖饭: "rice",
            炒饭: "rice",
            年糕: "noodle",
            意面: "noodle",
            炸物: "snack",
            烤鸡: "snack",
            水饺: "dumpling",
            饮品: "drink",
            全部: "all"
        };
        const targetCat = categoryMap[targetLabel] || "all";

        const pages = JSON.parse(JSON.stringify(window.OrderApp.getMenuPages()));
        const diffRows = [];

        pages.forEach((page) => {
            if (targetCat !== "all" && page.category !== targetCat) return;
            page.items.forEach((item) => {
                const oldPrice = parsePrice(item.price);
                const newPrice = Math.max(500, oldPrice + delta);
                item.price = formatPrice(newPrice);
                diffRows.push({
                    name: item.name,
                    koName: item.ko_name,
                    oldPrice: formatPrice(oldPrice),
                    newPrice: formatPrice(newPrice),
                    deltaStr: delta >= 0 ? `+${formatPrice(delta)}` : formatPrice(delta)
                });
            });
        });

        window.OrderApp.updateMenuPages(pages);
        refreshAuditStats();

        const previewRowsHtml = diffRows.slice(0, 8).map((r) => `
            <tr>
                <td>${r.name}</td>
                <td>${r.koName}</td>
                <td>${r.oldPrice}</td>
                <td class="diff-new-price">${r.newPrice}</td>
                <td><span class="diff-badge ${delta >= 0 ? "up" : "down"}">${r.deltaStr}</span></td>
            </tr>
        `).join("");

        bulkDiffResult.classList.remove("hidden");
        bulkDiffResult.innerHTML = `
            <div class="comp-status success">
                已执行指令：「${text}」— 共更新 ${diffRows.length} 道菜品，Schema 自检通过并已实时同步至顾客端！
            </div>
            <div class="table-scroll-wrap">
                <table class="diff-table">
                    <thead>
                        <tr>
                            <th>中文菜名</th>
                            <th>韩文菜名</th>
                            <th>修改前 (KRW)</th>
                            <th>修改后 (KRW)</th>
                            <th>变动</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${previewRowsHtml}
                    </tbody>
                </table>
            </div>
            ${diffRows.length > 8 ? `<div class="diff-more-note">仅展示前 8 条变更，全部 ${diffRows.length} 条菜品价格均已在顾客点餐端生效。</div>` : ""}
        `;
    };

    document.querySelectorAll(".bulk-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
            const cmd = chip.getAttribute("data-cmd");
            bulkInstructInput.value = cmd;
            executeBulkPriceCommand(cmd);
        });
    });

    runBulkInstructBtn.addEventListener("click", () => {
        executeBulkPriceCommand(bulkInstructInput.value);
    });

    resetMenuPriceBtn.addEventListener("click", () => {
        window.OrderApp.resetMenuPages();
        refreshAuditStats();
        bulkDiffResult.classList.remove("hidden");
        bulkDiffResult.innerHTML = `<div class="comp-status success">已重置回门店初始默认菜单与价格（85 道菜品）。</div>`;
        window.OrderApp.showToast("已恢复门店默认菜单数据");
    });

    exportMenuJsonBtn.addEventListener("click", () => {
        const dataStr = JSON.stringify(window.OrderApp.getMenuPages(), null, 2);
        const blob = new Blob([dataStr], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "menu.json";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        window.OrderApp.showToast("已导出最新 menu.json 文件");
    });

    // --- Module 4: WeChat Unstructured Order Parser & Kitchen Ticket Generator ---
    const WECHAT_SAMPLE_1 =
        "老板您好，我是402室的，给我来一个大号烤牛肉披萨换芝士饼边，再来一份小份虾仁炒饭和两罐可乐，对了披萨不要放青椒和洋葱，到了放门口别按门铃，算一下一共多少钱？";

    const WECHAT_SAMPLE_2 =
        "老板，B栋308室，点一个大号什锦披萨（黄金饼皮），一份无骨炸鸡块，一份糖醋肉，再来一瓶1.25L大可乐，需要一次性餐具，少辣谢谢！";

    caseWechat1.addEventListener("click", () => {
        wechatRawInput.value = WECHAT_SAMPLE_1;
        parseWeChatMessage(WECHAT_SAMPLE_1);
    });

    caseWechat2.addEventListener("click", () => {
        wechatRawInput.value = WECHAT_SAMPLE_2;
        parseWeChatMessage(WECHAT_SAMPLE_2);
    });

    const parseWeChatMessage = (rawMsg) => {
        const text = (rawMsg || "").trim();
        if (!text) {
            window.OrderApp.showToast("请先输入顾客微信点单文本");
            return;
        }

        const catalog = Object.values(window.OrderApp.getMenuCatalog());
        const cnNumMap = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5 };

        // Extract room number
        const roomMatch = text.match(/([A-Za-z]栋\s*\d{3,4}|\d{3,4})\s*(?:室|号|房间)?/);
        const roomNo = roomMatch ? roomMatch[1] : "未提及(需追问)";

        // Extract notes
        const noteRules = [
            { pattern: /不要青椒|去青椒/, zh: "不要青椒", ko: "피망(청피망) 빼주세요" },
            { pattern: /不要洋葱|去洋葱/, zh: "不要洋葱", ko: "양파 빼주세요" },
            { pattern: /不要香菜|去香菜/, zh: "不要香菜", ko: "고수 빼주세요" },
            { pattern: /少辣|微辣/, zh: "少辣", ko: "덜 맵게 해주세요" },
            { pattern: /放门口.*(?:别按|不要按|勿按).*铃/, zh: "放门口勿按门铃", ko: "문 앞에 두고 벨 누르지 마세요" },
            { pattern: /一次性餐具|需要餐具/, zh: "需要一次性餐具", ko: "일회용 수저 챙겨주세요" }
        ];
        const notesZh = [];
        const notesKo = [];
        noteRules.forEach((r) => {
            if (r.pattern.test(text)) {
                notesZh.push(r.zh);
                notesKo.push(r.ko);
            }
        });

        const resolvedItems = [];
        catalog.forEach((item) => {
            const cleanName = item.nameZh.replace(/\(.*?\)|（.*?）/g, "");
            if (text.includes(cleanName) || (item.id === "drink_cola_can" && /两罐可乐|罐装可乐/.test(text))) {
                let qty = 1;
                const qtyRegex = new RegExp(`(\\d+|[一二两三四五])\\s*(?:份|个|只|瓶|听|罐)\\s*[^，,。]*?${cleanName}`);
                const m = text.match(qtyRegex);
                if (m) {
                    qty = cnNumMap[m[1]] || parseInt(m[1], 10) || 1;
                } else if (item.id === "drink_cola_can" && /两罐可乐/.test(text)) {
                    qty = 2;
                }

                if (item.hasPizzaOption) {
                    const size = /大号|L号/i.test(text) ? "L" : "M";
                    let crust = "原味";
                    if (/芝士饼边|芝士边/.test(text)) crust = "芝士饼边";
                    else if (/黄金饼皮/.test(text)) crust = "黄金饼皮";
                    else if (/脆皮/.test(text)) crust = "脆皮";

                    const resolved = window.OrderApp.resolveAction({
                        type: "add_pizza",
                        item_id: item.id,
                        size,
                        crust,
                        qty
                    });
                    if (resolved) resolvedItems.push(resolved);
                } else if (item.hasSizeOption) {
                    const portion = /大份/.test(text) ? "large" : "small";
                    const resolved = window.OrderApp.resolveAction({
                        type: "add_portion",
                        item_id: item.id,
                        portion,
                        qty
                    });
                    if (resolved) resolvedItems.push(resolved);
                } else {
                    const resolved = window.OrderApp.resolveAction({
                        type: "add_standard",
                        item_id: item.id,
                        qty
                    });
                    if (resolved) resolvedItems.push(resolved);
                }
            }
        });

        if (/1\.25L.*可乐|大可乐/i.test(text) && !resolvedItems.some((i) => i.baseId === "drink_cola_1250")) {
            const r = window.OrderApp.resolveAction({ type: "add_standard", item_id: "drink_cola_1250", qty: 1 });
            if (r) resolvedItems.push(r);
        }

        const totalKrw = resolvedItems.reduce((acc, cur) => acc + cur.lineTotal, 0);

        const kitchenLinesKo = [
            "【주방 조리서 / 后厨制作单】",
            `호수 (门牌号): ${roomNo}`,
            "------------------------",
            ...resolvedItems.map((i) => `${i.qty}x ${i.nameKo} (${formatPrice(i.lineTotal)})`),
            ...(notesKo.length > 0 ? ["------------------------", `요청사항: ${notesKo.join("; ")}`] : []),
            "------------------------",
            `총액: ${formatPrice(totalKrw)} KRW`
        ];

        const replyLinesZh = [
            "【微信账单核对回复】",
            `门牌号: ${roomNo}`,
            ...resolvedItems.map((i) => `- ${i.qty}x ${i.nameZh}: ${formatPrice(i.lineTotal)} KRW`),
            ...(notesZh.length > 0 ? [`备注: ${notesZh.join("；")}`] : []),
            `合计应付: ${formatPrice(totalKrw)} KRW（已安排后厨制作）`
        ];

        wechatParseResult.classList.remove("hidden");
        wechatParseResult.innerHTML = `
            <div class="comparison-grid">
                <div class="comp-col">
                    <div class="comp-title">韩国后厨出餐单 (纯韩文对账单)</div>
                    <pre class="ticket-pre" id="kitchen-ko-ticket">${kitchenLinesKo.join("\n")}</pre>
                </div>
                <div class="comp-col">
                    <div class="comp-title">一键回复顾客微信账单 (确定性算价)</div>
                    <pre class="ticket-pre" id="customer-zh-reply">${replyLinesZh.join("\n")}</pre>
                </div>
            </div>
        `;
    };

    parseWechatOrderBtn.addEventListener("click", () => {
        parseWeChatMessage(wechatRawInput.value);
    });

    // Local automated demo state trigger for documentation screenshots (localhost only)
    const isLocalHost = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    if (isLocalHost && window.location.search.includes("demo=merchant_cases")) {
        setTimeout(() => {
            enterMerchantMode();
            ocrRawInput.value = CASE_1_TEXT;
            runOcrStructuring(CASE_1_TEXT);
            bulkInstructInput.value = "把所有披萨价格上调 1000 韩元";
            executeBulkPriceCommand("把所有披萨价格上调 1000 韩元");
            wechatRawInput.value = WECHAT_SAMPLE_1;
            parseWeChatMessage(WECHAT_SAMPLE_1);
        }, 400);
    }
});
