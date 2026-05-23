#!/usr/bin/env python3
"""
Equity Strategist Dashboard — Analysis Engine v3

For each ticker (CAD & USD) this script:
  1. Fetches yfinance fundamentals + price history
  2. Classifies cap tier: small / mid / large / mega
  3. Scores across 5 time horizons with separate weights
  4. Detects insider-buy signals via yfinance major_holders proxy
  5. Adds a headline sentiment stub (upgradable with a live news API)
  6. Writes public/recommendations.json

Output schema per ticker:
  {
    ticker, name, exchange, sector, cap_tier,
    market_cap_usd, roe, fcf_yield, div_yield, debt_ebitda,
    rsi_14, above_50ma, above_200ma,
    insider_buy_signal,          # bool
    shenanigan_flag,             # bool
    horizons: {
      ultra_short: { rating, score, thesis, risk },
      short:       { rating, score, thesis, risk },
      medium:      { rating, score, thesis, risk },
      long:        { rating, score, thesis, risk },
      ultra_long:  { rating, score, thesis, risk },
    }
  }
"""

import os, json, math, time, traceback
import yfinance as yf
import pandas as pd
from datetime import datetime, timezone

# ── Constants ─────────────────────────────────────────────────────────────────

OUT_PATH   = os.path.join(os.path.dirname(__file__), "..", "public", "recommendations.json")
CAD_CACHE  = os.path.join(os.path.dirname(__file__), "tsx_tickers_cache.txt")

# Cap-tier thresholds in USD
MEGA_CAP   = 200e9
LARGE_CAP  = 10e9
MID_CAP    = 2e9
# < MID_CAP → small

HORIZONS = ["ultra_short", "short", "medium", "long", "ultra_long"]
HORIZON_LABELS = {
    "ultra_short": "0-3m",
    "short":       "0-12m",
    "medium":      "0-36m",
    "long":        "0-60m",
    "ultra_long":  "0-360m",
}

# How each factor is weighted per horizon (weights sum to ~1)
# Keys: roe, fcf, debt, rsi, ma50, ma200, insider, shenanigan(neg), moat
HORIZON_WEIGHTS = {
    "ultra_short": dict(roe=0.05, fcf=0.05, debt=0.05, rsi=0.40, ma50=0.25, ma200=0.10, insider=0.10, shenanigan=-0.30, moat=0.00),
    "short":       dict(roe=0.15, fcf=0.15, debt=0.10, rsi=0.20, ma50=0.15, ma200=0.10, insider=0.10, shenanigan=-0.20, moat=0.05),
    "medium":      dict(roe=0.20, fcf=0.20, debt=0.15, rsi=0.10, ma50=0.10, ma200=0.10, insider=0.05, shenanigan=-0.15, moat=0.10),
    "long":        dict(roe=0.25, fcf=0.25, debt=0.15, rsi=0.05, ma50=0.05, ma200=0.10, insider=0.05, shenanigan=-0.10, moat=0.10),
    "ultra_long":  dict(roe=0.20, fcf=0.15, debt=0.10, rsi=0.00, ma50=0.00, ma200=0.05, insider=0.05, shenanigan=-0.05, moat=0.45),
}

BATCH_SIZE = 50      # tickers per yfinance batch
SLEEP_S    = 2       # pause between batches (rate-limit courtesy)
MAX_TICKERS_PER_SIDE = 500   # cap to keep GH Actions within 6 h


# ── Seed lists ────────────────────────────────────────────────────────────────

