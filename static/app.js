/* ===== 商品爬蟲前端邏輯 ===== */

const form        = document.getElementById("searchForm");
const keywordEl   = document.getElementById("keyword");
const searchBtn   = document.getElementById("searchBtn");
const statusEl    = document.getElementById("status");
const resultsEl   = document.getElementById("results");
const sortBar     = document.getElementById("sortBar");
const countEl     = document.getElementById("resultCount");
const filterBar   = document.getElementById("filterBar");
const priceMinEl  = document.getElementById("priceMin");
const priceMaxEl  = document.getElementById("priceMax");
const reviewMinEl = document.getElementById("reviewMin");
const oneStarMaxEl= document.getElementById("oneStarMax");
const salesMinEl  = document.getElementById("salesMin");
const filterBtn   = document.getElementById("filterBtn");
const filterClear = document.getElementById("filterClear");
const sourceFilterGroup = document.getElementById("sourceFilterGroup");
const sourceStats = document.getElementById("sourceStats");
const darkToggle  = document.getElementById("darkToggle");
const backToTop   = document.getElementById("backToTop");
const historyDrop = document.getElementById("historyDropdown");

let currentProducts = [];
let currentView = "grid";

/* ---------- 深色模式 ---------- */
(function initDark() {
    if (localStorage.getItem("dark") === "1") {
        document.body.classList.add("dark");
        darkToggle.textContent = "☀️";
    }
})();
darkToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem("dark", isDark ? "1" : "0");
    darkToggle.textContent = isDark ? "☀️" : "🌙";
});

/* ---------- 回到頂部 ---------- */
window.addEventListener("scroll", () => {
    backToTop.classList.toggle("hidden", window.scrollY < 400);
});
backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

/* ---------- 搜尋歷史 ---------- */
const HISTORY_KEY = "searchHistory";
const MAX_HISTORY = 10;

function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch { return []; }
}
function saveHistory(kw) {
    let h = getHistory().filter(x => x !== kw);
    h.unshift(kw);
    if (h.length > MAX_HISTORY) h = h.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
}
function removeHistory(kw) {
    const h = getHistory().filter(x => x !== kw);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
    renderHistory();
}
function clearAllHistory() {
    localStorage.removeItem(HISTORY_KEY);
    hideHistory();
}
function renderHistory() {
    const h = getHistory();
    if (h.length === 0) { hideHistory(); return; }
    historyDrop.innerHTML =
        `<div class="history-header"><span>搜尋紀錄</span><span onclick="clearAllHistory()">全部清除</span></div>` +
        h.map(kw => `<div class="history-item" data-kw="${escapeHtml(kw)}">
            <span class="history-text">${escapeHtml(kw)}</span>
            <span class="del-history" title="刪除">✕</span>
        </div>`).join("");
    historyDrop.classList.remove("hidden");
}
function hideHistory() { historyDrop.classList.add("hidden"); }
// Make clearAllHistory accessible from inline onclick
window.clearAllHistory = clearAllHistory;

keywordEl.addEventListener("focus", renderHistory);
keywordEl.addEventListener("input", () => {
    if (keywordEl.value.trim()) hideHistory();
    else renderHistory();
});
document.addEventListener("click", (e) => {
    if (!historyDrop.contains(e.target) && e.target !== keywordEl) hideHistory();
});
historyDrop.addEventListener("click", (e) => {
    const del = e.target.closest(".del-history");
    if (del) { e.stopPropagation(); removeHistory(del.closest(".history-item").dataset.kw); return; }
    const item = e.target.closest(".history-item");
    if (item) { keywordEl.value = item.dataset.kw; hideHistory(); form.requestSubmit(); }
});

