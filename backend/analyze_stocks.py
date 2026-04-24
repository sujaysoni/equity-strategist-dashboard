"""
analyze_stocks.py
=================
Dynamic North American equity analysis engine.
"""

import os, io, csv, json, time, logging, datetime, warnings
import numpy as np
import requests
import yfinance as yf

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── CONFIG ────────────────────────────────────────────────────────────────────
MIN_RESULTS       = 10
CAD_MIN_MARKETCAP = 100e6
CAD_MIN_VOLUME    = 50_000
USD_MIN_MARKETCAP = 500e6
USD_MIN_VOLUME    = 100_000
MAX_CAD_TICKERS   = 150
MAX_USD_TICKERS   = 150
FETCH_DELAY       = 1.2
REQUEST_TIMEOUT   = 20

HORIZONS = ["ultra_short", "short", "medium", "long", "ultra_long"]
HORIZON_LABELS = {
    "ultra_short": "0-3 Months",
    "short":       "0-12 Months",
    "medium":      "0-36 Months",
    "long":        "0-60 Months",
    "ultra_long":  "0-360 Months",
}

# ── TICKER DISCOVERY ──────────────────────────────────────────────────────────

def fetch_tmx_tickers():
    tickers = []
    headers = {
        "User-Agent": "Mozilla/5.0 (equity-research-bot/1.0)",
        "Accept":     "application/json",
        "Referer":    "https://money.tmx.com/",
    }
    page, size = 0, 100
    try:
        while True:
            payload = {
                "operationName": "getSecurityList",
                "variables": {
                    "pageLimit": size,
                    "page":      page + 1,
                    "filters":   [{"key": "instrumentType", "value": "Equity"}],
                },
                "query": """
                query getSecurityList($page: Int, $pageLimit: Int, $filters: [FilterInput]) {
                  getSecurityList(page: $page, pageLimit: $pageLimit, filters: $filters) {
                    items { symbol name exchangeCode volume marketCap }
                    total
                  }
                }
                """
            }
            resp = requests.post(
                "https://app-money.tmx.com/graphql",
                json=payload, headers=headers, timeout=REQUEST_TIMEOUT
            )
            resp.raise_for_status()
            data  = resp.json()
            items = data["data"]["getSecurityList"]["items"]
            total = data["data"]["getSecurityList"]["total"]
            for item in items:
                sym = item.get("symbol", "").strip()
                mc  = item.get("marketCap") or 0
                vol = item.get("volume")    or 0
                if sym and (mc >= CAD_MIN_MARKETCAP or vol >= CAD_MIN_VOLUME):
                    tickers.append(sym + ".TO")
            page += 1
            log.info(f"TMX page {page}: {len(tickers)} qualified (total={total})")
            if page * size >= total:
                break
            time.sleep(0.5)
    except Exception as e:
        log.warning(f"TMX API failed: {e} — using seed CAD list")
        tickers = _cad_seed()

    tickers = list(dict.fromkeys(tickers))
    log.info(f"TMX discovery: {len(tickers)} CAD tickers")
    return tickers[:MAX_CAD_TICKERS]


def fetch_nasdaq_nyse_tickers():
    tickers = []
    feeds = [
        ("https://ftp.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt", 0, 6),
        ("https://ftp.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt",  0, 6),
    ]
    headers = {"User-Agent": "Mozilla/5.0 (equity-research-bot/1.0)"}
    try:
        for url, sym_col, test_col in feeds:
            resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            reader = csv.reader(resp.text.splitlines(), delimiter="|")
            for i, row in enumerate(reader):
                if i == 0:
                    continue
                if len(row) < max(sym_col, test_col) + 1:
                    continue
                sym        = row[sym_col].strip()
                test_issue = row[test_col].strip()
                if test_issue == "Y":
                    continue
                if not sym or any(c in sym for c in ["$", "^", "."]):
                    continue
                tickers.append(sym)
    except Exception as e:
        log.warning(f"NASDAQ FTP failed: {e} — using seed USD list")
        return _usd_seed()

    tickers = list(dict.fromkeys(tickers))
    log.info(f"NASDAQ/NYSE discovery: {len(tickers)} raw tickers")
    qualified = _liquidity_filter_usd(tickers)
    log.info(f"After liquidity filter: {len(qualified)} USD tickers")
    return qualified[:MAX_USD_TICKERS]


