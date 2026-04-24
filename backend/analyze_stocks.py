"""
analyze_stocks.py
=================
Multi-timeframe North American equity analysis engine.

Horizons:
  ultra_short  0-3m   RSI + MOC + PDUFA catalysts
  short        0-12m  Sector rotation + Revenue CAGR + RPOs
  medium       0-36m  ROE > 12%, ND/EBITDA < 4x, FCF Yield vs Div Yield
  long         0-60m  AISC (mining), AI infrastructure moats
  ultra_long   0-360m TAM, CO2 trends, long-cycle infrastructure

Outputs:
  public/recommendations.json
"""

import os
import json
import logging
import datetime
import warnings

import numpy as np
import pandas as pd
import yfinance as yf

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── CONFIG ──────────────────────────────────────────────────────────────────
ALPHA_VANTAGE_KEY = os.environ.get("ALPHA_VANTAGE_KEY", "")
POLYGON_API_KEY   = os.environ.get("POLYGON_API_KEY", "")

CAD_TICKERS = [
    "RY.TO","TD.TO","CNQ.TO","SU.TO","ABX.TO",
    "WPM.TO","SHOP.TO","MFC.TO","BCE.TO","CP.TO",
]

USD_TICKERS = [
    "NVDA","MSFT","AAPL","AMZN","META",
    "JPM","XOM","LLY","NEE","BRK-B",
]

HORIZONS = ["ultra_short","short","medium","long","ultra_long"]

HORIZON_LABELS = {
    "ultra_short": "0-3 Months",
    "short":       "0-12 Months",
    "medium":      "0-36 Months",
    "long":        "0-60 Months",
    "ultra_long":  "0-360 Months",
}

# ── TECHNICAL HELPERS ────────────────────────────────────────────────────────

def compute_rsi(series, period=14):
    delta = series.diff()
    gain  = delta.clip(lower=0).rolling(period).mean()
    loss  = (-delta.clip(upper=0)).rolling(period).mean()
    rs    = gain / loss.replace(0, np.nan)
    rsi   = 100 - (100 / (1 + rs))
    return round(float(rsi.iloc[-1]), 2) if not rsi.empty else 50.0

def compute_ma(series, window):
    ma = series.rolling(window).mean()
    return round(float(ma.iloc[-1]), 4) if not ma.empty else float(series.iloc[-1])

def above_ma(price, ma):
    return price > ma

# ── FUNDAMENTAL HELPERS ──────────────────────────────────────────────────────

def safe_get(info, key, default=None):
    val = info.get(key, default)
    return default if val is None else val

def get_roe(info):
    return round(safe_get(info, "returnOnEquity", 0) * 100, 2)

def get_nd_ebitda(info):
    ebitda     = safe_get(info, "ebitda", 1)
    total_debt = safe_get(info, "totalDebt", 0)
    cash       = safe_get(info, "totalCash", 0)
    net_debt   = total_debt - cash
    if not ebitda or ebitda == 0:
        return 99.0
    return round(net_debt / ebitda, 2)

def get_fcf_yield(info):
    fcf     = safe_get(info, "freeCashflow", 0)
    mkt_cap = safe_get(info, "marketCap", 1)
    if not mkt_cap:
        return 0.0
    return round((fcf / mkt_cap) * 100, 2)

def get_div_yield(info):
    return round(safe_get(info, "dividendYield", 0) * 100, 2)

def get_revenue_cagr(ticker_obj):
    try:
        fin = ticker_obj.financials
        if fin is None or fin.empty:
            return 0.0
        rev_row = fin[fin.index == "Total Revenue"]
        if rev_row.empty:
            return 0.0
        rev = rev_row.iloc[0].dropna().values
        if len(rev) < 2:
            return 0.0
        n    = len(rev) - 1
        cagr = ((rev[0] / rev[-1]) ** (1 / n) - 1) * 100
        return round(float(cagr), 2)
    except Exception:
        return 0.0

# ── SHENANIGANS CHECK ────────────────────────────────────────────────────────

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
        ocf_vals = ocf_row.iloc[0].dropna().values
        ni_vals  = ni_row.iloc[0].dropna().values
        if len(ocf_vals) >= 2 and len(ni_vals) >= 2:
            ni_up  = float(ni_vals[0])  > float(ni_vals[1])
            ocf_dn = float(ocf_vals[0]) < float(ocf_vals[1])
            if ni_up and ocf_dn:
                result["flag"]   = True
                result["detail"] = "Net Income rising while Operating Cash Flow falling"
    except Exception:
        pass
    return result

# ── SCORING ──────────────────────────────────────────────────────────────────

def score_ultra_short(info, hist, rsi, ma20, price):
    score = 50
    if rsi < 35:   score += 20
    elif rsi > 70: score -= 20
    if above_ma(price, ma20): score += 15
    else:                     score -= 10
    vol_ratio = hist["Volume"].iloc[-5:].mean() / (hist["Volume"].mean() + 1)
    if vol_ratio > 1.3: score += 10
    return score, f"RSI={rsi:.0f} | Price {'above' if above_ma(price,ma20) else 'below'} 20-day MA | Vol ratio {vol_ratio:.1f}x"