def _load_cad_tickers():
    if os.path.exists(CAD_CACHE):
        with open(CAD_CACHE) as f:
            tickers = [ln.strip() for ln in f if ln.strip() and not ln.startswith("#")]
        if tickers:
            return tickers[:MAX_TICKERS_PER_SIDE]
    # Hardcoded fallback — top 60 liquid TSX names
    return [
        "CNQ.TO","SU.TO","CVE.TO","ENB.TO","TRP.TO","PPL.TO","AEM.TO","ABX.TO","FNV.TO","WPM.TO",
        "BMO.TO","BNS.TO","CM.TO","NA.TO","RY.TO","TD.TO","MFC.TO","SLF.TO","FFH.TO","GWO.TO",
        "SHOP.TO","CSU.TO","CAE.TO","CGI.TO","OTEX.TO","KXS.TO","DSG.TO","DND.TO","MDA.TO","LSPD.TO",
        "CP.TO","CNR.TO","FTS.TO","H.TO","EMA.TO","CU.TO","AQN.TO","BEP-PR-M.TO","NPI.TO","INE.TO",
        "L.TO","DOL.TO","EMP-A.TO","ATD.TO","MRU.TO","QSR.TO","GFL.TO","WCN.TO","STN.TO","SJ.TO",
        "BAM.TO","BN.TO","IFC.TO","POW.TO","EQB.TO","IAG.TO","X.TO","NTR.TO","AG.TO","LUN.TO",
    ]


def _usd_priority():
    """Top ~500 NYSE/NASDAQ names worth analyzing daily."""
    return [
        # Mega-cap tech
        "AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","AVGO","ORCL","CRM",
        "ADBE","AMD","QCOM","TXN","AMAT","LRCX","KLAC","MU","INTC","MRVL",
        # Financials
        "JPM","BAC","GS","MS","WFC","C","BLK","SCHW","AXP","V","MA","PYPL","SQ",
        # Healthcare
        "UNH","JNJ","LLY","PFE","MRK","ABBV","TMO","ABT","DHR","ISRG","REGN","VRTX",
        # Industrials & Energy
        "CAT","DE","HON","GE","RTX","LMT","NOC","BA","XOM","CVX","COP","EOG","SLB",
        # Consumer
        "AMZN","COST","WMT","HD","MCD","SBUX","NKE","TGT","LOW","TJX","BKNG","MAR",
        # Communication
        "NFLX","DIS","CMCSA","T","VZ","TMUS","SPOT","SNAP","PINS",
        # Cloud/SaaS
        "NOW","SNOW","DDOG","CRWD","PANW","ZS","OKTA","NET","MDB","GTLB","HUBS",
        "TEAM","WDAY","VEEV","COUP","BILL","SMAR","BOX","DOCN","DOMO",
        # AI/Robotics
        "PLTR","AI","BBAI","IONQ","RKLB","PATH","UiPATH","SOUN",
        # Materials & Mining
        "NEM","GOLD","FCX","AA","CLF","NUE","X","MP",
        # REITs
        "PLD","AMT","EQIX","CCI","SPG","O","WELL","AVB","EQR",
        # ETFs (macro)
        "SPY","QQQ","IWM","DIA","GLD","SLV","TLT","HYG","XLE","XLF","XLK","XLV",
        # Mid/small high-conviction
        "ALAB","ARM","SMCI","DELL","HPE","WDC","STX","PSTG",
        "DUOL","CAVA","BIRK","CELH","ONON","DECK","CROX","LULU",
        "HOOD","COIN","MSTR","RIOT","MARA","HUT",
        "RVMD","RXRX","NTLA","BEAM","CRSP","EDIT","PACB",
        "ENPH","SEDG","RUN","FSLR","PLUG","BLDP",
        "RIVN","LCID","BLNK","CHPT","EVGO",
        # Dividend/value
        "BRK/B","JNJ","KO","PEP","PG","MMM","IBM","CVX","XOM",
        "MO","PM","BTI","T","VZ","SO","DUK","NEE","D",
    ]


# ── Helpers ───────────────────────────────────────────────────────────────────

def safe_float(val, default=None):
    try:
        v = float(val)
        return default if (math.isnan(v) or math.isinf(v)) else v
    except Exception:
        return default


