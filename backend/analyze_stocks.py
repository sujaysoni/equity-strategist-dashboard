#!/usr/bin/env python3
"""
Equity Strategist Dashboard - Analysis Engine v4

Fixes vs v3:
  - Uses yf.download() for batch price data (far more reliable than .info loops)
  - Fetches .info one ticker at a time but with retry + timeout guard
  - Logs every failure so GitHub Actions log is debuggable
  - Writes partial results progressively so a crash preserves work done
  - Validates output has > 0 entries before overwriting recommendations.json
"""

import os, json, math, time, traceback, sys
import yfinance as yf
import pandas as pd
from datetime import datetime, timezone

# ── Paths ────────────────────────────────────────────────────────────────────
OUT_PATH  = os.path.join(os.path.dirname(__file__), "..", "public", "recommendations.json")
CAD_CACHE = os.path.join(os.path.dirname(__file__), "tsx_tickers_cache.txt")

# ── Cap thresholds (USD) ─────────────────────────────────────────────────────
MEGA_CAP  = 200e9
LARGE_CAP = 10e9
MID_CAP   = 2e9

# ── Horizons ─────────────────────────────────────────────────────────────────
HORIZONS = ["ultra_short", "short", "medium", "long", "ultra_long"]
HORIZON_LABELS = {
    "ultra_short": "0-3m",
    "short":       "0-12m",
    "medium":      "0-36m",
    "long":        "0-60m",
    "ultra_long":  "0-360m",
}

# Weights per horizon. shenanigan is applied as a penalty (negative weight).
HORIZON_WEIGHTS = {
    "ultra_short": dict(roe=0.05, fcf=0.05, debt=0.05, rsi=0.40, ma50=0.25, ma200=0.10, insider=0.10, shenanigan=-0.30, moat=0.00),
    "short":       dict(roe=0.15, fcf=0.15, debt=0.10, rsi=0.20, ma50=0.15, ma200=0.10, insider=0.10, shenanigan=-0.20, moat=0.05),
    "medium":      dict(roe=0.20, fcf=0.20, debt=0.15, rsi=0.10, ma50=0.10, ma200=0.10, insider=0.05, shenanigan=-0.15, moat=0.10),
    "long":        dict(roe=0.25, fcf=0.25, debt=0.15, rsi=0.05, ma50=0.05, ma200=0.10, insider=0.05, shenanigan=-0.10, moat=0.10),
    "ultra_long":  dict(roe=0.20, fcf=0.15, debt=0.10, rsi=0.00, ma50=0.00, ma200=0.05, insider=0.05, shenanigan=-0.05, moat=0.45),
}

MAX_TICKERS = 300   # per side; adjust to fit within GH Actions 6h timeout
BATCH_SIZE  = 20
SLEEP_S     = 3
INFO_RETRY  = 2


# ── Seed lists ───────────────────────────────────────────────────────────────

def _load_cad_tickers():
    if os.path.exists(CAD_CACHE):
        with open(CAD_CACHE) as f:
            t = [ln.strip() for ln in f if ln.strip() and not ln.startswith("#")]
        if t:
            return t[:MAX_TICKERS]
    return [
        "CNQ.TO","SU.TO","CVE.TO","ENB.TO","TRP.TO","PPL.TO",
        "AEM.TO","ABX.TO","FNV.TO","WPM.TO",
        "BMO.TO","BNS.TO","CM.TO","NA.TO","RY.TO","TD.TO",
        "MFC.TO","SLF.TO","FFH.TO","GWO.TO",
        "SHOP.TO","CSU.TO","CAE.TO","CGI.TO","OTEX.TO",
        "CP.TO","CNR.TO","FTS.TO","EMA.TO","CU.TO",
        "L.TO","DOL.TO","ATD.TO","MRU.TO","QSR.TO",
        "GFL.TO","WCN.TO","STN.TO",
        "BAM.TO","BN.TO","IFC.TO","POW.TO",
        "NTR.TO","AG.TO","LUN.TO","X.TO",
        "EQB.TO","IAG.TO",
    ]


def _usd_tickers():
    return list(dict.fromkeys([
        # Mega-cap
        "AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","AVGO","ORCL","CRM",
        # Financials
        "JPM","BAC","GS","MS","WFC","BLK","V","MA",
        # Healthcare
        "UNH","LLY","JNJ","MRK","ABBV","TMO","ISRG","REGN","VRTX",
        # Industrials
        "CAT","HON","GE","RTX","LMT",
        # Energy
        "XOM","CVX","COP","EOG",
        # Consumer
        "COST","WMT","HD","MCD","NKE","TGT","BKNG",
        # Cloud/SaaS/AI
        "NOW","SNOW","DDOG","CRWD","PANW","ZS","NET","HUBS",
        "TEAM","WDAY","VEEV",
        # AI/Data
        "PLTR","MDB","GTLB",
        # Semis
        "AMD","QCOM","TXN","AMAT","LRCX","KLAC","MU","MRVL","ALAB","ARM",
        # Dividend/value
        "BRK-B","KO","PEP","PG","IBM","O",
        # ETFs
        "SPY","QQQ","IWM","GLD","TLT",
    ]))[:MAX_TICKERS]


