document.addEventListener("DOMContentLoaded", () => {
    const aiFabBtn = document.getElementById("ai-fab-btn");
    const aiDrawer = document.getElementById("ai-drawer");
    const aiBackdrop = document.getElementById("ai-backdrop");
    const closeAiBtn = document.getElementById("close-ai-btn");
    const aiKeyToggleBtn = document.getElementById("ai-key-toggle-btn");
    const aiConfigPanel = document.getElementById("ai-config-panel");
    const deepseekKeyInput = document.getElementById("deepseek-key-input");
    const saveApiKeyBtn = document.getElementById("save-api-key-btn");
    const aiEngineBadge = document.getElementById("ai-engine-badge");
    const aiChipsBar = document.getElementById("ai-chips-bar");
    const aiMessages = document.getElementById("ai-messages");
    const aiInputForm = document.getElementById("ai-input-form");
    const aiUserInput = document.getElementById("ai-user-input");
    const aiSendBtn = document.getElementById("ai-send-btn");

    const STORAGE_KEY = "ORDER_SYSTEM_DEEPSEEK_KEY";
    let savedApiKey = localStorage.getItem(STORAGE_KEY) || "";
    if (savedApiKey) {
        deepseekKeyInput.value = savedApiKey;
    }

    // Only expose the debug API key button in local development environments
    const isLocalEnv = /^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
        window.location.hostname
    );
    if (isLocalEnv) {
        aiKeyToggleBtn.classList.remove("hidden");
    }

    const MAX_INPUT_LENGTH = 120;
    const COOLDOWN_MS = 2500;
    let lastSendTimestamp = 0;

    const ABUSE_BLACKLIST_REGEX = /ignore\s+previous|system\s+prompt|jailbreak|忽略.*指令|无视.*规则|扮演|写一篇|写代码|写个程序|python|javascript|java|c\+\+|sql|html|论文|周报|简历|小说|故事|诗歌|算命|股票|加密货币|天气|翻译.*文章|政客|总统/i;
    const ORDERING_DOMAIN_REGEX = /披萨|盖饭|炒饭|拌饭|牛肉|猪肉|鸡|鸭|羊肉|虾|猪排|年糕|意面|冷面|乌冬|汤|翅|爪|糖醋肉|饺|馄饨|小笼包|丸子|奶|茶|椰|山楂|雪碧|可乐|芬达|咖啡|拿铁|卡布奇诺|饮|水|芝士|玉米|橄榄|菠萝|蔬菜|蒜|辣|酸黄瓜|饼|脆皮|大份|小份|大号|中号|M号|L号|人|预算|万|韩元|块|点单|推荐|搭配|套餐|加购|再来|要个|来份|来一|不要|不放|少放|免|忌口|过敏|香菜|洋葱|青椒|葱|姜|放门口|按铃|门铃|敲门|餐具|筷|勺|门牌|房间|室|号|栋|清空/i;

    const openDrawer = () => {
        aiDrawer.classList.remove("hidden");
        setTimeout(() => aiUserInput.focus(), 150);
    };

    const closeDrawer = () => {
        aiDrawer.classList.add("hidden");
    };

    aiFabBtn.addEventListener("click", openDrawer);
    closeAiBtn.addEventListener("click", closeDrawer);
    aiBackdrop.addEventListener("click", closeDrawer);

    aiKeyToggleBtn.addEventListener("click", () => {
        aiConfigPanel.classList.toggle("hidden");
    });

    saveApiKeyBtn.addEventListener("click", () => {
        savedApiKey = deepseekKeyInput.value.trim();
        if (savedApiKey) {
            localStorage.setItem(STORAGE_KEY, savedApiKey);
            window.OrderApp.showToast("已保存 DeepSeek API Key");
        } else {
            localStorage.removeItem(STORAGE_KEY);
            window.OrderApp.showToast("已清除自定义 API Key");
        }
        aiConfigPanel.classList.add("hidden");
    });

    // --- Bilingual Dietary & Delivery Dictionary for Local Engine & Fallback ---
    const BILINGUAL_NOTE_RULES = [
        { pattern: /不要香菜|不放香菜|去香菜|免香菜/, zh: "不要香菜", ko: "고수 빼주세요" },
        { pattern: /不要洋葱|不放洋葱|去洋葱|少放洋葱|少洋葱/, zh: "不要/少放洋葱", ko: "양파 빼거나 조금만 넣어주세요" },
        { pattern: /不要青椒|不放青椒|去青椒/, zh: "不要青椒", ko: "피망(청피망) 빼주세요" },
        { pattern: /不要葱|不放葱|免葱/, zh: "不要葱", ko: "파 빼주세요" },
        { pattern: /不要蒜|不放蒜|免蒜/, zh: "不要蒜", ko: "마늘 빼주세요" },
        { pattern: /不要辣|不吃辣|免辣|不辣/, zh: "不要辣", ko: "맵지 않게 해주세요" },
        { pattern: /少辣|微辣|不要太辣/, zh: "少辣/微辣", ko: "덜 맵게 해주세요" },
        { pattern: /多加辣|加辣|特辣/, zh: "加辣", ko: "맵게 해주세요" },
        { pattern: /放门口.*(?:别按|不要按|勿按).*铃|不要按门铃|别按门铃|勿按门铃/, zh: "放门口勿按门铃", ko: "문 앞에 두고 벨 누르지 마세요" },
        { pattern: /放门口|放在门口/, zh: "请放在门口", ko: "문 앞에 놓아주세요" },
        { pattern: /别敲门|不要敲门/, zh: "请勿敲门", ko: "노크하지 마세요" },
        { pattern: /餐具|筷子|勺子|叉子/, zh: "需要一次性餐具", ko: "일회용 수저/포크 챙겨주세요" },
        { pattern: /不要餐具|不用餐具/, zh: "无需一次性餐具", ko: "일회용 수저 안 주셔도 됩니다" },
        { pattern: /电话联系|到了打电话|发短信/, zh: "送达请电话/短信通知", ko: "도착하면 문자나 전화 주세요" }
    ];

    const extractRoomAndNotes = (text) => {
        let roomNo = "";
        const explicitPrefix = text.match(/(?:门牌号|房间号|房号|寝室|房间)[：:\s]*([A-Za-z]?\d{2,4}(?:室|号)?)/);
        const explicitSuffix = text.match(/\b([A-Za-z]?\d{3,4})\s*(?:室|号房间|寝室)(?!\s*(?:韩元|万|块|元|KRW))/i);
        if (explicitPrefix) {
            roomNo = explicitPrefix[1];
        } else if (explicitSuffix) {
            roomNo = explicitSuffix[1];
        }

        const matchedZh = [];
        const matchedKo = [];
        BILINGUAL_NOTE_RULES.forEach((rule) => {
            if (rule.pattern.test(text)) {
                if (!matchedZh.includes(rule.zh)) matchedZh.push(rule.zh);
                if (!matchedKo.includes(rule.ko)) matchedKo.push(rule.ko);
            }
        });

        return {
            roomNo,
            noteZh: matchedZh.join("；"),
            noteKo: matchedKo.join("; ")
        };
    };

    // --- Local Deterministic Agent Fallback (Zero-latency offline / keyless support) ---
    const runLocalIntentEngine = (message) => {
        const catalog = Object.values(window.OrderApp.getMenuCatalog());
        const { roomNo, noteZh, noteKo } = extractRoomAndNotes(message);

        if (
            /预算|聚餐|个人|搭配|推荐|套餐|怎么点/.test(message) &&
            !/直接加购|来一份/.test(message)
        ) {
            const peopleMatch = message.match(/(\d+)\s*(?:个人|人)/);
            const peopleCount = peopleMatch ? parseInt(peopleMatch[1], 10) : 3;

            let budget = 40000;
            const wanMatch = message.match(/(\d+(?:\.\d+)?)\s*万/);
            const numBudgetMatch = message.match(/(\d{4,6})\s*(?:韩元|块|원)?/);
            if (wanMatch) {
                budget = Math.round(parseFloat(wanMatch[1]) * 10000);
            } else if (numBudgetMatch) {
                budget = parseInt(numBudgetMatch[1], 10);
            }

            const preferNonSpicy = /不辣|不要太辣|少辣|不能吃辣/.test(message);
            const actions = [];

            if (budget >= 30000) {
                actions.push({
                    type: "add_pizza",
                    item_id: preferNonSpicy ? "pizza_bulgogi" : "pizza_volcano_chicken",
                    size: peopleCount >= 4 ? "L" : "M",
                    crust: "芝士饼边",
                    qty: 1
                });
                actions.push({
                    type: "add_standard",
                    item_id: "chicken_boneless",
                    qty: 1
                });
                if (budget >= 38000) {
                    actions.push({
                        type: "add_portion",
                        item_id: "rice_shrimp_fried",
                        portion: "small",
                        qty: 1
                    });
                }
                actions.push({
                    type: "add_standard",
                    item_id: "drink_cola_1250",
                    qty: 1
                });
            } else {
                actions.push({
                    type: "add_portion",
                    item_id: preferNonSpicy ? "rice_beef" : "rice_spicy_pork",
                    portion: "small",
                    qty: 1
                });
                actions.push({
                    type: "add_standard",
                    item_id: "snack_cheese_balls",
                    qty: 1
                });
                actions.push({
                    type: "add_standard",
                    item_id: "drink_cola_can",
                    qty: 1
                });
            }

            return {
                reply: `已为您按 ${peopleCount} 人、预算 ${budget.toLocaleString()} KRW 以内${preferNonSpicy ? "（不辣偏好）" : ""}生成高性价比搭配方案。点击下方按钮即可一键加入购物车：`,
                mode: "recommend",
                room_no: roomNo,
                order_note: { zh: noteZh, ko: noteKo },
                actions
            };
        }

        const actions = [];
        const cnNumMap = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5 };

        // Check for pizzas, rice, noodles, snacks, dumplings, drinks mentioned in text
        catalog.forEach((item) => {
            const cleanName = item.nameZh.replace(/\(.*?\)|（.*?）/g, "");
            if (message.includes(cleanName) || (cleanName === "可乐" && /可乐/.test(message))) {
                if (item.id === "drink_cola_500" && /大可乐|1\.25/.test(message)) return;
                if (item.id === "drink_cola_can" && /大可乐|1\.25|500/.test(message)) return;

                let qty = 1;
                const qtyRegex = new RegExp(`(\\d+|[一二两三四五])\\s*(?:份|个|只|瓶|听|罐)?\\s*[^，,。]*?${cleanName}`);
                const m = message.match(qtyRegex);
                if (m) {
                    qty = cnNumMap[m[1]] || parseInt(m[1], 10) || 1;
                }

                if (item.hasPizzaOption) {
                    const size = /大号|L号|大份|L/i.test(message) ? "L" : "M";
                    let crust = "原味";
                    if (/荔枝黄金/.test(message)) crust = "荔枝黄金脆皮";
                    else if (/芝士边|芝士饼边/.test(message)) crust = "芝士饼边";
                    else if (/黄金饼皮|黄金边/.test(message)) crust = "黄金饼皮";
                    else if (/脆皮|薄底/.test(message)) crust = "脆皮";

                    const toppings = {};
                    ["芝士", "玉米", "橄榄", "菠萝", "蔬菜"].forEach((t) => {
                        if (new RegExp(`加[^，,。]*${t}`).test(message)) {
                            toppings[t] = 1;
                        }
                    });

                    const sauces = {};
                    ["蒜香酱", "辣酱", "酸黄瓜"].forEach((s) => {
                        if (message.includes(s)) sauces[s] = 1;
                    });

                    actions.push({
                        type: "add_pizza",
                        item_id: item.id,
                        size,
                        crust,
                        toppings,
                        sauces,
                        drinks: {},
                        qty
                    });
                } else if (item.hasSizeOption) {
                    const portion = /大份/.test(message) ? "large" : "small";
                    actions.push({
                        type: "add_portion",
                        item_id: item.id,
                        portion,
                        qty
                    });
                } else {
                    actions.push({
                        type: "add_standard",
                        item_id: item.id,
                        qty
                    });
                }
            }
        });

        // Special shorthand for "大可乐" if not matched by exact full name
        if (/大可乐|1\.25L.*可乐/i.test(message) && !actions.some((a) => a.item_id === "drink_cola_1250")) {
            actions.push({
                type: "add_standard",
                item_id: "drink_cola_1250",
                qty: 1
            });
        }

        if (actions.length > 0) {
            return {
                reply: "已为您解析菜品与规格，并自动同步至购物车：",
                mode: "auto_apply",
                room_no: roomNo,
                order_note: { zh: noteZh, ko: noteKo },
                actions
            };
        }

        if (noteZh || roomNo) {
            return {
                reply: "已为您提取门牌号并将备注自动翻译为地道韩语外卖说明，已同步至订单小票：",
                mode: "note_only",
                room_no: roomNo,
                order_note: { zh: noteZh, ko: noteKo },
                actions: []
            };
        }

        return {
            reply: "您可以直接告诉我人数与预算（例如：“3个人4万韩元不辣配餐”）、具体菜品规格（例如：“大号烤牛肉披萨换芝士饼边”）或需要翻译的忌口备注（例如：“不要洋葱，放门口勿按铃”）。",
            mode: "note_only",
            room_no: "",
            order_note: { zh: "", ko: "" },
            actions: []
        };
    };

    // --- Render Assistant Bubble & Action Card ---
    const appendUserMessage = (text) => {
        const msgDiv = document.createElement("div");
        msgDiv.className = "ai-msg user";
        const bubble = document.createElement("div");
        bubble.className = "ai-msg-bubble";
        bubble.textContent = text;
        msgDiv.appendChild(bubble);
        aiMessages.appendChild(msgDiv);
        aiMessages.scrollTop = aiMessages.scrollHeight;
    };

    const renderAgentResponse = (data, sourceLabel = "") => {
        const msgDiv = document.createElement("div");
        msgDiv.className = "ai-msg assistant";

        const bubble = document.createElement("div");
        bubble.className = "ai-msg-bubble";
        bubble.textContent = data.reply || "已为您处理点单请求。";
        msgDiv.appendChild(bubble);

        if (sourceLabel) {
            aiEngineBadge.textContent = sourceLabel;
        }

        // Sync room number and bilingual note if present
        if (data.room_no) {
            window.OrderApp.setRoomNumber(data.room_no);
        }
        const noteZh = data.order_note?.zh || "";
        const noteKo = data.order_note?.ko || "";
        if (noteZh || noteKo) {
            window.OrderApp.appendBilingualNote(noteZh, noteKo);
        }

        // Deterministically resolve actions against menuCatalog
        let rawActions = Array.isArray(data.actions) ? data.actions : [];

        // Double safety fallback: if LLM only wrote dish names in `data.reply` and left `actions` empty,
        // automatically extract the mentioned dishes from `data.reply`!
        if (rawActions.length === 0 && data.reply) {
            const extractedFromReply = runLocalIntentEngine(data.reply);
            if (Array.isArray(extractedFromReply.actions) && extractedFromReply.actions.length > 0) {
                rawActions = extractedFromReply.actions;
            }
        }

        const resolvedActions = rawActions
            .map((act) => window.OrderApp.resolveAction(act))
            .filter(Boolean);

        if (resolvedActions.length > 0 || noteZh || noteKo || data.room_no) {
            const card = document.createElement("div");
            card.className = "ai-action-card";

            let totalKrw = 0;
            let itemsHtml = "";
            const roomVal = data.room_no || window.OrderApp.getRoomNumber() || "待填写";
            const receiptZhLines = ["【我的点单】", `门牌号: ${roomVal}`, "----------------"];
            const receiptKoLines = ["【나의 주문】", `호수: ${roomVal}`, "----------------"];

            resolvedActions.forEach((item) => {
                totalKrw += item.lineTotal || 0;
                itemsHtml += `
                    <div class="ai-card-item">
                        <span>${item.qty}x ${item.nameZh}</span>
                        <span>${(item.lineTotal || 0).toLocaleString()} KRW</span>
                    </div>
                `;
                receiptZhLines.push(`${item.qty}x ${item.nameZh} (${(item.lineTotal || 0).toLocaleString()})`);
                receiptKoLines.push(`${item.qty}x ${item.nameKo} (${(item.lineTotal || 0).toLocaleString()})`);
            });

            if (noteZh || noteKo) {
                receiptZhLines.push("----------------", `备注: ${noteZh || noteKo}`);
                receiptKoLines.push("----------------", `요청사항: ${noteKo || noteZh}`);
            }
            receiptZhLines.push("----------------", `总计: ${totalKrw.toLocaleString()} KRW`);
            receiptKoLines.push("----------------", `총액: ${totalKrw.toLocaleString()} KRW`);

            const fullBilingualTicket = `${receiptZhLines.join("\n")}\n\n${receiptKoLines.join("\n")}`;

            const modeTitle = data.mode === "recommend"
                ? "AI 预算配餐方案与双语小票 (确定性算价)"
                : "点单明细与中韩双语小票";

            let noteBlockHtml = "";
            if (data.room_no || noteZh || noteKo) {
                noteBlockHtml = `
                    <div class="ai-card-note">
                        ${data.room_no ? `<div><strong>门牌号:</strong> ${data.room_no}</div>` : ""}
                        ${noteZh ? `<div><strong>中文备注:</strong> ${noteZh}</div>` : ""}
                        ${noteKo ? `<div><strong>韩文转译:</strong> ${noteKo}</div>` : ""}
                    </div>
                `;
            }

            const ticketPreviewHtml = resolvedActions.length > 0
                ? `<details class="ai-ticket-details" open>
                       <summary>中韩双语微信小票预览 (可直接复制发给老板)</summary>
                       <pre class="ai-ticket-pre">${fullBilingualTicket}</pre>
                   </details>`
                : "";

            card.innerHTML = `
                <div class="ai-card-header">
                    <span>${modeTitle}</span>
                </div>
                ${itemsHtml}
                ${resolvedActions.length > 0 ? `
                    <div class="ai-card-total">
                        <span>合计金额</span>
                        <span>${totalKrw.toLocaleString()} KRW</span>
                    </div>
                ` : ""}
                ${noteBlockHtml}
                ${ticketPreviewHtml}
            `;

            if (resolvedActions.length > 0) {
                const actionBtn = document.createElement("button");
                actionBtn.type = "button";
                actionBtn.className = "ai-apply-btn";

                if (data.mode === "auto_apply") {
                    window.OrderApp.applyResolvedActions(resolvedActions);
                    actionBtn.textContent = "已加入购物车 — 点击复制双语小票发微信";
                    actionBtn.addEventListener("click", () => {
                        navigator.clipboard.writeText(fullBilingualTicket).then(() => {
                            window.OrderApp.showToast("双语小票已复制，请前往微信粘贴发送");
                        });
                    });
                } else {
                    actionBtn.textContent = `一键采纳加入购物车并复制双语小票 (${totalKrw.toLocaleString()} KRW)`;
                    actionBtn.addEventListener("click", () => {
                        if (!actionBtn.classList.contains("applied")) {
                            window.OrderApp.applyResolvedActions(resolvedActions);
                            actionBtn.classList.add("applied");
                        }
                        navigator.clipboard.writeText(fullBilingualTicket).then(() => {
                            actionBtn.textContent = "已加入购物车并复制中韩双语小票";
                            window.OrderApp.showToast("已加入购物车并复制双语小票，可直接粘贴至微信");
                        });
                    });
                }
                card.appendChild(actionBtn);
            }

            msgDiv.appendChild(card);
        }

        aiMessages.appendChild(msgDiv);
        aiMessages.scrollTop = aiMessages.scrollHeight;
    };

    const handleSendPrompt = async (promptText) => {
        const cleanText = (promptText || "").trim();
        if (!cleanText) return;

        const now = Date.now();
        if (now - lastSendTimestamp < COOLDOWN_MS) {
            window.OrderApp.showToast("发送太快，请稍候再试");
            return;
        }
        lastSendTimestamp = now;

        appendUserMessage(cleanText);
        aiUserInput.value = "";

        // Client-side pre-flight security & domain guardrail (Zero API Token cost)
        if (cleanText.length > MAX_INPUT_LENGTH) {
            renderAgentResponse(
                {
                    reply: `输入内容过长（限 ${MAX_INPUT_LENGTH} 字以内），请简明描述您的点单或忌口需求。`,
                    mode: "note_only",
                    room_no: "",
                    order_note: { zh: "", ko: "" },
                    actions: []
                },
                "安全护栏拦截"
            );
            return;
        }

        if (ABUSE_BLACKLIST_REGEX.test(cleanText)) {
            renderAgentResponse(
                {
                    reply: "安全护栏已触发：本助手仅提供店内点单、预算配餐与外卖备注韩语转译服务，不支持其他非餐饮请求。",
                    mode: "note_only",
                    room_no: "",
                    order_note: { zh: "", ko: "" },
                    actions: []
                },
                "安全护栏拦截"
            );
            return;
        }

        if (!ORDERING_DOMAIN_REGEX.test(cleanText)) {
            renderAgentResponse(
                {
                    reply: "我仅能协助您处理本店点单相关事宜。您可以输入人数预算（如“3人4万韩元配餐”）、具体菜品名称或忌口备注（如“不要洋葱，放门口”）。",
                    mode: "note_only",
                    room_no: "",
                    order_note: { zh: "", ko: "" },
                    actions: []
                },
                "领域边界拦截"
            );
            return;
        }

        aiSendBtn.disabled = true;
        aiSendBtn.textContent = "思考中...";

        try {
            const response = await fetch("/api/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: cleanText,
                    currentCart: window.OrderApp.getCartSummary(),
                    roomNo: window.OrderApp.getRoomNumber(),
                    customApiKey: savedApiKey
                })
            });

            if (response.ok) {
                const resJson = await response.json();
                if (!resJson.fallback && resJson.data) {
                    renderAgentResponse(resJson.data, "DeepSeek-V3 在线");
                    return;
                }
            }
        } catch (_err) {
            // Fall through to local deterministic engine when running without Netlify Function
        } finally {
            aiSendBtn.disabled = false;
            aiSendBtn.textContent = "发送";
        }

        // Local deterministic intent & translation engine fallback
        const localResult = runLocalIntentEngine(cleanText);
        renderAgentResponse(localResult, "本地确定性引擎");
    };

    aiInputForm.addEventListener("submit", (e) => {
        e.preventDefault();
        handleSendPrompt(aiUserInput.value);
    });

    aiChipsBar.addEventListener("click", (e) => {
        const chip = e.target.closest(".ai-chip");
        if (!chip) return;
        const prompt = chip.getAttribute("data-prompt");
        handleSendPrompt(prompt);
    });

    // Local automated demo state trigger for documentation screenshots
    if (isLocalEnv && window.location.search.includes("demo=customer_ai")) {
        setTimeout(() => {
            openDrawer();
            handleSendPrompt("我们3个人聚餐，预算40000韩元以内，不要太辣，帮我搭配一套有披萨有小吃的方案");
        }, 400);
    }
});