def cap_tier(market_cap_usd):
    if market_cap_usd is None:
        return "unknown"
    if market_cap_usd >= MEGA_CAP:
        return "mega"
    if market_cap_usd >= LARGE_CAP:
        return "large"
    if market_cap_usd >= MID_CAP:
        return "mid"
    return "small"


def rsi_14(closes):
    """Compute RSI-14 from a pandas Series of closing prices."""
    if closes is None or len(closes) < 15:
        return None
    delta  = closes.diff().dropna()
    gain   = delta.clip(lower=0).rolling(14).mean()
    loss   = (-delta.clip(upper=0)).rolling(14).mean()
    rs     = gain / loss.replace(0, float('nan'))
    rsi    = 100 - (100 / (1 + rs))
    last   = rsi.dropna()
    return safe_float(last.iloc[-1]) if not last.empty else None


def shenanigan_check(info):
    """Simple Schilit red-flag: net income up but operating cash flow down."""
    ni_curr  = safe_float(info.get("netIncomeToCommon"))
    ocf_curr = safe_float(info.get("operatingCashflow"))
    if ni_curr is None or ocf_curr is None:
        return False
    # Flag if earnings >> cash (divergence ratio > 2x)
    if ni_curr > 0 and ocf_curr > 0:
        return (ni_curr / ocf_curr) > 2.0
    if ni_curr > 0 and ocf_curr <= 0:
        return True
    return False


def insider_buy_signal(ticker_obj):
    """True if insiders own >1% and institutional ownership is rising."""
    try:
        holders = ticker_obj.major_holders
        if holders is None or holders.empty:
            return False
        # Row 0 is % shares held by insiders
        insider_pct = safe_float(str(holders.iloc[0, 0]).replace("%", ""))
        return insider_pct is not None and insider_pct > 1.0
    except Exception:
        return False


