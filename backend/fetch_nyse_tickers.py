#!/usr/bin/env python3
"""
fetch_nyse_tickers.py  (v2)

Fetches all NYSE + NASDAQ listed common stock tickers and writes:
  backend/nyse_tickers_cache.txt   - one yfinance ticker per line
  backend/nyse_tickers_cache.json  - structured [{ticker, name, exchange, sector}]

Data sources:
  Primary  : Nasdaq Trader FTP files
             - nasdaqlisted.txt  -> NASDAQ stocks (exchange code Q)
             - otherlisted.txt   -> NYSE/AMEX/ARCA stocks (exchange code N, A, P)
  Fallback : SEC EDGAR company_tickers_exchange.json

Usage:
    python backend/fetch_nyse_tickers.py
"""

import time
import json
import requests
import os
import sys
from datetime import datetime, timezone

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
TXT_CACHE   = os.path.join(BACKEND_DIR, "nyse_tickers_cache.txt")
JSON_CACHE  = os.path.join(BACKEND_DIR, "nyse_tickers_cache.json")

# Nasdaq Trader FTP URLs
NASDAQ_LISTED_URL  = "https://ftp.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_LISTED_URL   = "https://ftp.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
EDGAR_TICKERS_URL  = "https://www.sec.gov/files/company_tickers_exchange.json"

# Exchange codes to include
# nasdaqlisted.txt: all rows are NASDAQ (no exchange column needed)
# otherlisted.txt:  N=NYSE, A=AMEX/NYSE-MKT, P=NYSE-ARCA
OTHER_EXCHANGE_CODES = {"N", "A", "P"}

MAX_TICKER_LEN = 5

HEADERS = {
    "User-Agent": "equity-dashboard-bot contact@example.com",
    "Accept":     "application/json, text/plain, */*",
}