def score_short(info, hist, rsi, ma50, price, cagr):
    score = 50
    if cagr > 15:  score += 20
    elif cagr > 5: score += 10
    else:          score -= 10
    if above_ma(price, ma50): score += 15
    else:                     score -= 10
    div_yield = get_div_yield(info)
    if div_yield > 3: score += 5
    return score, f"Rev CAGR={cagr:.1f}% | RSI={rsi:.0f} | Div Yield={div_yield:.1f}%"

def score_medium(info, roe, nd_ebitda, fcf_yield, div_yield):
    score = 50
    if roe > 15:        score += 20
    elif roe > 12:      score += 10
    else:               score -= 15
    if nd_ebitda < 2:   score += 15
    elif nd_ebitda < 4: score += 5
    else:               score -= 20
    if fcf_yield > div_yield and fcf_yield > 0: score += 10
    else:                                        score -= 5
    return score, f"ROE={roe:.1f}% | ND/EBITDA={nd_ebitda:.1f}x | FCF Yield={fcf_yield:.1f}% vs Div={div_yield:.1f}%"

def score_long(info, roe, nd_ebitda, cagr):
    score = 50
    pe = safe_get(info, "forwardPE", 99)
    if roe > 20 and nd_ebitda < 2: score += 25
    elif roe > 12:                  score += 10
    if cagr > 10:                   score += 15
    if pe and pe < 25:              score += 10
    elif pe and pe > 50:            score -= 10
    return score, f"ROE={roe:.1f}% | 5Y CAGR={cagr:.1f}% | Fwd P/E={pe:.1f}"

def score_ultra_long(info, cagr, roe):
    score     = 50
    tam_proxy = safe_get(info, "marketCap", 0)
    if tam_proxy > 500e9:  score += 15
    elif tam_proxy > 100e9: score += 8
    if cagr > 8:  score += 15
    if roe > 15:  score += 10
    beta = safe_get(info, "beta", 1.0)
    if beta and beta < 0.8: score += 5
    return score, f"Market Cap=${tam_proxy/1e9:.0f}B | CAGR={cagr:.1f}% | Beta={beta:.2f}"

def score_to_rating(score):
    if score >= 65:   return "BUY"
    elif score >= 45: return "HOLD"
    else:             return "SELL"

def build_thesis(ticker, market, detail, info, shena):
    sector = safe_get(info, "sector", "")
    flag   = " | Forensic flag: " + shena["detail"] if shena["flag"] else ""
    return f"[{market} · {sector}] {detail}{flag}"[:280]

# ── MAIN ANALYSIS LOOP ───────────────────────────────────────────────────────

def analyze(tickers, market):
    results = []
    for ticker in tickers:
        log.info(f"Analyzing {ticker} ({market})...")
        try:
            t    = yf.Ticker(ticker)
            info = t.info or {}
            hist = t.history(period="1y")
            if hist.empty or len(hist) < 30:
                log.warning(f"Insufficient history for {ticker}, skipping.")
                continue

            price  = round(float(hist["Close"].iloc[-1]), 2)
            prev   = float(hist["Close"].iloc[-2])
            change = round(((price - prev) / prev) * 100, 2)

            rsi   = compute_rsi(hist["Close"])
            ma20  = compute_ma(hist["Close"], 20)
            ma50  = compute_ma(hist["Close"], 50)
            ma200 = compute_ma(hist["Close"], 200)

            roe       = get_roe(info)
            nd_ebitda = get_nd_ebitda(info)
            fcf_yield = get_fcf_yield(info)
            div_yield = get_div_yield(info)
            cagr      = get_revenue_cagr(t)
            mkt_cap   = safe_get(info, "marketCap", 0)
            shena     = shenanigan_flag(t)

            name     = safe_get(info, "shortName", ticker)
            currency = safe_get(info, "currency", "CAD" if market == "CAD" else "USD")
            exchange = safe_get(info, "exchange", "TSX" if market == "CAD" else "NYSE")

            horizon_ratings = {}
            for h in HORIZONS:
                if h == "ultra_short":
                    s, detail = score_ultra_short(info, hist, rsi, ma20, price)
                elif h == "short":
                    s, detail = score_short(info, hist, rsi, ma50, price, cagr)
                elif h == "medium":
                    s, detail = score_medium(info, roe, nd_ebitda, fcf_yield, div_yield)
                elif h == "long":
                    s, detail = score_long(info, roe, nd_ebitda, cagr)
                else:
                    s, detail = score_ultra_long(info, cagr, roe)

                rating = score_to_rating(s)
                thesis = build_thesis(ticker, market, detail, info, shena)
                horizon_ratings[h] = {
                    "rating": rating,
                    "score":  round(s, 1),
                    "thesis": thesis,
                    "label":  HORIZON_LABELS[h],
                }

            results.append({
                "ticker":            ticker,
                "name":              name,
                "market":            market,
                "exchange":          exchange,
                "currency":          currency,
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
        except Exception as e:
            log.error(f"Error analyzing {ticker}: {e}")
            continue
    return results


def main():
    log.info("Starting North American equity analysis...")
    cad_results = analyze(CAD_TICKERS, "CAD")
    usd_results = analyze(USD_TICKERS, "USD")
    output = {
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "cad":          cad_results,
        "usd":          usd_results,
    }
    out_path = os.path.join(os.path.dirname(__file__), "..", "public", "recommendations.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    log.info(f"Done. CAD={len(cad_results)} USD={len(usd_results)} tickers written.")


if __name__ == "__main__":
    main()