/* ---------- 搜尋 ---------- */
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const keyword = keywordEl.value.trim();
    if (!keyword) return;

    const checked = [...form.querySelectorAll('input[name="sources"]:checked')];
    if (checked.length === 0) {
        showStatus("請至少選擇一個搜尋平台", "error");
        return;
    }

    const maxItems = document.getElementById("maxItems").value;
    const params = new URLSearchParams();
    params.append("keyword", keyword);
    checked.forEach(c => params.append("sources", c.value));
    params.append("max_items", maxItems);

    // UI 狀態
    searchBtn.disabled = true;
    sortBar.classList.add("hidden");
    filterBar.classList.add("hidden");
    showStatus('<span class="spinner"></span> 正在搜尋，請稍候…', "loading");
    showSkeletons();
    saveHistory(keyword);
    hideHistory();

    try {
        const resp = await fetch("/api/search?" + params.toString());
        const data = await resp.json();

        if (!resp.ok) {
            showStatus(data.error || "搜尋失敗", "error");
            resultsEl.innerHTML = "";
            return;
        }

        currentProducts = data.products || [];

        if (currentProducts.length === 0) {
            showStatus("找不到相關商品，請嘗試其他關鍵字", "error");
            resultsEl.innerHTML = "";
            return;
        }

        hideStatus();
        updateResultInfo(data.keyword);
        sortBar.classList.remove("hidden");
        filterBar.classList.remove("hidden");
        priceMinEl.value = "";
        priceMaxEl.value = "";
        reviewMinEl.value = "";
        oneStarMaxEl.value = "";
        salesMinEl.value = "";
        buildSourceFilterCheckboxes(currentProducts);
        resetSortButtons();
        renderProducts(currentProducts);

    } catch (err) {
        showStatus("網路錯誤，請稍後再試", "error");
        resultsEl.innerHTML = "";
        console.error(err);
    } finally {
        searchBtn.disabled = false;
    }
});

/* ---------- 排序 ---------- */
sortBar.addEventListener("click", (e) => {
    const sortBtnEl = e.target.closest(".sort-btn");
    const viewBtnEl = e.target.closest(".view-btn");

    if (sortBtnEl) {
        sortBar.querySelectorAll(".sort-btn").forEach(b => b.classList.remove("active"));
        sortBtnEl.classList.add("active");
        renderFiltered(sortBtnEl.dataset.sort);
    }

    if (viewBtnEl) {
        sortBar.querySelectorAll(".view-btn").forEach(b => b.classList.remove("active"));
        viewBtnEl.classList.add("active");
        currentView = viewBtnEl.dataset.view;
        resultsEl.classList.toggle("list-view", currentView === "list");
    }
});

/* ---------- 價格 + 條件篩選（複選） ---------- */
filterBtn.addEventListener("click", () => renderFiltered(getActiveSort()));
filterClear.addEventListener("click", () => {
    priceMinEl.value = "";
    priceMaxEl.value = "";
    reviewMinEl.value = "";
    oneStarMaxEl.value = "";
    salesMinEl.value = "";
    // 勾回全部平台
    sourceFilterGroup.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
    renderFiltered(getActiveSort());
});

function getActiveSort() {
    const active = sortBar.querySelector(".sort-btn.active");
    return active ? active.dataset.sort : "default";
}