def fetch_nasdaq_listed() -> list:
    """
    Fetch nasdaqlisted.txt — all NASDAQ-listed securities.
    Columns (pipe-delimited):
      Symbol | Security Name | Market Category | Test Issue | Financial Status | Round Lot Size | ETF | NextShares
    """
    print("  [nasdaq-listed] Fetching nasdaqlisted.txt ...", flush=True)
    try:
        resp = requests.get(NASDAQ_LISTED_URL, headers=HEADERS, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        print(f"  [nasdaq-listed] FAILED: {e}")
        return []

    lines   = resp.text.splitlines()
    results = []
    seen    = set()

    for line in lines[1:]:  # skip header
        if line.startswith("File Creation Time"):
            break
        parts = line.split("|")
        if len(parts) < 8:
            continue

        ticker      = parts[0].strip()
        name        = parts[1].strip()
        test_issue  = parts[3].strip()   # Y = test issue
        fin_status  = parts[4].strip()   # D = deficient, E = delinquent, Q = bankrupt, N = normal
        is_etf      = parts[6].strip()   # Y or N

        if test_issue == "Y":
            continue
        if is_etf == "Y":
            continue
        if not ticker or len(ticker) > MAX_TICKER_LEN:
            continue
        # Skip warrants/rights/units by common suffix patterns
        if ticker.endswith(("W", "R", "U")) and len(ticker) > 4:
            continue

        if ticker not in seen:
            seen.add(ticker)
            results.append({
                "ticker":   ticker,
                "name":     name,
                "exchange": "NASDAQ",
                "sector":   "",
            })

    print(f"  [nasdaq-listed] {len(results)} NASDAQ common stocks found.", flush=True)
    return results


def fetch_other_listed() -> list:
    """
    Fetch otherlisted.txt — NYSE, AMEX, ARCA and other exchange securities.
    Columns (pipe-delimited):
      ACT Symbol | Security Name | Exchange | CQS Symbol | ETF | Round Lot Size | Test Issue | NASDAQ Symbol
    Exchange codes: A=AMEX/NYSE-MKT, N=NYSE, P=NYSE-ARCA, Z=BATS, V=IEX
    """
    print("  [other-listed] Fetching otherlisted.txt ...", flush=True)
    try:
        resp = requests.get(OTHER_LISTED_URL, headers=HEADERS, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        print(f"  [other-listed] FAILED: {e}")
        return []

    lines   = resp.text.splitlines()
    results = []
    seen    = set()

    exchange_map = {"N": "NYSE", "A": "NYSE-MKT", "P": "NYSE-ARCA"}

    for line in lines[1:]:  # skip header
        if line.startswith("File Creation Time"):
            break
        parts = line.split("|")
        if len(parts) < 8:
            continue

        ticker     = parts[0].strip()
        name       = parts[1].strip()
        exchange   = parts[2].strip()
        is_etf     = parts[4].strip()   # Y or N
        test_issue = parts[6].strip()   # Y = test issue

        if exchange not in OTHER_EXCHANGE_CODES:
            continue
        if is_etf == "Y":
            continue
        if not ticker or len(ticker) > MAX_TICKER_LEN:
            continue
        if ticker.endswith(("W", "R", "U")) and len(ticker) > 4:
            continue
        if test_issue == "Y":
            continue

        if ticker not in seen:
            seen.add(ticker)
            results.append({
                "ticker":   ticker,
                "name":     name,
                "exchange": exchange_map.get(exchange, exchange),
                "sector":   "",
            })

    print(f"  [other-listed] {len(results)} NYSE/AMEX/ARCA common stocks found.", flush=True)
    return results


def fetch_via_edgar_fallback() -> list:
    """
    Fallback: SEC EDGAR company_tickers_exchange.json.
    Covers NYSE and NASDAQ exchanges.
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
    target_exchanges = {"NYSE", "NASDAQ", "NYSE MKT", "NYSE ARCA"}

    items = data.get("data", [])
    if isinstance(items, dict):
        items = list(items.values())

    for item in items:
        if isinstance(item, (list, tuple)) and len(item) >= 4:
            cik, name, ticker, exchange = item[0], item[1], item[2], item[3]
        elif isinstance(item, dict):
            cik      = item.get("cik_str", "")
            name     = item.get("title", "")
            ticker   = item.get("ticker", "")
            exchange = item.get("exchange", "")
        else:
            continue

        if str(exchange).upper() not in {e.upper() for e in target_exchanges}:
            continue
        if not ticker or len(str(ticker)) > MAX_TICKER_LEN:
            continue

        yf_sym = str(ticker).upper()
        if yf_sym not in seen:
            seen.add(yf_sym)
            results.append({
                "ticker":   yf_sym,
                "name":     str(name),
                "exchange": str(exchange),
                "sector":   "",
                "cik":      str(cik),
            })

    print(f"  [edgar] {len(results)} NYSE+NASDAQ entries found.", flush=True)
    return results


def main():
    print("=" * 60)
    print("fetch_nyse_tickers.py  v2 – NYSE + NASDAQ common stocks")
    print("=" * 60)

    print("\n[1/2] Fetching from Nasdaq Trader FTP files (primary)...")
    nasdaq_rows = fetch_nasdaq_listed()
    nyse_rows   = fetch_other_listed()
    rows = nasdaq_rows + nyse_rows

    if not rows:
        print("\n[2/2] Primary empty – trying SEC EDGAR fallback...")
        rows = fetch_via_edgar_fallback()

    if not rows:
        print("[WARN] No tickers retrieved from any source. Caches NOT updated.")
        sys.exit(0)

    # Deduplicate and sort
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
                "source":       "nasdaq-trader-nasdaqlisted + nasdaq-trader-otherlisted + sec-edgar-fallback",
                "exchanges":    ["NASDAQ", "NYSE", "NYSE-MKT", "NYSE-ARCA"],
                "tickers":      deduped,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    nasdaq_count = sum(1 for r in deduped if r.get("exchange") == "NASDAQ")
    nyse_count   = len(deduped) - nasdaq_count
    print(f"\nSaved {len(deduped)} tickers ({nasdaq_count} NASDAQ + {nyse_count} NYSE/other):")
    print(f"  TXT  : {TXT_CACHE}")
    print(f"  JSON : {JSON_CACHE}")


if __name__ == "__main__":
    main()