def _liquidity_filter_usd(tickers):
    qualified = []
    chunk_size = 50
    for i in range(0, min(len(tickers), 2000), chunk_size):
        for sym in tickers[i:i + chunk_size]:
            try:
                fi  = yf.Ticker(sym).fast_info
                mc  = getattr(fi, "market_cap",                None) or 0
                vol = getattr(fi, "three_month_average_volume", None) or 0
                if mc >= USD_MIN_MARKETCAP or vol >= USD_MIN_VOLUME:
                    qualified.append(sym)
            except Exception:
                pass
        time.sleep(0.3)
        log.info(f"Liquidity filter: {min(i+chunk_size, len(tickers))}/{min(len(tickers),2000)} checked, {len(qualified)} qualified")
        if len(qualified) >= MAX_USD_TICKERS:
            break
    return qualified


# ── SEED FALLBACKS ────────────────────────────────────────────────────────────

def _cad_seed():
    return [
        "RY.TO","TD.TO","BNS.TO","BMO.TO","CM.TO","MFC.TO","SLF.TO","GWO.TO","IFC.TO","FFH.TO",
        "CNQ.TO","SU.TO","CVE.TO","IMO.TO","TOU.TO","WCP.TO","ARX.TO","MEG.TO","ERF.TO","PEY.TO",
        "ABX.TO","AEM.TO","WPM.TO","FM.TO","AGI.TO","K.TO","OR.TO","EDV.TO","IMG.TO","TECK-B.TO",
        "SHOP.TO","CSU.TO","OTEX.TO","BB.TO","LSPD.TO","DCBO.TO","DSG.TO",
        "CP.TO","CNR.TO","WSP.TO","CAE.TO","STN.TO","TIH.TO","AC.TO",
        "BCE.TO","T.TO","RCI-B.TO","FTS.TO","EMA.TO","AQN.TO","H.TO",
        "REI-UN.TO","CAR-UN.TO","L.TO","MRU.TO","ATD.TO","DOL.TO","BEP-UN.TO",
    ]

def _usd_seed():
    return [
        "NVDA","MSFT","AAPL","GOOGL","META","AMZN","TSLA","AVGO","ORCL","AMD",
        "CRM","NOW","SNOW","PLTR","DDOG","NET","ZS","MDB","PATH","AI",
        "JPM","BAC","GS","MS","WFC","BLK","SCHW","V","MA","AXP",
        "LLY","UNH","JNJ","ABBV","MRK","PFE","AMGN","GILD","REGN","VRTX",
        "XOM","CVX","COP","SLB","HAL","MPC","PSX","VLO","OXY","DVN",
        "CAT","DE","HON","GE","RTX","LMT","BA","UPS","FDX","CSX",
        "NEE","ENPH","FSLR","CEG","SO","DUK","AEP","EXC",
        "HD","MCD","SBUX","NKE","TGT","COST","WMT","PG","KO","PEP",
    ]


# ── HELPERS ───────────────────────────────────────────────────────────────────

def safe_get(info, key, default=None):
    val = info.get(key, default)
    return default if val is None else val

def compute_rsi(series, period=14):
    try:
        delta = series.diff()
        gain  = delta.clip(lower=0).rolling(period).mean()
        loss  = (-delta.clip(upper=0)).rolling(period).mean()
        rs    = gain / loss.replace(0, np.nan)
        v     = (100 - (100 / (1 + rs))).iloc[-1]
        return round(float(v), 2) if not np.isnan(v) else 50.0
    except Exception:
        return 50.0

def compute_ma(series, window):
    try:
        v = series.rolling(window).mean().iloc[-1]
        return round(float(v), 4) if not np.isnan(v) else float(series.iloc[-1])
    except Exception:
        return 0.0

def get_roe(info):
    v = safe_get(info, "returnOnEquity", 0) or 0
    return round(v * 100, 2)

def get_nd_ebitda(info):
    ebitda = safe_get(info, "ebitda",    0) or 0
    debt   = safe_get(info, "totalDebt", 0) or 0
    cash   = safe_get(info, "totalCash", 0) or 0
    return round((debt - cash) / ebitda, 2) if ebitda else 99.0

def get_fcf_yield(info):
    fcf = safe_get(info, "freeCashflow", 0) or 0
    cap = safe_get(info, "marketCap",    1) or 1
    return round((fcf / cap) * 100, 2)

def get_div_yield(info):
    v = safe_get(info, "dividendYield", 0) or 0
    return round(v * 100, 2)

