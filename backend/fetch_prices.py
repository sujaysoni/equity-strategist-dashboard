"""
fetch_prices.py
===============
Lightweight live-price updater.
Reads tickers from the existing recommendations.json,
fetches current price + % change via yfinance,
writes public/prices.json.

Run on a cron schedule (every 15 min during market hours).
"""

import os, json, time, datetime, logging
import yfinance as yf

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

ROOT        = os.path.join(os.path.dirname(__file__), "..")
RECS_PATH   = os.path.join(ROOT, "public", "recommendations.json")
PRICES_PATH = os.path.join(ROOT, "public", "prices.json")
FETCH_DELAY = 0.8   # seconds between yfinance calls


def is_market_open():
    """Rough check — NYSE/TSX open Mon-Fri 09:30-16:00 ET."""
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-4)))  # EDT
    if now.weekday() >= 5:   # Sat/Sun
        return False
    return datetime.time(9, 25) <= now.time() <= datetime.time(16, 5)


def fetch_price(symbol):
    try:
        fi    = yf.Ticker(symbol).fast_info
        price = getattr(fi, "last_price",        None)
        prev  = getattr(fi, "previous_close",    None)
        curr  = getattr(fi, "currency",          None)
        if price and prev and prev > 0:
            change_pct = round(((price - prev) / prev) * 100, 2)
        else:
            change_pct = 0.0
        return {
            "price":      round(float(price), 2) if price else None,
            "change_pct": change_pct,
            "currency":   curr or "USD",
        }
    except Exception as e:
        log.warning(f"{symbol}: {e}")
        return None


def main():
    # Load existing recommendations to get ticker list
    if not os.path.exists(RECS_PATH):
        log.error("recommendations.json not found — run analyze_stocks.py first")
        return

    with open(RECS_PATH) as f:
        recs = json.load(f)

    cad_tickers = [s["ticker"] for s in recs.get("cad", [])]
    usd_tickers = [s["ticker"] for s in recs.get("usd", [])]
    all_tickers = cad_tickers + usd_tickers

    log.info(f"Fetching live prices for {len(all_tickers)} tickers…")

    prices = {}
    for i, ticker in enumerate(all_tickers):
        result = fetch_price(ticker)
        if result:
            prices[ticker] = result
            log.info(f"[{i+1}/{len(all_tickers)}] {ticker}: "
                     f"{result['currency']} {result['price']} ({result['change_pct']:+.2f}%)")
        time.sleep(FETCH_DELAY)

    output = {
        "updated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "market_open": is_market_open(),
        "prices": prices,
    }

    with open(PRICES_PATH, "w") as f:
        json.dump(output, f, indent=2)

    log.info(f"✅ prices.json updated — {len(prices)} tickers written.")


if __name__ == "__main__":
    main()