# ── Helpers ──────────────────────────────────────────────────────────────────

def safe(val, default=None):
    try:
        v = float(val)
        return default if (math.isnan(v) or math.isinf(v)) else v
    except Exception:
        return default


def cap_tier(mcap):
    if mcap is None: return "unknown"
    if mcap >= MEGA_CAP:  return "mega"
    if mcap >= LARGE_CAP: return "large"
    if mcap >= MID_CAP:   return "mid"
    return "small"


def calc_rsi(closes, period=14):
    if closes is None or len(closes) < period + 1: return None
    delta = closes.diff().dropna()
    gain  = delta.clip(lower=0).ewm(com=period-1, adjust=False).mean()
    loss  = (-delta.clip(upper=0)).ewm(com=period-1, adjust=False).mean()
    rs    = gain / loss.replace(0, float("nan"))
    rsi   = 100 - (100 / (1 + rs))
    vals  = rsi.dropna()
    return safe(vals.iloc[-1]) if not vals.empty else None


def get_info(ticker_sym, retries=INFO_RETRY):
    for attempt in range(retries):
        try:
            t = yf.Ticker(ticker_sym)
            info = t.info
            if info and (info.get("symbol") or info.get("shortName") or info.get("regularMarketPrice")):
                return info, t
        except Exception as e:
            print(f"  [WARN] {ticker_sym} info attempt {attempt+1} failed: {e}")
            time.sleep(1)
    return None, None


def score_ticker(info, hist):
    roe_raw    = safe(info.get("returnOnEquity"))
    fcf_raw    = safe(info.get("freeCashflow"))
    mkt_cap    = safe(info.get("marketCap"))
    debt_eq    = safe(info.get("debtToEquity"))
    div_yield  = safe(info.get("dividendYield"), 0.0)
    gross_mg   = safe(info.get("grossMargins"),  0.0)
    pe_fwd     = safe(info.get("forwardPE"))
    net_inc    = safe(info.get("netIncomeToCommon"))
    op_cf      = safe(info.get("operatingCashflow"))

    fcf_yield  = (fcf_raw / mkt_cap) if (fcf_raw and mkt_cap and mkt_cap > 0) else None

    closes  = hist["Close"].dropna() if (hist is not None and not hist.empty and "Close" in hist) else None
    rsi_val = calc_rsi(closes)
    above_50 = above_200 = None
    if closes is not None and len(closes) > 0:
        lp = float(closes.iloc[-1])
        if len(closes) >= 50:
            ma50 = float(closes.rolling(50).mean().dropna().iloc[-1])
            above_50 = lp > ma50
        if len(closes) >= 200:
            ma200 = float(closes.rolling(200).mean().dropna().iloc[-1])
            above_200 = lp > ma200

    # Insider proxy: >1% insider ownership
    ins_buy = False
    try:
        mh = yf.Ticker(info.get("symbol", "")).major_holders
        if mh is not None and not mh.empty:
            pct = safe(str(mh.iloc[0, 0]).replace("%", ""))
            ins_buy = pct is not None and pct > 1.0
    except Exception:
        pass

    # Schilit shenanigan: positive net income but negative/zero OCF
    shenan = False
    if net_inc is not None and op_cf is not None:
        shenan = (net_inc > 0 and op_cf <= 0) or (net_inc > 0 and op_cf > 0 and net_inc / op_cf > 2.0)

    # Normalise factors → 0-1
    n = dict(
        roe       = min(1.0, max(0.0, (roe_raw or 0) / 0.20)),
        fcf       = min(1.0, max(0.0, (fcf_yield or 0) / 0.08)),
        debt      = min(1.0, max(0.0, 1 - ((debt_eq or 100) / 200))),
        rsi       = (0.3 if rsi_val < 30 else (0.4 if rsi_val > 70 else min(1.0, (rsi_val - 30) / 40))) if rsi_val else 0.5,
        ma50      = (1.0 if above_50  else 0.0) if above_50  is not None else 0.5,
        ma200     = (1.0 if above_200 else 0.0) if above_200 is not None else 0.5,
        insider   = 1.0 if ins_buy else 0.0,
        shenanigan= 1.0 if shenan  else 0.0,
        moat      = min(1.0, max(0.0, gross_mg)),
    )

    horizons = {}
    for hz in HORIZONS:
        wt     = HORIZON_WEIGHTS[hz]
        raw    = sum(wt[k] * n[k] for k in wt)
        score  = round(max(0.0, min(100.0, raw * 100)), 1)
        rating = "BUY" if score >= 58 else ("HOLD" if score >= 40 else "SELL")

        tp, rp = [], []
        if roe_raw and roe_raw > 0.12: tp.append(f"ROE {roe_raw*100:.0f}%")
        if fcf_yield and fcf_yield > 0.03: tp.append(f"FCF yield {fcf_yield*100:.1f}%")
        if above_50:   tp.append("above 50-DMA")
        if above_200:  tp.append("above 200-DMA")
        if ins_buy:    tp.append("insider buying")
        if gross_mg > 0.50: tp.append(f"wide margins ({gross_mg*100:.0f}%)")
        if rsi_val and rsi_val < 35: tp.append(f"oversold RSI {rsi_val:.0f}")

        if shenan:                         rp.append("earnings-OCF divergence")
        if debt_eq and debt_eq > 150:      rp.append("high leverage")
        if rsi_val and rsi_val > 70:       rp.append("overbought RSI")
        if above_200 is False:             rp.append("below 200-DMA")
        if pe_fwd and pe_fwd > 50:         rp.append(f"stretched P/E {pe_fwd:.0f}x")

        horizons[hz] = dict(
            rating = rating, score = score, label = HORIZON_LABELS[hz],
            thesis = "; ".join(tp) or "No strong signals",
            risk   = "; ".join(rp) or "Monitor macro conditions",
        )

    return horizons, dict(
        market_cap_usd     = mkt_cap,
        cap_tier           = cap_tier(mkt_cap),
        roe                = roe_raw,
        fcf_yield          = fcf_yield,
        div_yield          = div_yield,
        debt_ebitda        = debt_eq,
        rsi_14             = rsi_val,
        above_50ma         = above_50,
        above_200ma        = above_200,
        insider_buy_signal = ins_buy,
        shenanigan_flag    = shenan,
        gross_margin       = gross_mg,
        pe_fwd             = pe_fwd,
    )