def get_revenue_cagr(ticker_obj):
    try:
        fin = ticker_obj.financials
        if fin is None or fin.empty:
            return 0.0
        row = fin[fin.index == "Total Revenue"]
        if row.empty:
            return 0.0
        rev = row.iloc[0].dropna().values
        if len(rev) < 2 or rev[-1] <= 0:
            return 0.0
        return round(float(((rev[0] / rev[-1]) ** (1 / (len(rev) - 1)) - 1) * 100), 2)
    except Exception:
        return 0.0

def shenanigan_flag(ticker_obj):
    result = {"flag": False, "detail": ""}
    try:
        cf  = ticker_obj.cashflow
        fin = ticker_obj.financials
        if cf is None or fin is None or cf.empty or fin.empty:
            return result
        ocf_row = cf[cf.index.str.contains("Operating", case=False)]
        ni_row  = fin[fin.index.str.contains("Net Income", case=False)]
        if ocf_row.empty or ni_row.empty:
            return result
        ocf = ocf_row.iloc[0].dropna().values
        ni  = ni_row.iloc[0].dropna().values
        if len(ocf) >= 2 and len(ni) >= 2:
            if float(ni[0]) > float(ni[1]) and float(ocf[0]) < float(ocf[1]):
                result.update({"flag": True, "detail": "Net Income ↑ while OCF ↓"})
    except Exception:
        pass
    return result


# ── SCORING ───────────────────────────────────────────────────────────────────

def clamp(v):
    return max(5, min(95, v))

def score_ultra_short(info, hist, rsi, ma20, price):
    s = 50
    if rsi < 35:   s += 20
    elif rsi > 70: s -= 20
    if price > ma20: s += 15
    else:            s -= 10
    vol_ratio = hist["Volume"].iloc[-5:].mean() / (hist["Volume"].mean() + 1)
    if vol_ratio > 1.3: s += 10
    return clamp(s), f"RSI={rsi:.0f} | {'Above' if price > ma20 else 'Below'} 20MA | Vol {vol_ratio:.1f}x"

def score_short(info, hist, rsi, ma50, price, cagr):
    s = 50
    if cagr > 15:  s += 20
    elif cagr > 5: s += 10
    else:          s -= 10
    if price > ma50: s += 15
    else:            s -= 10
    dy = get_div_yield(info)
    if dy > 3: s += 5
    return clamp(s), f"Rev CAGR={cagr:.1f}% | RSI={rsi:.0f} | Div Yield={dy:.1f}%"

def score_medium(info, roe, nd_ebitda, fcf_yield, div_yield):
    s = 50
    if roe > 15:         s += 20
    elif roe > 12:       s += 10
    else:                s -= 15
    if nd_ebitda < 2:    s += 15
    elif nd_ebitda < 4:  s += 5
    elif nd_ebitda < 90: s -= 20
    if fcf_yield > div_yield and fcf_yield > 0: s += 10
    else:                                        s -= 5
    return clamp(s), f"ROE={roe:.1f}% | ND/EBITDA={nd_ebitda:.1f}x | FCF={fcf_yield:.1f}% vs Div={div_yield:.1f}%"

def score_long(info, roe, nd_ebitda, cagr):
    s  = 50
    pe = safe_get(info, "forwardPE", 99) or 99
    if roe > 20 and nd_ebitda < 2: s += 25
    elif roe > 12:                  s += 10
    if cagr > 10: s += 15
    if pe < 25:   s += 10
    elif pe > 50: s -= 10
    return clamp(s), f"ROE={roe:.1f}% | CAGR={cagr:.1f}% | Fwd P/E={pe:.1f}"

def score_ultra_long(info, cagr, roe):
    s   = 50
    cap = safe_get(info, "marketCap", 0) or 0
    if cap > 500e9:   s += 15
    elif cap > 100e9: s += 8
    if cagr > 8:  s += 15
    if roe  > 15: s += 10
    beta = safe_get(info, "beta", 1.0) or 1.0
    if beta < 0.8: s += 5
    return clamp(s), f"Mkt Cap=${cap/1e9:.0f}B | CAGR={cagr:.1f}% | Beta={beta:.2f}"

def score_to_rating(s):
    if s >= 65: return "BUY"
    if s >= 45: return "HOLD"
    return "SELL"

def build_thesis(ticker, market, detail, info, shena):
    sector = safe_get(info, "sector", "General")
    flag   = f" | ⚠ {shena['detail']}" if shena["flag"] else ""
    return f"[{market} · {sector}] {detail}{flag}"[:280]


# ── FETCH WITH RETRY ──────────────────────────────────────────────────────────

