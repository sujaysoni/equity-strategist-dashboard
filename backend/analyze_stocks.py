# backend/analyze_stocks.py
# Writes public/recommendations.json consumed by the React dashboard

import os
import json
import yfinance as yf
import pandas as pd


# ── Seed Lists ────────────────────────────────────────────────────────────────

def _usd_seed():
    return [
        "NVDA", "MSFT", "AAPL", "GOOGL", "META", "AMZN", "TSLA", "AVGO", "ORCL", "AMD",
        "CRM", "NOW", "SNOW", "PLTR", "DDOG", "NET", "ZS", "MDB", "PATH", "AI",
        "JPM", "BAC", "GS", "MS", "WFC", "BLK", "SCHW", "V", "MA", "AXP",
        "LLY", "UNH", "JNJ", "ABBV", "MRK", "PFE", "AMGN", "GILD", "REGN", "VRTX",
        "XOM", "CVX", "COP", "SLB", "HAL", "MPC", "PSX", "VLO", "OXY", "DVN",
        "CAT", "DE", "HON", "GE", "RTX", "LMT", "BA", "UPS", "FDX", "CSX",
        "NEE", "ENPH", "FSLR", "CEG", "SO", "DUK", "AEP", "EXC",
        "HD", "MCD", "SBUX", "NKE", "TGT", "COST", "WMT", "PG", "KO", "PEP",
        # ── PASTE THE REMAINING TICKERS FROM _usd_seed_updated.py BELOW THIS LINE ──
    ]


def _cad_seed():
    return [
        "RY.TO", "TD.TO", "BNS.TO", "BMO.TO", "CM.TO",
        "CNR.TO", "CP.TO", "ENB.TO", "TRP.TO", "SU.TO",
        "ABX.TO", "WPM.TO", "AEM.TO", "K.TO", "FM.TO",
        "SLF.TO", "MFC.TO", "GWO.TO", "IAG.TO", "POW.TO",
        "ATD.TO", "MRU.TO", "L.TO", "EMP-A.TO", "DOL.TO",
    ]


# ── Data Fetcher ──────────────────────────────────────────────────────────────

def fetch_fundamentals(ticker: str) -> dict:
    try:
        t    = yf.Ticker(ticker)
        info = t.info
        hist = t.history(period="1y")

        if hist.empty or len(hist) < 50:
            return {"ticker": ticker, "error": "Insufficient price history"}

        close = hist["Close"]
        ma50  = float(close.rolling(50).mean().iloc[-1])
        ma200 = float(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else None
        price = float(close.iloc[-1])

        delta = close.diff()
        gain  = delta.clip(lower=0).rolling(14).mean()
        loss  = (-delta.clip(upper=0)).rolling(14).mean()
        rs    = gain / loss
        rsi   = float((100 - 100 / (1 + rs)).iloc[-1])

        fcf        = info.get("freeCashflow")
        div_yield  = info.get("dividendYield") or 0
        roe        = info.get("returnOnEquity")
        net_debt   = (info.get("totalDebt") or 0) - (info.get("totalCash") or 0)
        ebitda     = info.get("ebitda")
        market_cap = info.get("marketCap")
        rev_growth = info.get("revenueGrowth")
        sector     = info.get("sector", "Unknown")
        name       = info.get("shortName", ticker)

        net_debt_ebitda = (net_debt / ebitda) if ebitda else None
        fcf_yield       = (fcf / market_cap)  if (fcf and market_cap) else None

        return {
            "ticker":          ticker,
            "name":            name,
            "sector":          sector,
            "price":           round(price, 2),
            "ma50":            round(ma50, 2),
            "ma200":           round(ma200, 2) if ma200 is not None else None,
            "rsi":             round(rsi, 2),
            "roe":             round(roe, 4)             if roe             is not None else None,
            "net_debt_ebitda": round(net_debt_ebitda, 2) if net_debt_ebitda is not None else None,
            "fcf_yield":       round(fcf_yield, 4)       if fcf_yield       is not None else None,
            "div_yield":       round(div_yield, 4),
            "rev_growth":      round(rev_growth, 4)      if rev_growth      is not None else None,
            "error":           None,
        }
    except Exception as e:
        return {"ticker": ticker, "error": str(e)}


# ── Rating Engine ─────────────────────────────────────────────────────────────

def rate_stock(d: dict) -> dict:
    if d.get("error"):
        return {**d, "rating": "N/A", "thesis": "Data error", "risk": d["error"], "score": None}

    score = 0
    flags = []
    risks = []

    # Trend
    if d["ma200"] and d["price"] > d["ma50"] > d["ma200"]:
        score += 2
        flags.append("above 50/200 MA")
    elif d["ma200"] and d["price"] < d["ma200"]:
        score -= 2
        flags.append("below 200 MA")

    # Momentum
    if 40 <= d["rsi"] <= 65:
        score += 1
    elif d["rsi"] > 75:
        score -= 1
        risks.append("overbought RSI")
    elif d["rsi"] < 30:
        score += 1
        flags.append("oversold — mean reversion candidate")

    # Quality: ROE
    if d["roe"] and d["roe"] > 0.12:
        score += 1
        flags.append(f"ROE {d['roe']*100:.1f}%")
    elif d["roe"] and d["roe"] < 0:
        score -= 1
        risks.append("negative ROE")

    # Leverage
    if d["net_debt_ebitda"] is not None:
        if d["net_debt_ebitda"] < 4.0:
            score += 1
        elif d["net_debt_ebitda"] > 6.0:
            score -= 2
            risks.append(f"high leverage {d['net_debt_ebitda']:.1f}x")

    # FCF vs Dividend (Schilit forensic check)
    if d["fcf_yield"] is not None:
        if d["fcf_yield"] > d["div_yield"]:
            score += 1
            flags.append("FCF covers dividend")
        elif d["div_yield"] > 0 and d["fcf_yield"] < d["div_yield"]:
            score -= 1
            risks.append("dividend not covered by FCF")

    # Growth
    if d["rev_growth"] and d["rev_growth"] > 0.15:
        score += 1
        flags.append(f"rev growth {d['rev_growth']*100:.1f}%")

    rating = "BUY" if score >= 4 else ("HOLD" if score >= 1 else "SELL")
    thesis = "; ".join(flags) if flags else "No strong signals"
    risk   = "; ".join(risks) if risks else "Execution risk / macro headwinds"

    return {**d, "rating": rating, "thesis": thesis, "risk": risk, "score": score}


# ── Main Runner ───────────────────────────────────────────────────────────────

def run_analysis(seed_fn, label: str) -> list:
    tickers = seed_fn()
    print(f"[{label}] Analysing {len(tickers)} tickers…")
    results = []
    for t in tickers:
        rated = rate_stock(fetch_fundamentals(t))
        rated["market"] = label
        if rated.get("rating") != "N/A":
            results.append(rated)
    results.sort(key=lambda x: (x.get("score") or -99), reverse=True)
    return results


if __name__ == "__main__":
    os.makedirs("public", exist_ok=True)

    usd_results = run_analysis(_usd_seed, "USD")
    cad_results = run_analysis(_cad_seed, "CAD")

    all_results = usd_results + cad_results

    out_path = "public/recommendations.json"
    with open(out_path, "w") as f:
        json.dump(all_results, f, indent=2)

    print(f"\n✅ Wrote {len(all_results)} recommendations to {out_path}")
    print(f"   USD: {len(usd_results)} | CAD: {len(cad_results)}")
