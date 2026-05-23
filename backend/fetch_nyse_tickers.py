#!/usr/bin/env python3
"""
fetch_nyse_tickers.py  (v1)

Fetches all NYSE-listed company tickers from the SEC EDGAR full-text
company-search API and writes:
  backend/nyse_tickers_cache.txt   – one yfinance ticker per line
  backend/nyse_tickers_cache.json  – structured [{ticker, name, cik, sic_desc}]

Data source: SEC EDGAR  https://efts.sec.gov/LATEST/search-index?q=%22%22&dateRange=custom
Exchange filter: uses the EDGAR company-search endpoint which returns the
exchange field.  We page through all results filtering on exchange="NYSE".

Fallback: if the EDGAR API is unreachable (GitHub Actions IP block), the
script falls back to fetching the Nasdaq trader FTP file which lists all
US-exchange securities and then filters for exchange=N (NYSE).

Usage:
    python backend/fetch_nyse_tickers.py

Outputs are read by analyze_stocks.py at runtime (same pattern as TSX).
"""

import time
import json
import requests
import os
import sys
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
TXT_CACHE   = os.path.join(BACKEND_DIR, "nyse_tickers_cache.txt")
JSON_CACHE  = os.path.join(BACKEND_DIR, "nyse_tickers_cache.json")

# ---------------------------------------------------------------------------
# Source 1: Nasdaq Trader FTP  (primary – most reliable from CI)
# Lists ALL US-exchange securities; we filter by exchange code.
# ---------------------------------------------------------------------------
NASDAQ_TRADER_URL = (
    "https://ftp.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
)
# NYSE exchange code in this file is "N"
NYSE_EXCHANGE_CODE = "N"

# ---------------------------------------------------------------------------
# Source 2: SEC EDGAR full-text company search (fallback / enrichment)
# Returns JSON with cik, entityName, exchanges, tickers.
# ---------------------------------------------------------------------------
EDGAR_COMPANY_URL  = "https://efts.sec.gov/LATEST/search-index?q=%22%22&entity=&dateRange=custom&startdt=&enddt=&forms="
EDGAR_TICKERS_URL  = "https://www.sec.gov/files/company_tickers_exchange.json"

# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------
# Exclude these product types that aren't common stocks
EXCLUDE_SUFFIXES = (
    # Warrants, rights, units, preferreds (common naming conventions)
    " WS", "+", "$", " RT", " WT", " UN", " WI",
    ".WS", ".RT", ".WT", ".UN",
)
# Tickers longer than 5 chars are usually ETFs, CEFs, or structured products
MAX_TICKER_LEN = 5

HEADERS = {
    "User-Agent": "equity-dashboard-bot contact@example.com",
    "Accept":     "application/json, text/plain, */*",
}


