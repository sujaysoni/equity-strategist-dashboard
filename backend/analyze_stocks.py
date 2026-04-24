"""
analyze_stocks.py
=================
North American equity analysis engine — 100+ tickers.

Safety rules:
  - NEVER overwrites recommendations.json with empty arrays.
  - Retries each ticker up to 2 times before skipping.
  - Falls back to existing JSON if total results < MIN_RESULTS.
"""

import os, json, time, logging, datetime, warnings
import numpy as np
import yfinance as yf

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── SAFETY THRESHOLD ────────────────────────────────────────────────────────
MIN_RESULTS = 10   # abort overwrite if fewer than this many tickers succeeded

# ── TICKER UNIVERSE (100+) ───────────────────────────────────────────────────

CAD_TICKERS = [
    # Financials
    "RY.TO","TD.TO","BNS.TO","BMO.TO","CM.TO","MFC.TO","SLF.TO","GWO.TO","IFC.TO","FFH.TO",
    # Energy
    "CNQ.TO","SU.TO","CVE.TO","IMO.TO","MEG.TO","WCP.TO","ARX.TO","TOU.TO","ERF.TO","PEY.TO",
    # Materials / Mining
    "ABX.TO","AEM.TO","WPM.TO","FM.TO","TECK-B.TO","AGI.TO","EDV.TO","IMG.TO","K.TO","OR.TO",
    # Technology
    "SHOP.TO","CSU.TO","OTEX.TO","BB.TO","LSPD.TO","DCBO.TO","TIXT.TO","DSG.TO","NVEI.TO",
    # Industrials / Infrastructure
    "CP.TO","CNR.TO","WSP.TO","SNC.TO","STN.TO","TIH.TO","CAE.TO","AC.TO","WJA.TO",
    # Telecom / Utilities
    "BCE.TO","T.TO","RCI-B.TO","H.TO","FTS.TO","EMA.TO","AQN.TO","BEP-UN.TO","NPI.TO",
    # REITs / Consumer
    "REI-UN.TO","CAR-UN.TO","AP-UN.TO","CRT-UN.TO","L.TO","MRU.TO","ATD.TO","DOL.TO",
]

USD_TICKERS = [
    # Mega-cap Tech
    "NVDA","MSFT","AAPL","GOOGL","META","AMZN","TSLA","AVGO","ORCL","AMD",
    # AI / SaaS
    "CRM","NOW","SNOW","PLTR","AI","PATH","DDOG","MDB","NET","ZS",
    # Financials
    "JPM","BAC","GS","MS","WFC","BLK","SCHW","V","MA","AXP",
    # Healthcare / Biotech
    "LLY","UNH","JNJ","ABBV","MRK","PFE","AMGN","GILD","REGN","VRTX",
    # Energy
    "XOM","CVX","COP","SLB","HAL","MPC","PSX","VLO","OXY","DVN",
    # Industrials
    "CAT","DE","HON","GE","RTX","LMT","BA","UPS","FDX","CSX",
    # Consumer
    "AMZN","HD","MCD","SBUX","NKE","TGT","COST","WMT","PG","KO",
    # Clean Energy / Infrastructure
    "NEE","ENPH","FSLR","CEG","SO","DUK","AEP","PCG","EXC",
]

# Deduplicate
CAD_TICKERS = list(dict.fromkeys(CAD_TICKERS))
USD_TICKERS = list(dict.fromkeys(USD_TICKERS))

HORIZONS = ["ultra_short","short","medium","long","ultra_long"]
HORIZON_LABELS = {
    "ultra_short": "0-3 Months",
    "short":       "0-12 Months",
    "medium":      "0-36 Months",
    "long":        "0-60 Months",
    "ultra_long":  "0-360 Months",
}

# ── HELPERS ──────────────────────────────────────────────────────────────────

def safe_get(info, key, default=None):
    val = info.get(key, default)
    return default if val is None else val

def compute_rsi(series, period=14):
    try:
        delta = series.diff()
        gain  = delta.clip(lower=0).rolling(period).mean()
        loss  = (-delta.clip(upper=0)).rolling(period).mean()
        rs    = gain / loss.replace(0, np.nan)
        rsi   = 100 - (100 / (1 + rs))
        v     = rsi.iloc[-1]
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
    ebitda = safe_get(info, "ebitda", 0) or 0
    debt   = safe_get(info, "totalDebt", 0) or 0
    cash   = safe_get(info, "totalCash", 0) or 0
    if ebitda == 0:
        return 99.0
    return round((debt - cash) / ebitda, 2)

