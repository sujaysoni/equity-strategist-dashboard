#!/usr/bin/env python3
"""
fetch_tsx_tickers.py

Fetches the TSX listed-company directory via the TMX public API and writes
backend/tsx_tickers_cache.txt (one ticker per line, yfinance .TO suffix).

The cache is then read by analyze_stocks.py at runtime.
This script NO LONGER patches analyze_stocks.py directly.
"""

import time
import requests
import os
import sys

TMX_API_BASE  = "https://www.tsx.com/json/company-directory/search/tsx"
CACHE_PATH    = os.path.join(os.path.dirname(__file__), "tsx_tickers_cache.txt")
REQUEST_DELAY = 0.5
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept":          "application/json, text/plain, */*",
    "Accept-Language": "en-CA,en;q=0.9",
    "Referer":         "https://www.tsx.com/listings/listing-with-us/listed-company-directory",
}


def fetch_tsx_tickers():
    buckets = ["^"] + list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    seen, tickers = set(), []
    session = requests.Session()
    session.headers.update(HEADERS)

    for bucket in buckets:
        url = f"{TMX_API_BASE}/{requests.utils.quote(bucket)}"
        try:
            resp = session.get(url, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"  [WARN] bucket '{bucket}': {e}")
            time.sleep(REQUEST_DELAY * 3)
            continue

        for item in data.get("results", []):
            symbol = item.get("symbol", "").strip()
            if not symbol:
                continue
            yf_sym = symbol.replace(".", "-") + ".TO"
            if yf_sym not in seen:
                seen.add(yf_sym)
                tickers.append(yf_sym)

        print(f"  bucket '{bucket}': {len(data.get('results', []))} entries (total {len(tickers)})", flush=True)
        time.sleep(REQUEST_DELAY)

    tickers.sort()
    return tickers


def main():
    print("Fetching TSX listings from TMX API...")
    tickers = fetch_tsx_tickers()

    if not tickers:
        print("[WARN] No tickers retrieved from TMX. Cache not updated.")
        # Don't fail — analyze_stocks.py has a hardcoded fallback
        sys.exit(0)

    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(tickers) + "\n")

    print(f"Saved {len(tickers)} TSX tickers to {CACHE_PATH}")


if __name__ == "__main__":
    main()