function renderFiltered(sortMode) {
    let filtered = [...currentProducts];

    // 平台篩選（複選）
    const checkedSources = [...sourceFilterGroup.querySelectorAll('input:checked')].map(cb => cb.value);
    if (checkedSources.length > 0 && checkedSources.length < sourceFilterGroup.querySelectorAll('input').length) {
        filtered = filtered.filter(p => checkedSources.includes(p.source));
    }

    // 價格區間
    const pMin = parseInt(priceMinEl.value, 10);
    const pMax = parseInt(priceMaxEl.value, 10);
    if (!isNaN(pMin)) filtered = filtered.filter(p => parsePrice(p.price) >= pMin);
    if (!isNaN(pMax)) filtered = filtered.filter(p => parsePrice(p.price) <= pMax);

    // 評論數 ≥
    const revMin = parseInt(reviewMinEl.value, 10);
    if (!isNaN(revMin)) filtered = filtered.filter(p => (p.total_reviews ?? 0) >= revMin);

    // 一星 ≤
    const osMax = parseInt(oneStarMaxEl.value, 10);
    if (!isNaN(osMax)) filtered = filtered.filter(p => (p.one_star_reviews ?? 0) <= osMax);

    // 銷量 ≥
    const sMin = parseInt(salesMinEl.value, 10);
    if (!isNaN(sMin)) filtered = filtered.filter(p => (p.sales ?? 0) >= sMin);

    if (sortMode === "price-asc") {
        filtered.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
    } else if (sortMode === "price-desc") {
        filtered.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
    } else if (sortMode === "one-star-asc") {
        // 一星少→多，無資料的排最後
        filtered.sort((a, b) => {
            const aHas = a.one_star_reviews != null;
            const bHas = b.one_star_reviews != null;
            if (!aHas && !bHas) return 0;
            if (!aHas) return 1;
            if (!bHas) return -1;
            return a.one_star_reviews - b.one_star_reviews;
        });
    } else if (sortMode === "reviews-desc") {
        // 評論多→少，無資料排最後
        filtered.sort((a, b) => {
            const aR = a.total_reviews ?? -1;
            const bR = b.total_reviews ?? -1;
            return bR - aR;
        });
    } else if (sortMode === "sales-desc") {
        // 銷量多→少，無資料排最後
        filtered.sort((a, b) => {
            const aS = a.sales ?? -1;
            const bS = b.sales ?? -1;
            return bS - aS;
        });
    } else if (sortMode === "review-best") {
        // 綜合最優：一星最少，同時銷量+評論數多的優先
        // 無評論資料的商品排最後
        filtered.sort((a, b) => {
            const aHasData = a.total_reviews != null;
            const bHasData = b.total_reviews != null;
            if (!aHasData && !bHasData) return 0;
            if (!aHasData) return 1;
            if (!bHasData) return -1;
            // 一星數量升冪（少到多）
            const starDiff = (a.one_star_reviews || 0) - (b.one_star_reviews || 0);
            if (starDiff !== 0) return starDiff;
            // 銷量+評論數降冪（多到少）
            const aScore = (a.sales || 0) + (a.total_reviews || 0);
            const bScore = (b.sales || 0) + (b.total_reviews || 0);
            return bScore - aScore;
        });
    }

    renderProducts(filtered);
}

function resetSortButtons() {
    sortBar.querySelectorAll(".sort-btn").forEach(b => b.classList.remove("active"));
    sortBar.querySelector('.sort-btn[data-sort="default"]').classList.add("active");
}

/* ---------- 平台篩選 checkbox 動態生成 ---------- */
function buildSourceFilterCheckboxes(products) {
    const sources = [...new Set(products.map(p => p.source))];
    const colorMap = {
        "momo": "momo", "PChome": "pchome", "博客來": "books",
        "蝦皮": "shopee", "拼多多": "pinduoduo",
    };
    sourceFilterGroup.innerHTML = sources.map(s => {
        const cls = colorMap[s] || "other";
        return `<label class="source-filter-label">
            <input type="checkbox" value="${escapeHtml(s)}" checked>
            <span class="chip-sm ${cls}">${escapeHtml(s)}</span>
        </label>`;
    }).join("");
    // 點選即時篩選
    sourceFilterGroup.addEventListener("change", () => renderFiltered(getActiveSort()));
}