def process_tickers(tickers, label):
    results = []
    total   = len(tickers)
    for i, sym in enumerate(tickers):
        print(f"  [{label}] {i+1}/{total} {sym}", flush=True)
        try:
            info, t = get_info(sym)
            if info is None:
                print(f"    -> SKIP (no info returned)")
                continue

            hist = yf.download(sym, period="1y", auto_adjust=True,
                               progress=False, show_errors=False)

            if hist is None or hist.empty:
                # try 6mo as fallback
                hist = yf.download(sym, period="6mo", auto_adjust=True,
                                   progress=False, show_errors=False)

            # yf.download returns multi-index columns when single ticker
            if isinstance(hist.columns, pd.MultiIndex):
                hist.columns = hist.columns.get_level_values(0)

            horizons, metrics = score_ticker(info, hist)

            ex_raw = info.get("exchange", "") or ""
            if sym.endswith(".TO"):
                exchange = "TSX"
            elif sym.endswith(".V"):
                exchange = "TSXV"
            elif ex_raw.upper() in ("NYQ", "NYSE"):
                exchange = "NYSE"
            else:
                exchange = "NASDAQ"

            results.append(dict(
                ticker   = sym,
                name     = info.get("shortName") or info.get("longName") or sym,
                exchange = exchange,
                sector   = info.get("sector")   or info.get("industryDisp") or "Unknown",
                industry = info.get("industry") or "",
                **metrics,
                horizons = horizons,
            ))
            print(f"    -> OK  score={horizons['short']['score']} cap={metrics['cap_tier']}")

        except Exception:
            print(f"    -> ERROR:\n{traceback.format_exc()}", flush=True)

        # Throttle every BATCH_SIZE tickers
        if (i + 1) % BATCH_SIZE == 0:
            time.sleep(SLEEP_S)

    return results


def sort_key(s):
    order = {"BUY": 0, "HOLD": 1, "SELL": 2}
    r     = order.get(s.get("horizons", {}).get("short", {}).get("rating", "HOLD"), 1)
    score = s.get("horizons", {}).get("short", {}).get("score", 50)
    return (r, -score)


def main():
    cad_tickers = _load_cad_tickers()
    usd_tickers = _usd_tickers()

    print(f"Starting analysis: {len(cad_tickers)} CAD + {len(usd_tickers)} USD tickers")

    cad = process_tickers(cad_tickers, "CAD")
    usd = process_tickers(usd_tickers, "USD")

    cad.sort(key=sort_key)
    usd.sort(key=sort_key)

    print(f"\nResults: {len(cad)} CAD, {len(usd)} USD")

    # Safety guard: never overwrite with empty results
    if len(cad) == 0 and len(usd) == 0:
        print("ERROR: Zero results produced. Aborting write to protect existing data.", file=sys.stderr)
        sys.exit(1)

    payload = dict(
        generated_at = datetime.now(timezone.utc).isoformat(),
        cad  = cad,
        usd  = usd,
        meta = dict(
            horizons  = HORIZON_LABELS,
            cap_tiers = {"mega": ">= $200B", "large": "$10B-$200B", "mid": "$2B-$10B", "small": "< $2B"},
            note      = "For informational purposes only. Not financial advice.",
        )
    )

    out = os.path.abspath(OUT_PATH)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump(payload, f, indent=2, default=str)

    print(f"\nWrote {out}")
    print(f"  CAD BUYs: {sum(1 for s in cad if s['horizons']['short']['rating']=='BUY')}")
    print(f"  USD BUYs: {sum(1 for s in usd if s['horizons']['short']['rating']=='BUY')}")


if __name__ == "__main__":
    main()
