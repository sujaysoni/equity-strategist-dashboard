#!/usr/bin/env python3
"""
fetch_tsx_tickers.py  (v2)

Fetches NATIVE Canadian equity listings from TMX (TSX + TSXV) and writes:
  backend/tsx_tickers_cache.txt   – one yfinance ticker per line  (.TO / .V)
  backend/tsx_tickers_cache.json  – structured [{ticker, name, exchange, sector}]

Key improvements over v1:
  1. Covers BOTH TSX and TSXV (two separate TMX API buckets).
  2. Filters out US cross-listed wrappers – any symbol whose underlying
     security already trades on a major US exchange (AAPL.TO, NVDA.TO, etc.)
     is dropped.  Detection heuristic: symbols that exactly match a known
     NASDAQ-100 / S&P-500 ticker are excluded.
  3. Filters out pure ETF/CEF/ETN products (iShares, BMO, Horizons, CI, etc.)
     that are wrappers around US or global indices.
  4. Writes a JSON cache with name + exchange metadata for use by
     analyze_stocks.py enrichment jobs.

The plain-text cache is backward-compatible with the existing consumer in
analyze_stocks.py (one ticker per line).
"""

import time
import json
import requests
import os
import sys
import re

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BACKEND_DIR  = os.path.dirname(os.path.abspath(__file__))
TXT_CACHE    = os.path.join(BACKEND_DIR, "tsx_tickers_cache.txt")
JSON_CACHE   = os.path.join(BACKEND_DIR, "tsx_tickers_cache.json")

# ---------------------------------------------------------------------------
# TMX API
# ---------------------------------------------------------------------------
TMX_TSX_BASE  = "https://www.tsx.com/json/company-directory/search/tsx"
TMX_TSXV_BASE = "https://www.tsx.com/json/company-directory/search/tsxv"
REQUEST_DELAY = 0.6   # seconds between requests

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

# ---------------------------------------------------------------------------
# Known US tickers cross-listed on TSX as wrappers (not native Canadian cos)
# Expand this set to cover common NASDAQ-100 + Dow 30 symbols.
# ---------------------------------------------------------------------------
US_UNDERLYING_SYMBOLS = {
    "AAPL","MSFT","NVDA","AMZN","GOOGL","GOOG","META","TSLA","AVGO","ORCL",
    "ADBE","CSCO","INTC","AMD","QCOM","TXN","AMAT","LRCX","MU","MRVL",
    "NFLX","PYPL","INTU","NOW","PANW","CRWD","SNPS","CDNS","FTNT","ANSS",
    "JPM","BAC","WFC","GS","MS","C","AXP","BLK","BX","SCHW",
    "V","MA","COF","DFS","SYF",
    "UNH","LLY","JNJ","PFE","ABBV","MRK","TMO","ABT","DHR","BMY",
    "AMGN","GILD","REGN","VRTX","ISRG","MDT","SYK","BSX","EW",
    "XOM","CVX","COP","EOG","SLB","HAL","PSX","MPC","VLO",
    "CAT","HON","GE","RTX","LMT","BA","NOC","GD","LHX",
    "WMT","COST","TGT","HD","LOW","AMZN","NKE","MCD","SBUX","YUM",
    "KO","PEP","PG","CL","KMB","CHD","HRL","GIS","K",
    "DIS","CMCSA","T","VZ","TMUS","CHTR","NFLX","PARA","WBD",
    "NEE","DUK","SO","D","AEP","EXC","SRE","PCG",
    "PLD","AMT","EQIX","CCI","SPG","O","PSA","EQR",
    "BRK","BRKB","BRKA",
    "SPY","QQQ","IWM","GLD","SLV","TLT","HYG","LQD",
}

# ETF issuer name fragments – listings whose company name contains any of
# these substrings are ETF wrappers and should be excluded.
ETF_NAME_FRAGMENTS = [
    "ishares", "bmo ", "bmo covered", "horizons", "ci ", "purpose ",
    "harvest ", "evolve ", "hamilton ", "ninepoint", "mulvihill",
    "manulife multifactor", "desjardins ", "invesco ", "td ",
    "first trust", "global x", "fidelity advantage", "vanguard",
    "mackenzie ", "rbc", "national bank ", "dynamic ",
    "agf ", "guardian ", "empire life",
    # generic ETF-type words
    " etf", " fund", " trust", " index", " covered call",
    " preferred share", " bond", " fixed income",
]


