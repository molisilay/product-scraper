/* ===== 商品爬蟲前端邏輯 ===== */

const form      = document.getElementById("searchForm");
const keywordEl = document.getElementById("keyword");
const searchBtn = document.getElementById("searchBtn");
const statusEl  = document.getElementById("status");
const resultsEl = document.getElementById("results");
const sortBar   = document.getElementById("sortBar");
const countEl   = document.getElementById("resultCount");

let currentProducts = [];

/* ---------- 搜尋 ---------- */
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const keyword = keywordEl.value.trim();
    if (!keyword) return;

    // 收集勾選的來源
    const checked = [...form.querySelectorAll('input[name="sources"]:checked')];
    if (checked.length === 0) {
        showStatus("請至少選擇一個搜尋平台", "error");
        return;
    }

    const maxItems = document.getElementById("maxItems").value;

    // 組合 URL
    const params = new URLSearchParams();
    params.append("keyword", keyword);
    checked.forEach(c => params.append("sources", c.value));
    params.append("max_items", maxItems);

    // UI 狀態
    searchBtn.disabled = true;
    resultsEl.innerHTML = "";
    sortBar.classList.add("hidden");
    showStatus('<span class="spinner"></span> 正在搜尋，請稍候…', "loading");

    try {
        const resp = await fetch("/api/search?" + params.toString());
        const data = await resp.json();

        if (!resp.ok) {
            showStatus(data.error || "搜尋失敗", "error");
            return;
        }

        currentProducts = data.products || [];

        if (currentProducts.length === 0) {
            showStatus("找不到相關商品，請嘗試其他關鍵字", "error");
            return;
        }

        hideStatus();
        countEl.textContent = `共 ${currentProducts.length} 筆結果（關鍵字：${data.keyword}）`;
        sortBar.classList.remove("hidden");
        renderProducts(currentProducts);

    } catch (err) {
        showStatus("網路錯誤，請稍後再試", "error");
        console.error(err);
    } finally {
        searchBtn.disabled = false;
    }
});

/* ---------- 排序 ---------- */
sortBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".sort-btn");
    if (!btn) return;

    sortBar.querySelectorAll(".sort-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const mode = btn.dataset.sort;
    let sorted = [...currentProducts];

    if (mode === "price-asc") {
        sorted.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
    } else if (mode === "price-desc") {
        sorted.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
    }

    renderProducts(sorted);
});

/* ---------- 渲染商品卡片 ---------- */
function renderProducts(products) {
    resultsEl.innerHTML = products.map(p => {
        const priceText = typeof p.price === "number" ? `$${p.price.toLocaleString()}` : escapeHtml(String(p.price));
        const sourceClass = p.source === "momo" ? "momo" : p.source === "PChome" ? "pchome" : "books";
        const imgSrc = p.image || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23aaa' font-size='14'%3E無圖片%3C/text%3E%3C/svg%3E";

        return `
        <div class="product-card">
            <a class="card-link" href="${escapeHtml(p.link)}" target="_blank" rel="noopener noreferrer">
                <div class="img-wrap">
                    <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(p.name)}" loading="lazy"
                         onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect width=%22200%22 height=%22200%22 fill=%22%23eee%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23aaa%22 font-size=%2214%22%3E無圖片%3C/text%3E%3C/svg%3E'">
                </div>
                <div class="info">
                    <div class="name">${escapeHtml(p.name)}</div>
                    <div class="bottom-row">
                        <span class="price">${priceText}</span>
                        <span class="source-tag ${sourceClass}">${escapeHtml(p.source)}</span>
                    </div>
                </div>
            </a>
        </div>`;
    }).join("");
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
