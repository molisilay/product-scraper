"""
商品爬蟲核心模組
支援 momo、PChome、蝦皮、拼多多、博客來 等電商平台的商品搜尋與評論比較
"""

import requests
from bs4 import BeautifulSoup
from urllib.parse import quote_plus
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
}

SESSION_TIMEOUT = 15


# --------------- momo ---------------
def scrape_momo(keyword, max_items=20):
    """從 momo 購物搜尋商品（解析 Next.js 嵌入資料）"""
    products = []
    try:
        url = "https://www.momoshop.com.tw/search/searchShop.jsp"
        params = {"keyword": keyword}
        resp = requests.get(url, params=params, headers=HEADERS, timeout=SESSION_TIMEOUT)
        resp.raise_for_status()

        text = resp.text.replace('\\"', '"')

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
                "total_reviews": None,
                "one_star_reviews": None,
                "sales": None,
                "rating": None,
            })
            if len(products) >= max_items:
                break
    except Exception as e:
        print(f"[momo] 爬取失敗: {e}")
    return products


# --------------- PChome ---------------
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
                "total_reviews": None,
                "one_star_reviews": None,
                "sales": None,
                "rating": None,
            })
    except Exception as e:
        print(f"[PChome] 爬取失敗: {e}")
    return products


# --------------- 博客來 ---------------
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
                "total_reviews": None,
                "one_star_reviews": None,
                "sales": None,
                "rating": None,
            })
    except Exception as e:
        print(f"[博客來] 爬取失敗: {e}")
    return products


# --------------- 蝦皮 Shopee ---------------
def scrape_shopee(keyword, max_items=20):
    """從蝦皮搜尋商品（含評論星級資料）"""
    products = []
    try:
        url = "https://shopee.tw/api/v4/search/search_items"
        params = {
            "keyword": keyword,
            "limit": min(max_items, 50),
            "newest": 0,
            "order": "relevancy",
            "page_type": "search",
            "scenario": "PAGE_GLOBAL_SEARCH",
            "version": 2,
        }
        shopee_headers = {
            **HEADERS,
            "Referer": "https://shopee.tw/",
            "X-Shopee-Language": "zh-Hant",
            "X-Requested-With": "XMLHttpRequest",
        }
        resp = requests.get(url, params=params, headers=shopee_headers, timeout=SESSION_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        items = data.get("items", [])
        for item in items[:max_items]:
            ib = item.get("item_basic", {})
            name = ib.get("name", "")
            price_raw = ib.get("price", 0)
            price = price_raw // 100000 if price_raw else 0

            img_hash = ib.get("image", "")
            image = f"https://down-tw.img.susercontent.com/file/{img_hash}" if img_hash else ""

            shop_id = ib.get("shopid", "")
            item_id = ib.get("itemid", "")
            link = f"https://shopee.tw/product/{shop_id}/{item_id}"

            rating_info = ib.get("item_rating", {})
            rating_star = rating_info.get("rating_star", 0)
            rating_count = rating_info.get("rating_count", [0, 0, 0, 0, 0, 0])

            total_reviews = rating_count[0] if len(rating_count) > 0 else 0
            one_star = rating_count[1] if len(rating_count) > 1 else 0
            sales = ib.get("historical_sold", 0) or ib.get("sold", 0)

            products.append({
                "name": name,
                "price": price,
                "image": image,
                "link": link,
                "source": "蝦皮",
                "total_reviews": total_reviews,
                "one_star_reviews": one_star,
                "sales": sales,
                "rating": round(rating_star, 1) if rating_star else 0,
            })
    except Exception as e:
        print(f"[蝦皮] 爬取失敗: {e}")
    return products


# --------------- 拼多多 Pinduoduo ---------------
def scrape_pinduoduo(keyword, max_items=20):
    """從拼多多搜尋商品"""
    products = []
    try:
        # 拼多多手機版搜尋 API
        url = "https://apiv2.pinduoduo.com/search"
        pdd_headers = {
            "User-Agent": (
                "Mozilla/5.0 (Linux; Android 13; Pixel 7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Mobile Safari/537.36"
            ),
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://mobile.yangkeduo.com/",
            "Accept-Language": "zh-CN,zh;q=0.9",
        }
        payload = {
            "keyword": keyword,
            "page": 1,
            "size": max_items,
            "sort": "default",
        }
        resp = requests.post(url, json=payload, headers=pdd_headers, timeout=SESSION_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        items = (
            data.get("items", [])
            or data.get("goods_list", [])
            or data.get("data", {}).get("list", [])
        )
        for item in items[:max_items]:
            name = item.get("goods_name", "") or item.get("name", "")
            price_raw = item.get("min_group_price", "") or item.get("price", "0")
            try:
                price = int(float(str(price_raw)) / 100)
            except (ValueError, TypeError):
                price = 0

            image = (
                item.get("hd_thumb_url", "")
                or item.get("thumb_url", "")
                or item.get("image_url", "")
            )

            goods_id = item.get("goods_id", "") or item.get("id", "")
            link = (
                f"https://mobile.yangkeduo.com/goods.html?goods_id={goods_id}"
                if goods_id
                else ""
            )

            sales_raw = item.get("cnt", 0) or item.get("sales_tip", "0")
            try:
                sales = int(str(sales_raw).replace("+", "").replace("万", "0000").replace(",", ""))
            except (ValueError, TypeError):
                sales = 0

            review_count = item.get("review_count", 0) or item.get("cmt_num", 0)

            products.append({
                "name": name,
                "price": price,
                "image": image,
                "link": link,
                "source": "拼多多",
                "total_reviews": review_count or None,
                "one_star_reviews": None,
                "sales": sales or None,
                "rating": None,
            })
    except Exception as e:
        print(f"[拼多多] 爬取失敗: {e}")
    return products


# --------------- 統一搜尋入口 ---------------
def search_products(keyword, sources=None, max_items=20):
    """
    統一搜尋入口（並行爬取）
    sources: list of str, e.g. ["momo", "pchome", "books", "shopee", "pinduoduo"]
    """
    if not sources:
        sources = ["momo", "pchome", "shopee"]

    scraper_map = {
        "momo": scrape_momo,
        "pchome": scrape_pchome,
        "books": scrape_books,
        "shopee": scrape_shopee,
        "pinduoduo": scrape_pinduoduo,
    }

    all_products = []
    tasks = {s: scraper_map[s] for s in sources if s in scraper_map}

    with ThreadPoolExecutor(max_workers=len(tasks) or 1) as executor:
        futures = {
            executor.submit(fn, keyword, max_items): name
            for name, fn in tasks.items()
        }
        for future in as_completed(futures):
            try:
                all_products.extend(future.result())
            except Exception as e:
                print(f"[{futures[future]}] 並行爬取失敗: {e}")

    return all_products
