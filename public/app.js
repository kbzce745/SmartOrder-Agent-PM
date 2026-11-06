document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("menu-container");
    const categoryTabs = document.getElementById("category-tabs");
    const cartBar = document.getElementById("cart-bar");
    const cartTotalCount = document.getElementById("cart-total-count");
    const cartTotalPrice = document.getElementById("cart-total-price");
    const openCartTrigger = document.getElementById("open-cart-trigger");
    const copyOrderBtn = document.getElementById("copy-order-btn");
    const clearCartBtn = document.getElementById("clear-cart-btn");
    const toast = document.getElementById("toast");
    const cartOverlay = document.getElementById("cart-overlay");
    const cartBackdrop = document.getElementById("cart-backdrop");
    const cartItemsList = document.getElementById("cart-items-list");
    const closeCartBtn = document.getElementById("close-cart-btn");
    const roomNumberInput = document.getElementById("room-number");
    const orderNoteZhInput = document.getElementById("order-note-zh");
    const orderNoteKoInput = document.getElementById("order-note-ko");
    const quickNoteTags = document.getElementById("quick-note-tags");
    const clearNotesBtn = document.getElementById("clear-notes-btn");

    const pizzaModal = document.getElementById("pizza-modal");
    const pizzaBackdrop = document.getElementById("pizza-backdrop");
    const closePizzaModal = document.getElementById("close-pizza-modal");
    const pizzaModalBody = document.getElementById("pizza-modal-body");
    const pizzaModalTitle = document.getElementById("pizza-modal-title");
    const pizzaModalPrice = document.getElementById("pizza-modal-price");
    const pizzaModalAddBtn = document.getElementById("pizza-modal-add-btn");

    // Map: cartKey -> { baseId, priceNum, quantity, nameZh, nameKo }
    const cart = {};
    // Map: item.id -> item metadata from menu.json
    const menuCatalog = {};
    let initialMenuPagesBackup = [];
    let menuPagesData = [];

    const PIZZA_OPTIONS = {
        sizes: [
            { name: "M", koName: "M", price: 0 },
            { name: "L", koName: "L", price: 4000 }
        ],
        crusts: [
            { name: "原味", koName: "오리지널", price: 0 },
            { name: "芝士饼边", koName: "치즈 크러스트", price: 3000 },
            { name: "脆皮", koName: "씬 크러스트", price: 1000 },
            { name: "黄金饼皮", koName: "골드 크러스트", price: 3000 },
            { name: "荔枝黄金脆皮", koName: "리치골드 크러스트", price: 5000 }
        ],
        toppings: [
            { name: "芝士", koName: "치즈", price: 1000 },
            { name: "玉米", koName: "옥수수", price: 1000 },
            { name: "橄榄", koName: "올리브", price: 1000 },
            { name: "菠萝", koName: "파인애플", price: 1000 },
            { name: "蔬菜", koName: "야채", price: 1000 }
        ],
        sauces: [
            { name: "蒜香酱", koName: "갈릭 소스", price: 300 },
            { name: "辣酱", koName: "핫 소스", price: 200 },
            { name: "酸黄瓜", koName: "피클", price: 500 }
        ],
        drinks: [
            { name: "可口可乐500ML", koName: "코카콜라 500ML", price: 1800 },
            { name: "可口可乐1.25L", koName: "코카콜라 1.25L", price: 2500 },
            { name: "雪碧500ML", koName: "스프라이트 500ML", price: 1800 },
            { name: "雪碧1.25L", koName: "스프라이트 1.25L", price: 2500 }
        ]
    };

    let currentPizzaBase = null;
    let pizzaState = {
        size: "M",
        crust: "原味",
        toppings: {},
        sauces: {},
        drinks: {}
    };

    const parsePrice = (priceStr) => {
        return parseInt(String(priceStr).replace(/,/g, ""), 10) || 0;
    };

    const showToast = (msg = "复制成功，请前往微信粘贴发送给老板") => {
        toast.textContent = msg;
        toast.classList.add("show");
        setTimeout(() => {
            toast.classList.remove("show");
        }, 2200);
    };

    const updateCartUI = () => {
        let total = 0;
        let totalQty = 0;
        let hasItems = false;

        cartItemsList.innerHTML = "";

        for (const [id, item] of Object.entries(cart)) {
            if (item.quantity > 0) {
                total += item.priceNum * item.quantity;
                totalQty += item.quantity;
                hasItems = true;

                const escapedId = id.replace(/"/g, "&quot;");
                const row = document.createElement("div");
                row.className = "cart-item-row";
                row.innerHTML = `
                    <div class="cart-item-info">
                        <span class="cart-item-name">${item.nameZh}</span>
                        <span class="cart-item-koname">${item.nameKo}</span>
                        <span class="cart-item-price">${(item.priceNum * item.quantity).toLocaleString()} KRW</span>
                    </div>
                    <div class="quantity-controls">
                        <button class="qty-btn cart-minus" data-id="${escapedId}" type="button">-</button>
                        <span class="qty-count">${item.quantity}</span>
                        <button class="qty-btn cart-plus" data-id="${escapedId}" type="button">+</button>
                    </div>
                `;
                cartItemsList.appendChild(row);
            }
        }

        if (hasItems) {
            cartTotalCount.textContent = String(totalQty);
            cartTotalPrice.textContent = total.toLocaleString();
            cartBar.classList.remove("hidden");
        } else {
            cartTotalCount.textContent = "0";
            cartBar.classList.add("hidden");
            cartOverlay.classList.add("hidden");
        }

        // Update inline counters for standard and portion items
        document.querySelectorAll(".qty-count[data-counter-id]").forEach((span) => {
            const id = span.getAttribute("data-counter-id");
            span.textContent = cart[id] && cart[id].quantity > 0 ? String(cart[id].quantity) : "0";
        });

        // Update pizza buttons badge
        document.querySelectorAll(".spec-btn").forEach((btn) => {
            const baseId = btn.getAttribute("data-baseid");
            let pizzaCount = 0;
            for (const [id, item] of Object.entries(cart)) {
                if ((item.baseId === baseId || id.startsWith(`PIZZA_${baseId}_`)) && item.quantity > 0) {
                    pizzaCount += item.quantity;
                }
            }
            if (pizzaCount > 0) {
                btn.textContent = `已选 ${pizzaCount}`;
                btn.style.background = "#d97706";
            } else {
                btn.textContent = "选规格";
                btn.style.background = "var(--accent)";
            }
        });
    };

    const handleQtyChange = (id, delta, itemData = null) => {
        if (!cart[id]) {
            if (!itemData) return;
            cart[id] = {
                baseId: itemData.baseId || id,
                priceNum: itemData.priceNum,
                quantity: 0,
                nameZh: itemData.nameZh,
                nameKo: itemData.nameKo
            };
        }

        let newQty = cart[id].quantity + delta;
        if (newQty < 0) newQty = 0;

        cart[id].quantity = newQty;
        updateCartUI();
    };

    // --- Quick Bilingual Note Tags ---
    const syncQuickNoteTagsUI = () => {
        const zhVal = orderNoteZhInput.value;
        quickNoteTags.querySelectorAll(".note-tag").forEach((btn) => {
            const tagZh = btn.getAttribute("data-zh");
            if (zhVal.includes(tagZh)) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
    };

    const appendBilingualNote = (zhText, koText) => {
        const cleanZh = (zhText || "").trim();
        const cleanKo = (koText || "").trim();
        if (cleanZh) {
            const currentZh = orderNoteZhInput.value.trim();
            if (!currentZh.includes(cleanZh)) {
                orderNoteZhInput.value = currentZh ? `${currentZh}；${cleanZh}` : cleanZh;
            }
        }
        if (cleanKo) {
            const currentKo = orderNoteKoInput.value.trim();
            if (!currentKo.includes(cleanKo)) {
                orderNoteKoInput.value = currentKo ? `${currentKo}; ${cleanKo}` : cleanKo;
            }
        }
        syncQuickNoteTagsUI();
    };

    quickNoteTags.addEventListener("click", (e) => {
        const btn = e.target.closest(".note-tag");
        if (!btn) return;
        const tagZh = btn.getAttribute("data-zh");
        const tagKo = btn.getAttribute("data-ko");

        const zhParts = orderNoteZhInput.value.split(/[；;,，]/).map((s) => s.trim()).filter(Boolean);
        const koParts = orderNoteKoInput.value.split(/[;；]/).map((s) => s.trim()).filter(Boolean);

        if (zhParts.includes(tagZh)) {
            orderNoteZhInput.value = zhParts.filter((p) => p !== tagZh).join("；");
            orderNoteKoInput.value = koParts.filter((p) => p !== tagKo).join("; ");
        } else {
            zhParts.push(tagZh);
            koParts.push(tagKo);
            orderNoteZhInput.value = zhParts.join("；");
            orderNoteKoInput.value = koParts.join("; ");
        }
        syncQuickNoteTagsUI();
    });

    clearNotesBtn.addEventListener("click", () => {
        orderNoteZhInput.value = "";
        orderNoteKoInput.value = "";
        syncQuickNoteTagsUI();
    });

    orderNoteZhInput.addEventListener("input", syncQuickNoteTagsUI);

    // --- Cart Overlay Events ---
    openCartTrigger.addEventListener("click", () => {
        cartOverlay.classList.remove("hidden");
    });
    closeCartBtn.addEventListener("click", () => cartOverlay.classList.add("hidden"));
    cartBackdrop.addEventListener("click", () => cartOverlay.classList.add("hidden"));

    clearCartBtn.addEventListener("click", () => {
        Object.keys(cart).forEach((k) => {
            cart[k].quantity = 0;
        });
        updateCartUI();
        showToast("已清空购物车");
    });

    cartItemsList.addEventListener("click", (e) => {
        if (e.target.classList.contains("cart-minus") || e.target.classList.contains("cart-plus")) {
            const id = e.target.getAttribute("data-id");
            const delta = e.target.classList.contains("cart-plus") ? 1 : -1;
            handleQtyChange(id, delta);
        }
    });

    copyOrderBtn.addEventListener("click", () => {
        let total = 0;
        let hasItems = false;
        for (const item of Object.values(cart)) {
            if (item.quantity > 0) hasItems = true;
        }
        if (!hasItems) return;

        const roomNo = roomNumberInput.value.trim();
        if (!roomNo) {
            showToast("请先填写您的门牌号或房间号");
            cartOverlay.classList.remove("hidden");
            roomNumberInput.focus();
            return;
        }

        const noteZh = orderNoteZhInput.value.trim();
        const noteKo = orderNoteKoInput.value.trim();

        const orderLinesZh = ["【我的点单】", `门牌号: ${roomNo}`, "----------------"];
        const orderLinesKo = ["【나의 주문】", `호수: ${roomNo}`, "----------------"];

        for (const item of Object.values(cart)) {
            if (item.quantity > 0) {
                const lineTotal = item.priceNum * item.quantity;
                total += lineTotal;
                orderLinesZh.push(`${item.quantity}x ${item.nameZh} (${lineTotal.toLocaleString()})`);
                orderLinesKo.push(`${item.quantity}x ${item.nameKo} (${lineTotal.toLocaleString()})`);
            }
        }

        if (noteZh || noteKo) {
            orderLinesZh.push("----------------");
            orderLinesZh.push(`备注: ${noteZh || noteKo}`);
            orderLinesKo.push("----------------");
            orderLinesKo.push(`요청사항: ${noteKo || noteZh}`);
        }

        orderLinesZh.push("----------------");
        orderLinesZh.push(`总计: ${total.toLocaleString()} KRW`);

        orderLinesKo.push("----------------");
        orderLinesKo.push(`총액: ${total.toLocaleString()} KRW`);

        const orderText = `${orderLinesZh.join("\n")}\n\n${orderLinesKo.join("\n")}`;

        navigator.clipboard.writeText(orderText).then(() => {
            showToast("复制成功，请前往微信粘贴发送给老板");
        }).catch(() => {
            showToast("复制失败，请手动重试");
        });
    });

    // --- Deterministic Pizza Calculation Helper ---
    const buildPizzaCartItem = (baseItem, spec = {}) => {
        const sizeOpt = PIZZA_OPTIONS.sizes.find((s) => s.name === (spec.size || "M")) || PIZZA_OPTIONS.sizes[0];
        const crustOpt = PIZZA_OPTIONS.crusts.find((c) => c.name === (spec.crust || "原味")) || PIZZA_OPTIONS.crusts[0];

        let unitPrice = baseItem.priceNum + sizeOpt.price + crustOpt.price;
        const partsZh = [sizeOpt.name, crustOpt.name];
        const partsKo = [sizeOpt.koName, crustOpt.koName];

        ["toppings", "sauces", "drinks"].forEach((cat) => {
            const catMap = spec[cat] || {};
            for (const [optName, rawQty] of Object.entries(catMap)) {
                const qty = Math.min(Math.max(parseInt(rawQty, 10) || 0, 0), 10);
                if (qty > 0) {
                    const optDef = PIZZA_OPTIONS[cat].find((o) => o.name === optName);
                    if (optDef) {
                        unitPrice += optDef.price * qty;
                        partsZh.push(`${optDef.name}x${qty}`);
                        partsKo.push(`${optDef.koName}x${qty}`);
                    }
                }
            }
        });

        const fullNameZh = `${baseItem.nameZh} (${partsZh.join(", ")})`;
        const fullNameKo = `${baseItem.nameKo} (${partsKo.join(", ")})`;
        const uniqueId = `PIZZA_${baseItem.id}_${partsZh.join("_").replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, "")}`;

        return {
            cartKey: uniqueId,
            baseId: baseItem.id,
            priceNum: unitPrice,
            nameZh: fullNameZh,
            nameKo: fullNameKo
        };
    };

    // --- Pizza Modal Logic ---
    const openPizzaModal = (baseId, nameZh, nameKo, priceStr) => {
        currentPizzaBase = {
            id: baseId,
            nameZh,
            nameKo,
            priceNum: parsePrice(priceStr)
        };
        pizzaState = { size: "M", crust: "原味", toppings: {}, sauces: {}, drinks: {} };

        pizzaModalTitle.textContent = `${nameZh} (${nameKo})`;
        renderPizzaModalBody();
        updatePizzaModalPrice();
        pizzaModal.classList.remove("hidden");
    };

    closePizzaModal.addEventListener("click", () => pizzaModal.classList.add("hidden"));
    pizzaBackdrop.addEventListener("click", () => pizzaModal.classList.add("hidden"));

    const updatePizzaModalPrice = () => {
        const built = buildPizzaCartItem(currentPizzaBase, pizzaState);
        pizzaModalPrice.textContent = built.priceNum.toLocaleString();
    };

    const renderPizzaModalBody = () => {
        let html = `<div class="options-section"><h3>尺寸 (必选)</h3><div class="radio-group">`;
        PIZZA_OPTIONS.sizes.forEach((s) => {
            const checked = pizzaState.size === s.name ? "checked" : "";
            const priceText = s.price > 0 ? ` (+${s.price.toLocaleString()})` : "";
            html += `<label class="radio-label"><input type="radio" name="p_size" value="${s.name}" ${checked}>${s.name}${priceText}</label>`;
        });
        html += `</div></div>`;

        html += `<div class="options-section"><h3>面团种类 (必选)</h3><div class="radio-group">`;
        PIZZA_OPTIONS.crusts.forEach((c) => {
            const checked = pizzaState.crust === c.name ? "checked" : "";
            const priceText = c.price > 0 ? ` (+${c.price.toLocaleString()})` : "";
            html += `<label class="radio-label"><input type="radio" name="p_crust" value="${c.name}" ${checked}>${c.name}${priceText}</label>`;
        });
        html += `</div></div>`;

        const renderStepperList = (title, categoryData, stateKey) => {
            let section = `<div class="options-section"><h3>${title} (最多 10 份)</h3>`;
            categoryData.forEach((opt) => {
                const qty = pizzaState[stateKey][opt.name] || 0;
                section += `
                <div class="stepper-row">
                    <div class="stepper-info">
                        <span class="stepper-name">${opt.name} (${opt.koName})</span>
                        <span class="stepper-price">+${opt.price.toLocaleString()}</span>
                    </div>
                    <div class="stepper-controls">
                        <button class="stepper-btn pizza-minus" data-cat="${stateKey}" data-opt="${opt.name}" type="button">-</button>
                        <span>${qty}</span>
                        <button class="stepper-btn pizza-plus" data-cat="${stateKey}" data-opt="${opt.name}" type="button">+</button>
                    </div>
                </div>`;
            });
            section += `</div>`;
            return section;
        };

        html += renderStepperList("添加配料", PIZZA_OPTIONS.toppings, "toppings");
        html += renderStepperList("添加酱料", PIZZA_OPTIONS.sauces, "sauces");
        html += renderStepperList("添加饮料", PIZZA_OPTIONS.drinks, "drinks");

        pizzaModalBody.innerHTML = html;
    };

    pizzaModalBody.addEventListener("change", (e) => {
        if (e.target.name === "p_size") pizzaState.size = e.target.value;
        if (e.target.name === "p_crust") pizzaState.crust = e.target.value;
        updatePizzaModalPrice();
    });

    pizzaModalBody.addEventListener("click", (e) => {
        if (e.target.classList.contains("pizza-minus") || e.target.classList.contains("pizza-plus")) {
            const cat = e.target.getAttribute("data-cat");
            const opt = e.target.getAttribute("data-opt");
            const delta = e.target.classList.contains("pizza-plus") ? 1 : -1;

            let qty = pizzaState[cat][opt] || 0;
            qty = Math.min(Math.max(qty + delta, 0), 10);

            pizzaState[cat][opt] = qty;
            renderPizzaModalBody();
            updatePizzaModalPrice();
        }
    });

    pizzaModalAddBtn.addEventListener("click", () => {
        const built = buildPizzaCartItem(currentPizzaBase, pizzaState);
        handleQtyChange(built.cartKey, 1, built);
        pizzaModal.classList.add("hidden");
        showToast(`已加入购物车：${built.nameZh}`);
    });

    // --- Category Navigation & Scroll Spy ---
    categoryTabs.addEventListener("click", (e) => {
        const tab = e.target.closest(".cat-tab");
        if (!tab) return;
        const cat = tab.getAttribute("data-category");
        const firstCard = document.querySelector(`.menu-page-card[data-category="${cat}"]`);
        if (firstCard) {
            firstCard.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        categoryTabs.querySelectorAll(".cat-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
    });

    window.addEventListener("scroll", () => {
        const cards = document.querySelectorAll(".menu-page-card");
        let currentCategory = null;
        for (const card of cards) {
            const rect = card.getBoundingClientRect();
            if (rect.top <= 140 && rect.bottom >= 140) {
                currentCategory = card.getAttribute("data-category");
                break;
            }
        }
        if (currentCategory) {
            categoryTabs.querySelectorAll(".cat-tab").forEach((t) => {
                t.classList.toggle("active", t.getAttribute("data-category") === currentCategory);
            });
        }
    }, { passive: true });

    // --- Render Main Menu Function (Supports Live Hot-Reload from Merchant Agent) ---
    const renderMenuPages = (data) => {
        menuPagesData = data;
        Object.keys(menuCatalog).forEach((k) => delete menuCatalog[k]);
        container.innerHTML = "";

        if (!data || data.length === 0) {
            container.innerHTML = "<p class=\"loader\">暂无菜单数据</p>";
            return;
        }

        data.forEach((menuPage, pageIndex) => {
            const card = document.createElement("div");
            card.className = "menu-page-card";
            card.setAttribute("data-category", menuPage.category || "other");

            const itemsHtml = menuPage.items.map((item, itemIndex) => {
                const id = item.id || `item_${pageIndex}_${itemIndex}`;
                const nameZh = item.name;
                const nameKo = item.ko_name || item.name;
                const basePriceNum = parsePrice(item.price);

                menuCatalog[id] = {
                    id,
                    nameZh,
                    nameKo,
                    priceStr: item.price,
                    priceNum: basePriceNum,
                    category: menuPage.category || "other",
                    hasPizzaOption: Boolean(item.has_pizza_option),
                    hasSizeOption: Boolean(item.has_size_option),
                    spicy: Boolean(item.spicy),
                    tags: item.tags || []
                };

                const escapedNameZh = nameZh.replace(/"/g, "&quot;");
                const escapedNameKo = nameKo.replace(/"/g, "&quot;");

                if (item.has_pizza_option) {
                    return `
                    <div class="menu-item-row">
                        <div class="menu-item-info">
                            <div class="menu-item-title-wrap">
                                <span class="menu-item-name">${nameZh}</span>
                                <span class="menu-item-koname">${nameKo}</span>
                            </div>
                            <span class="menu-item-price">${item.price}起</span>
                        </div>
                        <div class="quantity-controls">
                            <button class="spec-btn" data-baseid="${id}" data-name="${escapedNameZh}" data-nameko="${escapedNameKo}" data-price="${item.price}" type="button">选规格</button>
                        </div>
                    </div>
                    `;
                } else if (item.has_size_option) {
                    const idSmall = `${id}_small`;
                    const idLarge = `${id}_large`;
                    const largePriceNum = basePriceNum + 3000;
                    const largePriceStr = largePriceNum.toLocaleString();

                    return `
                    <div class="menu-item-group">
                        <div class="menu-item-name-header">
                            <span>${nameZh}</span>
                            <span class="menu-item-koname">${nameKo}</span>
                        </div>
                        <div class="menu-item-row sub-item">
                            <div class="menu-item-info">
                                <span class="menu-item-name">小份 (소)</span>
                                <span class="menu-item-price">${item.price}</span>
                            </div>
                            <div class="quantity-controls">
                                <button class="qty-btn minus" data-id="${idSmall}" data-baseid="${id}" data-name="${escapedNameZh} (小份)" data-nameko="${escapedNameKo} (소)" data-price="${basePriceNum}" type="button">-</button>
                                <span class="qty-count" data-counter-id="${idSmall}">0</span>
                                <button class="qty-btn plus" data-id="${idSmall}" data-baseid="${id}" data-name="${escapedNameZh} (小份)" data-nameko="${escapedNameKo} (소)" data-price="${basePriceNum}" type="button">+</button>
                            </div>
                        </div>
                        <div class="menu-item-row sub-item">
                            <div class="menu-item-info">
                                <span class="menu-item-name">大份 (대 +3,000)</span>
                                <span class="menu-item-price">${largePriceStr}</span>
                            </div>
                            <div class="quantity-controls">
                                <button class="qty-btn minus" data-id="${idLarge}" data-baseid="${id}" data-name="${escapedNameZh} (大份)" data-nameko="${escapedNameKo} (대)" data-price="${largePriceNum}" type="button">-</button>
                                <span class="qty-count" data-counter-id="${idLarge}">0</span>
                                <button class="qty-btn plus" data-id="${idLarge}" data-baseid="${id}" data-name="${escapedNameZh} (大份)" data-nameko="${escapedNameKo} (대)" data-price="${largePriceNum}" type="button">+</button>
                            </div>
                        </div>
                    </div>
                    `;
                } else {
                    return `
                    <div class="menu-item-row">
                        <div class="menu-item-info">
                            <div class="menu-item-title-wrap">
                                <span class="menu-item-name">${nameZh}</span>
                                <span class="menu-item-koname">${nameKo}</span>
                            </div>
                            <span class="menu-item-price">${item.price}</span>
                        </div>
                        <div class="quantity-controls">
                            <button class="qty-btn minus" data-id="${id}" data-baseid="${id}" data-name="${escapedNameZh}" data-nameko="${escapedNameKo}" data-price="${basePriceNum}" type="button">-</button>
                            <span class="qty-count" data-counter-id="${id}">0</span>
                            <button class="qty-btn plus" data-id="${id}" data-baseid="${id}" data-name="${escapedNameZh}" data-nameko="${escapedNameKo}" data-price="${basePriceNum}" type="button">+</button>
                        </div>
                    </div>
                    `;
                }
            }).join("");

            card.innerHTML = `
                <div class="page-category-header">
                    <span class="page-category-title">${menuPage.category_name || "菜单"}</span>
                    <span class="page-category-ko">${menuPage.category_ko || ""}</span>
                </div>
                <div class="page-img-container">
                    <img src="${menuPage.image}" loading="lazy" alt="${menuPage.category_name || "Menu Photo"}">
                </div>
                <div class="menu-items-list">
                    ${itemsHtml}
                </div>
            `;
            container.appendChild(card);
        });

        updateCartUI();
    };

    container.addEventListener("click", (e) => {
        const target = e.target;
        if (target.classList.contains("qty-btn")) {
            const id = target.getAttribute("data-id");
            const baseId = target.getAttribute("data-baseid") || id;
            const nameZh = target.getAttribute("data-name");
            const nameKo = target.getAttribute("data-nameko");
            const priceNum = parseInt(target.getAttribute("data-price"), 10);
            const delta = target.classList.contains("plus") ? 1 : -1;
            handleQtyChange(id, delta, {
                baseId,
                priceNum,
                nameZh,
                nameKo
            });
        } else if (target.classList.contains("spec-btn")) {
            const baseId = target.getAttribute("data-baseid");
            const nameZh = target.getAttribute("data-name");
            const nameKo = target.getAttribute("data-nameko");
            const priceStr = target.getAttribute("data-price");
            openPizzaModal(baseId, nameZh, nameKo, priceStr);
        }
    });

    fetch("menu.json")
        .then((response) => {
            if (!response.ok) throw new Error("Network response was not ok");
            return response.json();
        })
        .then((data) => {
            initialMenuPagesBackup = JSON.parse(JSON.stringify(data));
            renderMenuPages(data);
        })
        .catch((error) => {
            console.error("Error fetching menu data:", error);
            container.innerHTML = "<div class=\"loader\">菜单加载失败，请刷新重试</div>";
        });

    // --- Deterministic Agent Action Resolver & Public API ---
    const resolveAction = (action) => {
        if (!action || !action.type) return null;
        if (action.type === "clear_cart") {
            return { type: "clear_cart", qty: 1, priceNum: 0, nameZh: "清空购物车", nameKo: "장바구니 비우기" };
        }

        const baseItem = menuCatalog[action.item_id];
        if (!baseItem) return null;

        const qty = Math.min(Math.max(parseInt(action.qty, 10) || 1, 1), 20);

        if (baseItem.hasPizzaOption || action.type === "add_pizza") {
            const built = buildPizzaCartItem(baseItem, {
                size: action.size || "M",
                crust: action.crust || "原味",
                toppings: action.toppings || {},
                sauces: action.sauces || {},
                drinks: action.drinks || {}
            });
            return {
                ...built,
                qty,
                lineTotal: built.priceNum * qty
            };
        }

        if (baseItem.hasSizeOption || action.type === "add_portion") {
            const isLarge = action.portion === "large";
            const cartKey = `${baseItem.id}_${isLarge ? "large" : "small"}`;
            const unitPrice = isLarge ? baseItem.priceNum + 3000 : baseItem.priceNum;
            const nameZh = `${baseItem.nameZh} (${isLarge ? "大份" : "小份"})`;
            const nameKo = `${baseItem.nameKo} (${isLarge ? "대" : "소"})`;
            return {
                cartKey,
                baseId: baseItem.id,
                priceNum: unitPrice,
                nameZh,
                nameKo,
                qty,
                lineTotal: unitPrice * qty
            };
        }

        return {
            cartKey: baseItem.id,
            baseId: baseItem.id,
            priceNum: baseItem.priceNum,
            nameZh: baseItem.nameZh,
            nameKo: baseItem.nameKo,
            qty,
            lineTotal: baseItem.priceNum * qty
        };
    };

    const applyResolvedActions = (resolvedList) => {
        let addedCount = 0;
        resolvedList.forEach((item) => {
            if (!item) return;
            if (item.type === "clear_cart") {
                Object.keys(cart).forEach((k) => {
                    cart[k].quantity = 0;
                });
                updateCartUI();
                return;
            }
            handleQtyChange(item.cartKey, item.qty, {
                baseId: item.baseId,
                priceNum: item.priceNum,
                nameZh: item.nameZh,
                nameKo: item.nameKo
            });
            addedCount += item.qty;
        });
        return addedCount;
    };

    window.OrderApp = {
        getMenuCatalog: () => menuCatalog,
        getMenuPages: () => menuPagesData,
        updateMenuPages: (newPages) => {
            renderMenuPages(newPages);
        },
        resetMenuPages: () => {
            const restored = JSON.parse(JSON.stringify(initialMenuPagesBackup));
            renderMenuPages(restored);
            return restored;
        },
        getCartSummary: () => {
            return Object.values(cart)
                .filter((i) => i.quantity > 0)
                .map((i) => ({
                    nameZh: i.nameZh,
                    nameKo: i.nameKo,
                    qty: i.quantity,
                    unitPrice: i.priceNum
                }));
        },
        getRoomNumber: () => roomNumberInput.value.trim(),
        setRoomNumber: (roomNo) => {
            if (roomNo && String(roomNo).trim()) {
                roomNumberInput.value = String(roomNo).trim();
            }
        },
        appendBilingualNote,
        resolveAction,
        applyResolvedActions,
        showToast
    };
});