def is_us_wrapper(symbol_raw: str) -> bool:
    """Return True if this TSX symbol is just a US stock cross-listed."""
    # symbol_raw is the TMX symbol, e.g. "AAPL" or "AAPL.U"
    base = symbol_raw.split(".")[0].upper()
    return base in US_UNDERLYING_SYMBOLS


def is_etf_wrapper(name: str) -> bool:
    """Return True if the company name looks like an ETF/fund wrapper."""
    n = name.lower()
    return any(frag in n for frag in ETF_NAME_FRAGMENTS)


def fetch_exchange(base_url: str, exchange_label: str, suffix: str) -> list:
    """
    Fetch all buckets (^ + A-Z) from the given TMX base_url.
    Returns a list of dicts: {ticker, name, exchange, symbol_raw}
    """
    buckets  = ["^"] + list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    seen     = set()
    results  = []
    session  = requests.Session()
    session.headers.update(HEADERS)
    skipped_us  = 0
    skipped_etf = 0

    for bucket in buckets:
        url = f"{base_url}/{requests.utils.quote(bucket)}"
        try:
            resp = session.get(url, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"  [WARN] {exchange_label} bucket '{bucket}': {e}")
            time.sleep(REQUEST_DELAY * 3)
            continue

        for item in data.get("results", []):
            symbol_raw = item.get("symbol", "").strip()
            name       = item.get("name",   "").strip()
            sector     = item.get("sector", "").strip()

            if not symbol_raw:
                continue

            # --- Filter 1: US cross-listed wrapper ---
            if is_us_wrapper(symbol_raw):
                skipped_us += 1
                continue

            # --- Filter 2: ETF / fund wrapper ---
            if is_etf_wrapper(name):
                skipped_etf += 1
                continue

            # Build yfinance ticker
            yf_sym = symbol_raw.replace(".", "-") + suffix

            if yf_sym not in seen:
                seen.add(yf_sym)
                results.append({
                    "ticker":   yf_sym,
                    "name":     name,
                    "exchange": exchange_label,
                    "sector":   sector,
                })

        print(
            f"  {exchange_label} bucket '{bucket}': "
            f"{len(data.get('results', []))} raw entries "
            f"(running total native: {len(results)}, "
            f"skipped US: {skipped_us}, skipped ETF: {skipped_etf})",
            flush=True,
        )
        time.sleep(REQUEST_DELAY)

    print(f"  {exchange_label} DONE – {len(results)} native equities "
          f"(dropped {skipped_us} US wrappers, {skipped_etf} ETF wrappers)")
    return results


def main():
    print("=" * 60)
    print("fetch_tsx_tickers.py  v2 – Native CAD equities only")
    print("=" * 60)

    print("\n[1/2] Fetching TSX listings...")
    tsx_rows = fetch_exchange(TMX_TSX_BASE, "TSX", ".TO")

    print("\n[2/2] Fetching TSXV listings...")
    tsxv_rows = fetch_exchange(TMX_TSXV_BASE, "TSXV", ".V")

    all_rows = tsx_rows + tsxv_rows

    # Deduplicate across exchanges by ticker
    seen_tickers = set()
    deduped = []
    for row in all_rows:
        if row["ticker"] not in seen_tickers:
            seen_tickers.add(row["ticker"])
            deduped.append(row)

    deduped.sort(key=lambda x: x["ticker"])

    if not deduped:
        print("[WARN] No tickers retrieved. Caches NOT updated.")
        sys.exit(0)

    # Write plain-text cache (backward compatible)
    with open(TXT_CACHE, "w", encoding="utf-8") as f:
        for row in deduped:
            f.write(row["ticker"] + "\n")

    # Write structured JSON cache
    with open(JSON_CACHE, "w", encoding="utf-8") as f:
        json.dump(
            {
                "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
                "count":        len(deduped),
                "tsx_count":    len(tsx_rows),
                "tsxv_count":   len(tsxv_rows),
                "tickers":      deduped,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    tsx_count  = sum(1 for r in deduped if r["exchange"] == "TSX")
    tsxv_count = sum(1 for r in deduped if r["exchange"] == "TSXV")
    print(f"\nSaved {len(deduped)} native Canadian equities:")
    print(f"  TSX  : {tsx_count}")
    print(f"  TSXV : {tsxv_count}")
    print(f"  TXT  : {TXT_CACHE}")
    print(f"  JSON : {JSON_CACHE}")


if __name__ == "__main__":
    main()