def get_fcf_yield(info):
    fcf = safe_get(info, "freeCashflow", 0) or 0
    cap = safe_get(info, "marketCap", 0) or 1
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
        if len(rev) < 2:
            return 0.0
        n = len(rev) - 1
        if rev[-1] <= 0:
            return 0.0
        return round(float(((rev[0] / rev[-1]) ** (1/n) - 1) * 100), 2)
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
                result["flag"]   = True
                result["detail"] = "Net Income ↑ while OCF ↓"
    except Exception:
        pass
    return result

# ── SCORING ──────────────────────────────────────────────────────────────────

def score_ultra_short(info, hist, rsi, ma20, price):
    s = 50
    if rsi < 35:   s += 20
    elif rsi > 70: s -= 20
    if price > ma20: s += 15
    else:            s -= 10
    vol_ratio = hist["Volume"].iloc[-5:].mean() / (hist["Volume"].mean() + 1)
    if vol_ratio > 1.3: s += 10
    detail = f"RSI={rsi:.0f} | {'Above' if price>ma20 else 'Below'} 20MA | Vol {vol_ratio:.1f}x"
    return max(5, min(95, s)), detail

def score_short(info, hist, rsi, ma50, price, cagr):
    s = 50
    if cagr > 15:  s += 20
    elif cagr > 5: s += 10
    else:          s -= 10
    if price > ma50: s += 15
    else:            s -= 10
    dy = get_div_yield(info)
    if dy > 3: s += 5
    detail = f"Rev CAGR={cagr:.1f}% | RSI={rsi:.0f} | Div Yield={dy:.1f}%"
    return max(5, min(95, s)), detail

def score_medium(info, roe, nd_ebitda, fcf_yield, div_yield):
    s = 50
    if roe > 15:        s += 20
    elif roe > 12:      s += 10
    else:               s -= 15
    if nd_ebitda < 2:   s += 15
    elif nd_ebitda < 4: s += 5
    elif nd_ebitda < 90: s -= 20
    if fcf_yield > div_yield and fcf_yield > 0: s += 10
    else:                                        s -= 5
    detail = f"ROE={roe:.1f}% | ND/EBITDA={nd_ebitda:.1f}x | FCF={fcf_yield:.1f}% vs Div={div_yield:.1f}%"
    return max(5, min(95, s)), detail

def score_long(info, roe, nd_ebitda, cagr):
    s  = 50
    pe = safe_get(info, "forwardPE", 99) or 99
    if roe > 20 and nd_ebitda < 2: s += 25
    elif roe > 12:                  s += 10
    if cagr > 10:  s += 15
    if pe < 25:    s += 10
    elif pe > 50:  s -= 10
    detail = f"ROE={roe:.1f}% | CAGR={cagr:.1f}% | Fwd P/E={pe:.1f}"
    return max(5, min(95, s)), detail

def score_ultra_long(info, cagr, roe):
    s   = 50
    cap = safe_get(info, "marketCap", 0) or 0
    if cap > 500e9:   s += 15
    elif cap > 100e9: s += 8
    if cagr > 8:  s += 15
    if roe  > 15: s += 10
    beta = safe_get(info, "beta", 1.0) or 1.0
    if beta < 0.8: s += 5
    detail = f"Mkt Cap=${cap/1e9:.0f}B | CAGR={cagr:.1f}% | Beta={beta:.2f}"
    return max(5, min(95, s)), detail

def score_to_rating(s):
    if s >= 65:   return "BUY"
    elif s >= 45: return "HOLD"
    else:         return "SELL"

def build_thesis(ticker, market, detail, info, shena):
    sector = safe_get(info, "sector", "General")
    flag   = f" | ⚠ {shena['detail']}" if shena["flag"] else ""
    return f"[{market} · {sector}] {detail}{flag}"[:280]

# ── FETCH WITH RETRY ─────────────────────────────────────────────────────────

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
            log.warning(f"{symbol}: fetch error attempt {attempt+1}: {e}")
            time.sleep(delay * (attempt + 1))
    return None, None, None