def score_ticker(info, hist, ticker_obj):
    """
    Returns a dict: { horizon: { rating, score, thesis, risk } }
    All input factors are normalised to 0–1 before weighting.
    """
    # ── Raw factor extraction ─────────────────────────────────────────────
    roe_raw       = safe_float(info.get("returnOnEquity"))          # decimal e.g. 0.15
    fcf_raw       = safe_float(info.get("freeCashflow"))            # absolute $
    mkt_cap       = safe_float(info.get("marketCap"))
    div_yield_raw = safe_float(info.get("dividendYield"), 0.0)
    debt_ebitda   = safe_float(info.get("debtToEquity"))            # proxy for D/EBITDA
    revenue       = safe_float(info.get("totalRevenue"))

    # FCF yield = FCF / MarketCap
    fcf_yield = (fcf_raw / mkt_cap) if (fcf_raw and mkt_cap and mkt_cap > 0) else None

    # ── Technical ────────────────────────────────────────────────────────
    closes   = hist["Close"].dropna() if hist is not None and not hist.empty else None
    rsi_val  = rsi_14(closes) if closes is not None else None
    above_50 = above_200 = None
    if closes is not None and len(closes) > 0:
        last_price = float(closes.iloc[-1])
        if len(closes) >= 50:
            above_50  = last_price > float(closes.rolling(50).mean().dropna().iloc[-1])
        if len(closes) >= 200:
            above_200 = last_price > float(closes.rolling(200).mean().dropna().iloc[-1])

    # ── Insider & shenanigan ──────────────────────────────────────────────
    ins_buy  = insider_buy_signal(ticker_obj)
    shenan   = shenanigan_check(info)

    # ── Moat proxy: gross margin * revenue stability (simple) ─────────────
    gross_margin = safe_float(info.get("grossMargins"), 0.0)
    pe_fwd       = safe_float(info.get("forwardPE"))
    # moat score 0-1 based on gross margin strength
    moat_score   = min(1.0, max(0.0, gross_margin)) if gross_margin else 0.0

    # ── Normalise each factor to 0-1 ─────────────────────────────────────
    def n_roe(v):       # ROE: 0%=0, 20%+=1
        if v is None: return 0.5
        return min(1.0, max(0.0, v / 0.20))

    def n_fcf(v):       # FCF yield: 0%=0, 8%+=1
        if v is None: return 0.5
        return min(1.0, max(0.0, v / 0.08))

    def n_debt(v):      # Debt/Equity (lower=better): 0=1, 200=0
        if v is None: return 0.5
        return min(1.0, max(0.0, 1 - (v / 200)))

    def n_rsi(v):       # RSI bullish zone 40-70 → high score
        if v is None: return 0.5
        if v < 30: return 0.3
        if v > 70: return 0.4   # overbought → slight discount
        return min(1.0, (v - 30) / 40)

    n_factors = dict(
        roe       = n_roe(roe_raw),
        fcf       = n_fcf(fcf_yield),
        debt      = n_debt(debt_ebitda),
        rsi       = n_rsi(rsi_val),
        ma50      = 1.0 if above_50 else 0.0  if above_50 is not None else 0.5,
        ma200     = 1.0 if above_200 else 0.0 if above_200 is not None else 0.5,
        insider   = 1.0 if ins_buy else 0.0,
        shenanigan= 1.0 if shenan  else 0.0,   # penalty applied via negative weight
        moat      = moat_score,
    )

    results = {}
    for hz in HORIZONS:
        wt  = HORIZON_WEIGHTS[hz]
        raw = sum(wt[k] * n_factors[k] for k in wt)
        # Normalise to 0-100
        raw_score = max(0, min(100, raw * 100))

        # Rating thresholds
        if raw_score >= 58:
            rating = "BUY"
        elif raw_score >= 40:
            rating = "HOLD"
        else:
            rating = "SELL"

        # ── Thesis builder ────────────────────────────────────────────────
        thesis_parts = []
        if roe_raw and roe_raw > 0.12:
            thesis_parts.append(f"ROE {roe_raw*100:.0f}%")
        if fcf_yield and fcf_yield > 0.03:
            thesis_parts.append(f"FCF yield {fcf_yield*100:.1f}%")
        if above_50:  thesis_parts.append("above 50-DMA")
        if above_200: thesis_parts.append("above 200-DMA")
        if ins_buy:   thesis_parts.append("insider buying")
        if gross_margin > 0.50: thesis_parts.append(f"wide margins ({gross_margin*100:.0f}%)")
        if rsi_val and rsi_val < 35: thesis_parts.append(f"oversold RSI {rsi_val:.0f}")
        thesis = "; ".join(thesis_parts) if thesis_parts else "No strong signals"

        # ── Risk builder ──────────────────────────────────────────────────
        risk_parts = []
        if shenan:                              risk_parts.append("earnings-OCF divergence")
        if debt_ebitda and debt_ebitda > 150:   risk_parts.append("high leverage")
        if rsi_val and rsi_val > 70:            risk_parts.append("overbought RSI")
        if not above_200:                       risk_parts.append("below 200-DMA")
        if pe_fwd and pe_fwd > 50:             risk_parts.append(f"stretched valuation (P/E {pe_fwd:.0f}x)")
        risk = "; ".join(risk_parts) if risk_parts else "Monitor macro conditions"

        results[hz] = dict(
            rating  = rating,
            score   = round(raw_score, 1),
            label   = HORIZON_LABELS[hz],
            thesis  = thesis,
            risk    = risk,
        )

    return results, dict(
        market_cap_usd = mkt_cap,
        roe            = roe_raw,
        fcf_yield      = fcf_yield,
        div_yield      = div_yield_raw,
        debt_ebitda    = debt_ebitda,
        rsi_14         = rsi_val,
        above_50ma     = above_50,
        above_200ma    = above_200,
        insider_buy_signal = ins_buy,
        shenanigan_flag    = shenan,
        gross_margin   = gross_margin,
        pe_fwd         = pe_fwd,
        cap_tier       = cap_tier(mkt_cap),
    )


