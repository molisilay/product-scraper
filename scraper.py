"""
商品爬蟲核心模組
支援 momo、PChome、蝦皮 等電商平台的商品搜尋
"""

import requests
from bs4 import BeautifulSoup
from urllib.parse import quote_plus
import json
import re
import time


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
}

SESSION_TIMEOUT = 15


def scrape_momo(keyword, max_items=20):
    """從 momo 購物搜尋商品（解析 Next.js 嵌入資料）"""
    products = []
    try:
        url = "https://www.momoshop.com.tw/search/searchShop.jsp"
        params = {"keyword": keyword}
        resp = requests.get(url, params=params, headers=HEADERS, timeout=SESSION_TIMEOUT)
        resp.raise_for_status()

        # Next.js 嵌入的資料會用 \" 跳脫引號，先還原
        text = resp.text.replace('\\"', '"')

        # 從 Next.js script 中提取商品資料
        pattern = re.compile(
            r'"goodsCode"\s*:\s*"(?P<code>[^"]+)"'
            r'.*?"goodsName"\s*:\s*"(?P<name>[^"]+)"'
            r'.*?"goodsPrice"\s*:\s*"(?P<price>[^"]+)"'
            r'.*?"imgUrl"\s*:\s*"(?P<img>[^"]+)"',
            re.DOTALL,
        )
        seen = set()
        for m in pattern.finditer(text):
            code = m.group("code")
            if code in seen:
                continue
            seen.add(code)

            price_str = m.group("price").replace("$$", "").replace("$", "").replace(",", "")
            try:
                price_val = int(price_str)
            except ValueError:
                price_val = price_str

            products.append({
                "name": m.group("name"),
                "price": price_val,
                "image": m.group("img"),
                "link": f"https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code={code}",
                "source": "momo",
            })
            if len(products) >= max_items:
                break
    except Exception as e:
        print(f"[momo] 爬取失敗: {e}")
    return products


def scrape_pchome(keyword, max_items=20):
    """從 PChome 搜尋商品"""
    products = []
    try:
        url = "https://ecshweb.pchome.com.tw/search/v4.3/all/results"
        params = {
            "q": keyword,
            "page": 1,
            "sort": "sale/dc",
        }
        resp = requests.get(url, params=params, headers=HEADERS, timeout=SESSION_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        items = data.get("Prods", [])
        for item in items[:max_items]:
            pic_url = item.get("PicB", "") or item.get("picB", "")
            if pic_url and not pic_url.startswith("http"):
                pic_url = "https://cs-b.ecimg.tw" + pic_url

            products.append({
                "name": item.get("Name", "") or item.get("name", ""),
                "price": item.get("Price", item.get("price", "N/A")),
                "image": pic_url,
                "link": f"https://24h.pchome.com.tw/prod/{item.get('Id', '')}",
                "source": "PChome",
            })
    except Exception as e:
        print(f"[PChome] 爬取失敗: {e}")
    return products


def scrape_books(keyword, max_items=20):
    """從博客來搜尋商品"""
    products = []
    try:
        url = f"https://search.books.com.tw/search/query/key/{quote_plus(keyword)}/cat/all"
        resp = requests.get(url, headers=HEADERS, timeout=SESSION_TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        items = soup.select("li.item")
        for item in items[:max_items]:
            title_el = item.select_one("a.餐[title]") or item.select_one("h4 a")
            if not title_el:
                continue
            name = title_el.get("title", "") or title_el.get_text(strip=True)
            link = title_el.get("href", "")
            if link and not link.startswith("http"):
                link = "https:" + link

            img_el = item.select_one("img")
            image = ""
            if img_el:
                image = img_el.get("data-src", "") or img_el.get("src", "")
                if image and not image.startswith("http"):
                    image = "https:" + image

            price_el = item.select_one(".price b") or item.select_one(".price")
            price = price_el.get_text(strip=True) if price_el else "N/A"

            products.append({
                "name": name,
                "price": price,
                "image": image,
                "link": link,
                "source": "博客來",
            })
    except Exception as e:
        print(f"[博客來] 爬取失敗: {e}")
    return products


def search_products(keyword, sources=None, max_items=20):
    """
    統一搜尋入口
    sources: list of str, e.g. ["momo", "pchome", "books"]
    """
    if not sources:
        sources = ["momo", "pchome"]

    all_products = []
    scraper_map = {
        "momo": scrape_momo,
        "pchome": scrape_pchome,
        "books": scrape_books,
    }

    for source in sources:
        fn = scraper_map.get(source)
        if fn:
            results = fn(keyword, max_items=max_items)
            all_products.extend(results)

    return all_products
