#!/usr/bin/env python3
"""
fetch_nyse_tickers.py  (v3)

Fetches ALL NYSE + NASDAQ listed common stock tickers and writes THREE files:

  backend/nyse_tickers_cache.txt    - one yfinance ticker per line (all combined)
  backend/nyse_tickers_cache.json   - structured NYSE/AMEX/ARCA rows only
  backend/nasdaq_tickers_cache.json - structured NASDAQ rows only  ← NEW (live)

The separate nasdaq_tickers_cache.json replaces the old 223-ticker static seed
so that analyze_stocks.py always reads a fully live NASDAQ universe (~3,000+
tickers) on every daily run.

Data sources:
  Primary  : Nasdaq Trader FTP files  (updated nightly by FINRA/Nasdaq)
             nasdaqlisted.txt  → NASDAQ stocks
             otherlisted.txt   → NYSE / AMEX / NYSE-ARCA stocks
  Fallback : SEC EDGAR company_tickers_exchange.json

Usage:
    python backend/fetch_nyse_tickers.py
"""

import json
import os
import sys
import requests
from datetime import datetime, timezone

BACKEND_DIR       = os.path.dirname(os.path.abspath(__file__))
TXT_CACHE         = os.path.join(BACKEND_DIR, "nyse_tickers_cache.txt")
NYSE_JSON_CACHE   = os.path.join(BACKEND_DIR, "nyse_tickers_cache.json")
NASDAQ_JSON_CACHE = os.path.join(BACKEND_DIR, "nasdaq_tickers_cache.json")

# Nasdaq Trader FTP URLs
NASDAQ_LISTED_URL = "https://ftp.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_LISTED_URL  = "https://ftp.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
EDGAR_TICKERS_URL = "https://www.sec.gov/files/company_tickers_exchange.json"

# otherlisted.txt exchange codes to include
OTHER_EXCHANGE_CODES = {"N", "A", "P"}  # NYSE, AMEX/NYSE-MKT, NYSE-ARCA

# Raised from 5 → 6 to capture valid symbols like BRK/A (stored as BRKA)
MAX_TICKER_LEN = 6

HEADERS = {
    "User-Agent": "equity-dashboard-bot contact@example.com",
    "Accept":     "application/json, text/plain, */*",
}


# ---------------------------------------------------------------------------
# Fetchers
# ---------------------------------------------------------------------------