/* ---------- 渲染商品卡片 ---------- */
function renderProducts(products) {
    // 各來源統計
    const stats = {};
    products.forEach(p => { stats[p.source] = (stats[p.source] || 0) + 1; });
    sourceStats.textContent = Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join("  ");
    countEl.textContent = `共 ${products.length} 筆結果`;

    const noImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23aaa' font-size='14'%3E無圖片%3C/text%3E%3C/svg%3E";
    const noImgErr = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect width=%22200%22 height=%22200%22 fill=%22%23eee%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23aaa%22 font-size=%2214%22%3E無圖片%3C/text%3E%3C/svg%3E";

    resultsEl.innerHTML = products.map((p, i) => {
        const priceText = typeof p.price === "number" ? `$${p.price.toLocaleString()}` : escapeHtml(String(p.price));
        const sourceClass = ({
            "momo": "momo",
            "PChome": "pchome",
            "博客來": "books",
            "蝦皮": "shopee",
            "拼多多": "pinduoduo",
        })[p.source] || "other";
        const imgSrc = p.image || noImg;

        // 評論資訊
        const hasReviews = p.total_reviews != null;
        const totalReviews = p.total_reviews ?? 0;
        const oneStarReviews = p.one_star_reviews ?? 0;
        const sales = p.sales;
        const rating = p.rating;

        let reviewHtml = "";
        if (hasReviews) {
            const ratingStr = rating ? `⭐ ${rating}` : "";
            const salesStr = sales != null ? `<span class="rv-sales">銷量 ${sales.toLocaleString()}</span>` : "";
            reviewHtml = `
            <div class="review-info">
                <div class="review-row">
                    ${ratingStr ? `<span class="rv-rating">${ratingStr}</span>` : ""}
                    <span class="rv-total">評論 ${totalReviews.toLocaleString()}</span>
                    ${salesStr}
                </div>
                <div class="review-row one-star-row">
                    <span class="rv-one-star ${oneStarReviews === 0 ? 'zero' : oneStarReviews <= 5 ? 'low' : oneStarReviews <= 20 ? 'mid' : 'high'}">
                        ★1 一星 ${oneStarReviews.toLocaleString()} 則
                    </span>
                </div>
            </div>`;
        } else {
            reviewHtml = `<div class="review-info no-data"><span class="rv-nodata">評論資料不適用</span></div>`;
        }

        return `
        <div class="product-card" style="animation-delay:${i * 0.04}s">
            <a class="card-link" href="${escapeHtml(p.link)}" target="_blank" rel="noopener noreferrer">
                <div class="img-wrap">
                    <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(p.name)}" loading="lazy"
                         onerror="this.src='${noImgErr}'">
                </div>
                <div class="info">
                    <div class="name">${escapeHtml(p.name)}</div>
                    ${reviewHtml}
                    <div class="bottom-row">
                        <span class="price">${priceText}</span>
                        <span class="source-tag ${sourceClass}">${escapeHtml(p.source)}</span>
                    </div>
                </div>
            </a>
        </div>`;
    }).join("");

    resultsEl.classList.toggle("list-view", currentView === "list");
}

/* ---------- 骨架屏 ---------- */
function showSkeletons() {
    const count = parseInt(document.getElementById("maxItems").value, 10) || 8;
    const n = Math.min(count, 12);
    resultsEl.innerHTML = Array.from({ length: n }, () =>
        `<div class="skeleton-card"><div class="sk-img"></div><div class="sk-info"><div class="sk-line"></div><div class="sk-line"></div><div class="sk-line"></div></div></div>`
    ).join("");
}

/* ---------- 結果資訊 ---------- */
function updateResultInfo(kw) {
    const stats = {};
    currentProducts.forEach(p => { stats[p.source] = (stats[p.source] || 0) + 1; });
    countEl.textContent = `共 ${currentProducts.length} 筆結果（${escapeHtml(kw)}）`;
    sourceStats.textContent = Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join("  ");
}

/* ---------- 工具 ---------- */
function parsePrice(val) {
    if (typeof val === "number") return val;
    const n = parseInt(String(val).replace(/[^\d]/g, ""), 10);
    return isNaN(n) ? Infinity : n;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function showStatus(html, type) {
    statusEl.className = "status " + type;
    statusEl.innerHTML = html;
    statusEl.classList.remove("hidden");
}

function hideStatus() {
    statusEl.classList.add("hidden");
}