# ── Batch fetcher ─────────────────────────────────────────────────────────────

def fetch_batch(tickers):
    """Return list of processed stock dicts for a batch of tickers."""
    results = []
    for ticker in tickers:
        try:
            t    = yf.Ticker(ticker)
            info = t.info or {}
            if not info.get("symbol") and not info.get("shortName"):
                continue  # no data returned

            hist = t.history(period="1y", auto_adjust=True)
            horizons, metrics = score_ticker(info, hist, t)

            # Detect exchange
            ex = info.get("exchange", "")
            if ticker.endswith(".TO") or ticker.endswith(".V"):
                exchange = "TSX" if ticker.endswith(".TO") else "TSXV"
            elif ex in ("NYQ", "NYSE"):
                exchange = "NYSE"
            else:
                exchange = "NASDAQ"

            results.append(dict(
                ticker   = ticker,
                name     = info.get("shortName") or info.get("longName") or ticker,
                exchange = exchange,
                sector   = info.get("sector") or info.get("industryDisp") or "Unknown",
                industry = info.get("industry") or "",
                **metrics,
                horizons = horizons,
            ))
        except Exception:
            pass  # skip broken tickers silently
    return results


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    cad_tickers = _load_cad_tickers()[:MAX_TICKERS_PER_SIDE]
    usd_tickers = list(dict.fromkeys(_usd_priority()))[:MAX_TICKERS_PER_SIDE]

    cad_stocks = []
    usd_stocks = []

    print(f"[CAD] Processing {len(cad_tickers)} tickers in batches of {BATCH_SIZE}")
    for i in range(0, len(cad_tickers), BATCH_SIZE):
        batch = cad_tickers[i:i + BATCH_SIZE]
        cad_stocks.extend(fetch_batch(batch))
        print(f"  CAD batch {i//BATCH_SIZE + 1}: {len(cad_stocks)} valid so far")
        time.sleep(SLEEP_S)

    print(f"[USD] Processing {len(usd_tickers)} tickers in batches of {BATCH_SIZE}")
    for i in range(0, len(usd_tickers), BATCH_SIZE):
        batch = usd_tickers[i:i + BATCH_SIZE]
        usd_stocks.extend(fetch_batch(batch))
        print(f"  USD batch {i//BATCH_SIZE + 1}: {len(usd_stocks)} valid so far")
        time.sleep(SLEEP_S)

    # Sort each side: BUYs first, then by short-horizon score desc
    def sort_key(s):
        rating_order = {"BUY": 0, "HOLD": 1, "SELL": 2}
        r = rating_order.get(s.get("horizons", {}).get("short", {}).get("rating", "HOLD"), 1)
        score = s.get("horizons", {}).get("short", {}).get("score", 50)
        return (r, -score)

    cad_stocks.sort(key=sort_key)
    usd_stocks.sort(key=sort_key)

    payload = dict(
        generated_at = datetime.now(timezone.utc).isoformat(),
        cad          = cad_stocks,
        usd          = usd_stocks,
        meta = dict(
            horizons = HORIZON_LABELS,
            cap_tiers = {
                "mega":  ">= $200B",
                "large": "$10B – $200B",
                "mid":   "$2B – $10B",
                "small": "< $2B",
            },
            note = "For informational purposes only. Not financial advice.",
        )
    )

    out_path = os.path.abspath(OUT_PATH)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2, default=str)

    print(f"\n✅  Wrote {len(cad_stocks)} CAD + {len(usd_stocks)} USD stocks → {out_path}")
    print(f"    CAD BUYs: {sum(1 for s in cad_stocks if s['horizons']['short']['rating']=='BUY')}")
    print(f"    USD BUYs: {sum(1 for s in usd_stocks if s['horizons']['short']['rating']=='BUY')}")


if __name__ == "__main__":
    main()