# ── ANALYSIS LOOP ────────────────────────────────────────────────────────────

def analyze(tickers, market):
    results = []
    for ticker in tickers:
        log.info(f"[{market}] Analyzing {ticker}...")
        t, info, hist = fetch_ticker(ticker)
        if t is None:
            log.error(f"{ticker}: skipped after retries")
            continue
        try:
            close  = hist["Close"]
            price  = round(float(close.iloc[-1]), 2)
            prev   = float(close.iloc[-2])
            change = round(((price - prev) / prev) * 100, 2)

            rsi   = compute_rsi(close)
            ma20  = compute_ma(close, 20)
            ma50  = compute_ma(close, 50)
            ma200 = compute_ma(close, 200)

            roe       = get_roe(info)
            nd_ebitda = get_nd_ebitda(info)
            fcf_yield = get_fcf_yield(info)
            div_yield = get_div_yield(info)
            cagr      = get_revenue_cagr(t)
            mkt_cap   = safe_get(info, "marketCap", 0) or 0
            shena     = shenanigan_flag(t)

            horizon_ratings = {}
            for h in HORIZONS:
                if h == "ultra_short":
                    s, d = score_ultra_short(info, hist, rsi, ma20, price)
                elif h == "short":
                    s, d = score_short(info, hist, rsi, ma50, price, cagr)
                elif h == "medium":
                    s, d = score_medium(info, roe, nd_ebitda, fcf_yield, div_yield)
                elif h == "long":
                    s, d = score_long(info, roe, nd_ebitda, cagr)
                else:
                    s, d = score_ultra_long(info, cagr, roe)

                horizon_ratings[h] = {
                    "rating": score_to_rating(s),
                    "score":  round(s, 1),
                    "thesis": build_thesis(ticker, market, d, info, shena),
                    "label":  HORIZON_LABELS[h],
                }

            results.append({
                "ticker":            ticker,
                "name":              safe_get(info, "shortName", ticker),
                "market":            market,
                "exchange":          safe_get(info, "exchange", "TSX" if market=="CAD" else "NYSE"),
                "currency":          safe_get(info, "currency", "CAD" if market=="CAD" else "USD"),
                "price":             price,
                "change_pct":        change,
                "rsi":               rsi,
                "ma20":              ma20,
                "ma50":              ma50,
                "ma200":             ma200,
                "roe":               roe,
                "nd_ebitda":         nd_ebitda,
                "fcf_yield":         fcf_yield,
                "div_yield":         div_yield,
                "revenue_cagr":      cagr,
                "market_cap_usd":    mkt_cap,
                "shenanigan_flag":   shena["flag"],
                "shenanigan_detail": shena["detail"],
                "horizons":          horizon_ratings,
            })
            time.sleep(1.2)   # respectful rate limiting

        except Exception as e:
            log.error(f"{ticker}: analysis error: {e}")
            continue

    return results

# ── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    out_path = os.path.join(
        os.path.dirname(__file__), "..", "public", "recommendations.json"
    )
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    # Load existing data as fallback
    existing = {"cad": [], "usd": [], "generated_at": ""}
    if os.path.exists(out_path):
        try:
            with open(out_path) as f:
                existing = json.load(f)
        except Exception:
            pass

    log.info(f"Starting analysis: {len(CAD_TICKERS)} CAD + {len(USD_TICKERS)} USD tickers")
    cad_results = analyze(CAD_TICKERS, "CAD")
    usd_results = analyze(USD_TICKERS, "USD")

    total = len(cad_results) + len(usd_results)
    log.info(f"Results: CAD={len(cad_results)}, USD={len(usd_results)}, Total={total}")

    # ── SAFETY GATE ──────────────────────────────────────────────────────────
    if total < MIN_RESULTS:
        log.error(
            f"SAFETY GATE: Only {total} tickers succeeded (minimum {MIN_RESULTS}). "
            "Keeping existing recommendations.json intact."
        )
        return

    output = {
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "cad":          cad_results,
        "usd":          usd_results,
    }
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    log.info(f"✅ Written {total} tickers to recommendations.json")


if __name__ == "__main__":
    main()