def fetch_ticker(symbol, retries=3, delay=4):
    for attempt in range(retries):
        try:
            t    = yf.Ticker(symbol)
            info = t.info or {}
            hist = t.history(period="1y")
            if hist.empty or len(hist) < 30:
                log.warning(f"{symbol}: insufficient history (attempt {attempt+1})")
                time.sleep(delay)
                continue
            return t, info, hist
        except Exception as e:
            log.warning(f"{symbol}: attempt {attempt+1} failed: {e}")
            time.sleep(delay * (attempt + 1))
    return None, None, None


# ── ANALYSIS LOOP ─────────────────────────────────────────────────────────────

def analyze(tickers, market):
    results = []
    seen    = set()
    for ticker in tickers:
        if ticker in seen:
            log.info(f"[{market}] {ticker} — duplicate, skipping")
            continue
        seen.add(ticker)

        log.info(f"[{market}] {ticker} ({len(results)+1}/{len(tickers)})")
        t, info, hist = fetch_ticker(ticker)
        if t is None:
            continue
        try:
            close  = hist["Close"]
            price  = round(float(close.iloc[-1]), 2)
            change = round(((price - float(close.iloc[-2])) / float(close.iloc[-2])) * 100, 2)
            rsi    = compute_rsi(close)
            ma20   = compute_ma(close, 20)
            ma50   = compute_ma(close, 50)
            ma200  = compute_ma(close, 200)
            roe    = get_roe(info)
            nde    = get_nd_ebitda(info)
            fcfy   = get_fcf_yield(info)
            divy   = get_div_yield(info)
            cagr   = get_revenue_cagr(t)
            cap    = safe_get(info, "marketCap", 0) or 0
            shena  = shenanigan_flag(t)

            horizons = {}
            for h in HORIZONS:
                if h == "ultra_short": s, d = score_ultra_short(info, hist, rsi, ma20, price)
                elif h == "short":     s, d = score_short(info, hist, rsi, ma50, price, cagr)
                elif h == "medium":    s, d = score_medium(info, roe, nde, fcfy, divy)
                elif h == "long":      s, d = score_long(info, roe, nde, cagr)
                else:                  s, d = score_ultra_long(info, cagr, roe)
                horizons[h] = {
                    "rating": score_to_rating(s),
                    "score":  round(s, 1),
                    "thesis": build_thesis(ticker, market, d, info, shena),
                    "label":  HORIZON_LABELS[h],
                }

            results.append({
                "ticker":            ticker,
                "name":              safe_get(info, "shortName", ticker),
                "market":            market,
                "exchange":          safe_get(info, "exchange", "TSX" if market == "CAD" else "NYSE"),
                "currency":          safe_get(info, "currency", "CAD" if market == "CAD" else "USD"),
                "price":             price,
                "change_pct":        change,
                "rsi":               rsi,
                "ma20":              ma20,
                "ma50":              ma50,
                "ma200":             ma200,
                "roe":               roe,
                "nd_ebitda":         nde,
                "fcf_yield":         fcfy,
                "div_yield":         divy,
                "revenue_cagr":      cagr,
                "market_cap_usd":    cap,
                "shenanigan_flag":   shena["flag"],
                "shenanigan_detail": shena["detail"],
                "yahoo_url":         f"https://ca.finance.yahoo.com/quote/{ticker}",
                "horizons":          horizons,
            })
            time.sleep(FETCH_DELAY)
        except Exception as e:
            log.error(f"{ticker}: {e}")
            continue
    return results


# ── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    out_path = os.path.join(
        os.path.dirname(__file__), "..", "public", "recommendations.json"
    )
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    log.info("=== Discovering CAD tickers from TMX ===")
    cad_tickers = fetch_tmx_tickers()

    log.info("=== Discovering USD tickers from NASDAQ/NYSE FTP ===")
    usd_tickers = fetch_nasdaq_nyse_tickers()

    log.info(f"=== Analyzing {len(cad_tickers)} CAD + {len(usd_tickers)} USD tickers ===")
    cad_results = analyze(cad_tickers, "CAD")
    usd_results = analyze(usd_tickers, "USD")

    total = len(cad_results) + len(usd_results)
    log.info(f"=== Results: CAD={len(cad_results)}, USD={len(usd_results)}, Total={total} ===")

    if total < MIN_RESULTS:
        log.error(f"SAFETY GATE: only {total} results — recommendations.json NOT updated.")
        return

    with open(out_path, "w") as f:
        json.dump({
            "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
            "cad":          cad_results,
            "usd":          usd_results,
        }, f, indent=2)
    log.info(f"✅ Done. {total} tickers written to recommendations.json")


if __name__ == "__main__":
    main()