def fetch_nasdaq_listed() -> list:
    """
    Fetch nasdaqlisted.txt — all NASDAQ-listed securities.
    Pipe-delimited columns:
      Symbol | Security Name | Market Category | Test Issue |
      Financial Status | Round Lot Size | ETF | NextShares
    Financial Status: N=normal, D=deficient, E=delinquent, Q=bankrupt, G/H/J/K=variants
    """
    print("  [nasdaq-listed] Fetching nasdaqlisted.txt ...", flush=True)
    try:
        resp = requests.get(NASDAQ_LISTED_URL, headers=HEADERS, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        print(f"  [nasdaq-listed] FAILED: {e}", flush=True)
        return []

    lines   = resp.text.splitlines()
    results = []
    seen    = set()

    for line in lines[1:]:          # skip header row
        if line.startswith("File Creation Time"):
            break
        parts = line.split("|")
        if len(parts) < 8:
            continue

        ticker     = parts[0].strip()
        name       = parts[1].strip()
        test_issue = parts[3].strip()   # Y = test/dummy issue
        fin_status = parts[4].strip()   # N=normal; D/E/Q = troubled
        is_etf     = parts[6].strip()   # Y or N

        if test_issue == "Y":
            continue
        if is_etf == "Y":
            continue
        # Skip clearly troubled companies (deficient/delinquent/bankrupt)
        if fin_status in {"D", "E", "Q"}:
            continue
        if not ticker or len(ticker) > MAX_TICKER_LEN:
            continue
        # Skip warrants / rights / units (common suffix heuristic)
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
    Pipe-delimited columns:
      ACT Symbol | Security Name | Exchange | CQS Symbol |
      ETF | Round Lot Size | Test Issue | NASDAQ Symbol
    Exchange codes: A=AMEX/NYSE-MKT, N=NYSE, P=NYSE-ARCA, Z=BATS, V=IEX
    """
    print("  [other-listed] Fetching otherlisted.txt ...", flush=True)
    try:
        resp = requests.get(OTHER_LISTED_URL, headers=HEADERS, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        print(f"  [other-listed] FAILED: {e}", flush=True)
        return []

    lines        = resp.text.splitlines()
    results      = []
    seen         = set()
    exchange_map = {"N": "NYSE", "A": "NYSE-MKT", "P": "NYSE-ARCA"}

    for line in lines[1:]:          # skip header row
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
        if test_issue == "Y":
            continue
        if not ticker or len(ticker) > MAX_TICKER_LEN:
            continue
        if ticker.endswith(("W", "R", "U")) and len(ticker) > 4:
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
    Used only when both Nasdaq Trader FTP sources return empty.
    """
    print("  [edgar] Fetching company_tickers_exchange.json ...", flush=True)
    try:
        resp = requests.get(EDGAR_TICKERS_URL, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  [edgar] FAILED: {e}", flush=True)
        return []

    results          = []
    seen             = set()
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


# ---------------------------------------------------------------------------
# Writer helpers
# ---------------------------------------------------------------------------

def _write_json_cache(path: str, rows: list, exchange_label: str, source: str):
    """Write a structured JSON cache file in the standard schema."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "count":        len(rows),
                "exchange":     exchange_label,
                "source":       source,
                "tickers":      rows,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )
    print(f"  Written {len(rows):,} rows → {path}", flush=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60, flush=True)
    print("fetch_nyse_tickers.py  v3 – NYSE + NASDAQ common stocks", flush=True)
    print("=" * 60, flush=True)

    # ── 1. Fetch ─────────────────────────────────────────────────────────────
    print("\n[1/3] Fetching from Nasdaq Trader FTP files (primary)...", flush=True)
    nasdaq_rows = fetch_nasdaq_listed()   # NASDAQ-only rows
    nyse_rows   = fetch_other_listed()    # NYSE/AMEX/ARCA rows
    all_rows    = nasdaq_rows + nyse_rows

    if not all_rows:
        print("\n[2/3] Primary sources empty — trying SEC EDGAR fallback...", flush=True)
        all_rows    = fetch_via_edgar_fallback()
        # In the EDGAR fallback we can't cleanly split NASDAQ vs NYSE,
        # so treat everything as NYSE for the split caches and still
        # write a combined nasdaq cache from any NASDAQ-labelled rows.
        nasdaq_rows = [r for r in all_rows if "NASDAQ" in r.get("exchange", "").upper()]
        nyse_rows   = [r for r in all_rows if "NASDAQ" not in r.get("exchange", "").upper()]

    if not all_rows:
        print("[WARN] No tickers retrieved from any source. Caches NOT updated.", flush=True)
        sys.exit(0)

    # ── 2. Deduplicate (combined universe for .txt file) ─────────────────────
    print("\n[2/3] Deduplicating and splitting by exchange...", flush=True)
    seen_all   = set()
    deduped    = []
    for row in all_rows:
        if row["ticker"] not in seen_all:
            seen_all.add(row["ticker"])
            deduped.append(row)
    deduped.sort(key=lambda x: x["ticker"])

    # Deduplicate each subset independently (EDGAR fallback may overlap)
    def _dedup(rows):
        seen, out = set(), []
        for r in rows:
            if r["ticker"] not in seen:
                seen.add(r["ticker"])
                out.append(r)
        out.sort(key=lambda x: x["ticker"])
        return out

    nasdaq_deduped = _dedup(nasdaq_rows)
    nyse_deduped   = _dedup(nyse_rows)

    # ── 3. Write all three cache files ───────────────────────────────────────
    print("\n[3/3] Writing cache files...", flush=True)

    # (a) Combined plain-text — backward compatible with analyze_stocks.py
    with open(TXT_CACHE, "w", encoding="utf-8") as f:
        for row in deduped:
            f.write(row["ticker"] + "\n")
    print(f"  Written {len(deduped):,} tickers → {TXT_CACHE}", flush=True)

    # (b) NYSE/AMEX/ARCA JSON — nyse_tickers_cache.json
    _write_json_cache(
        NYSE_JSON_CACHE,
        nyse_deduped,
        exchange_label = "NYSE/NYSE-MKT/NYSE-ARCA",
        source         = "nasdaq-trader-otherlisted + sec-edgar-fallback",
    )

    # (c) NASDAQ JSON — nasdaq_tickers_cache.json  ← replaces stale 223-ticker seed
    _write_json_cache(
        NASDAQ_JSON_CACHE,
        nasdaq_deduped,
        exchange_label = "NASDAQ",
        source         = "nasdaq-trader-nasdaqlisted + sec-edgar-fallback",
    )

    # ── Summary ──────────────────────────────────────────────────────────────
    print(f"\n{'='*60}", flush=True)
    print(f"  NASDAQ tickers : {len(nasdaq_deduped):,}", flush=True)
    print(f"  NYSE/other     : {len(nyse_deduped):,}", flush=True)
    print(f"  Combined total : {len(deduped):,}  (written to .txt)", flush=True)
    print(f"{'='*60}", flush=True)


if __name__ == "__main__":
    main()
