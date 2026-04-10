"""
商品爬蟲網站 — Flask 後端
"""

import os
import time
from flask import Flask, render_template, request, jsonify
from scraper import search_products

app = Flask(__name__, template_folder="templates", static_folder="static")

# 限制搜尋參數範圍，防止濫用
MAX_ITEMS_LIMIT = 60
VALID_SOURCES = {"momo", "pchome", "books", "shopee", "pinduoduo"}

# 簡易快取（key → {ts, data}），避免短時間重複爬取
_cache = {}
CACHE_TTL = 300  # 5 分鐘


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/search", methods=["GET"])
def api_search():
    keyword = request.args.get("keyword", "").strip()
    if not keyword:
        return jsonify({"error": "請輸入搜尋關鍵字"}), 400
    if len(keyword) > 100:
        return jsonify({"error": "關鍵字過長"}), 400

    sources = request.args.getlist("sources")
    # 驗證來源
    sources = [s for s in sources if s in VALID_SOURCES]
    if not sources:
        sources = ["momo", "pchome", "shopee"]

    max_items = request.args.get("max_items", 20, type=int)
    max_items = min(max(1, max_items), MAX_ITEMS_LIMIT)

    # 快取鍵
    cache_key = f"{keyword}|{','.join(sorted(sources))}|{max_items}"
    cached = _cache.get(cache_key)
    if cached and (time.time() - cached["ts"]) < CACHE_TTL:
        products = cached["data"]
    else:
        products = search_products(keyword, sources=sources, max_items=max_items)
        _cache[cache_key] = {"ts": time.time(), "data": products}

    return jsonify({"keyword": keyword, "count": len(products), "products": products})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host="0.0.0.0", port=port)