def fetch_via_nasdaq_trader() -> list:
    """
    Primary method: Nasdaq Trader 'otherlisted.txt' file.
    Columns (pipe-delimited):
      ACT Symbol | Security Name | Exchange | CQS Symbol | ETF | Round Lot Size | Test Issue | NASDAQ Symbol
    Exchange codes: A=AMEX/NYSE-MKT, N=NYSE, P=NYSE-ARCA, Z=BATS, V=IEX
    We want Exchange == N.
    """
    print("  [nasdaq-trader] Fetching otherlisted.txt ...", flush=True)
    try:
        resp = requests.get(NASDAQ_TRADER_URL, headers=HEADERS, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        print(f"  [nasdaq-trader] FAILED: {e}")
        return []

    lines   = resp.text.splitlines()
    results = []
    seen    = set()

    for line in lines[1:]:   # skip header
        if line.startswith("File Creation Time"):
            break
        parts = line.split("|")
        if len(parts) < 8:
            continue

        ticker   = parts[0].strip()
        name     = parts[1].strip()
        exchange = parts[2].strip()
        is_etf   = parts[4].strip()   # "Y" or "N"

        if exchange != NYSE_EXCHANGE_CODE:
            continue
        if is_etf == "Y":
            continue
        if not ticker or len(ticker) > MAX_TICKER_LEN:
            continue
        # Skip warrants, preferreds, rights, units
        if any(ticker.endswith(sfx) for sfx in ("W", "R", "U")) and len(ticker) > 4:
            continue
        # Skip test issues
        if parts[6].strip() == "Y":
            continue

        yf_sym = ticker  # NYSE tickers need no suffix in yfinance
        if yf_sym not in seen:
            seen.add(yf_sym)
            results.append({
                "ticker":   yf_sym,
                "name":     name,
                "exchange": "NYSE",
                "sector":   "",
            })

    print(f"  [nasdaq-trader] {len(results)} NYSE common stocks found.", flush=True)
    return results


def fetch_via_edgar_exchange_json() -> list:
    """
    Fallback method: SEC EDGAR company_tickers_exchange.json.
    Contains {0: {cik, name, ticker, exchange}, 1: ...}.
    Filter on exchange == "NYSE".
    """
    print("  [edgar] Fetching company_tickers_exchange.json ...", flush=True)
    try:
        resp = requests.get(EDGAR_TICKERS_URL, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  [edgar] FAILED: {e}")
        return []

    results = []
    seen    = set()

    for _idx, item in data.get("data", {}).items() if isinstance(data.get("data"), dict) \
            else enumerate(data.get("data", [])):
        # data is either a list-of-lists or dict-of-lists depending on SEC format
        # Normalise both shapes:
        if isinstance(item, (list, tuple)):
            # [cik, name, ticker, exchange]
            if len(item) < 4:
                continue
            cik, name, ticker, exchange = item[0], item[1], item[2], item[3]
        elif isinstance(item, dict):
            cik      = item.get("cik_str", "")
            name     = item.get("title", "")
            ticker   = item.get("ticker", "")
            exchange = item.get("exchange", "")
        else:
            continue

        if str(exchange).upper() != "NYSE":
            continue
        if not ticker or len(str(ticker)) > MAX_TICKER_LEN:
            continue

        yf_sym = str(ticker).upper()
        if yf_sym not in seen:
            seen.add(yf_sym)
            results.append({
                "ticker":   yf_sym,
                "name":     str(name),
                "exchange": "NYSE",
                "sector":   "",
                "cik":      str(cik),
            })

    print(f"  [edgar] {len(results)} NYSE entries found.", flush=True)
    return results


def main():
    print("=" * 60)
    print("fetch_nyse_tickers.py  v1 – NYSE common stocks")
    print("=" * 60)

    # Try primary source first
    print("\n[1/2] Trying Nasdaq Trader file (primary)...")
    rows = fetch_via_nasdaq_trader()

    # Fallback to EDGAR if primary returns nothing
    if not rows:
        print("\n[2/2] Primary empty – trying SEC EDGAR fallback...")
        rows = fetch_via_edgar_exchange_json()

    if not rows:
        print("[WARN] No NYSE tickers retrieved from any source. Caches NOT updated.")
        sys.exit(0)

    # Sort and deduplicate
    seen   = set()
    deduped = []
    for row in rows:
        if row["ticker"] not in seen:
            seen.add(row["ticker"])
            deduped.append(row)
    deduped.sort(key=lambda x: x["ticker"])

    # Write plain-text cache
    with open(TXT_CACHE, "w", encoding="utf-8") as f:
        for row in deduped:
            f.write(row["ticker"] + "\n")

    # Write structured JSON cache
    with open(JSON_CACHE, "w", encoding="utf-8") as f:
        json.dump(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "count":        len(deduped),
                "source":       "nasdaq-trader-otherlisted + sec-edgar-fallback",
                "tickers":      deduped,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    print(f"\nSaved {len(deduped)} NYSE common stock tickers:")
    print(f"  TXT  : {TXT_CACHE}")
    print(f"  JSON : {JSON_CACHE}")


if __name__ == "__main__":
    main()
