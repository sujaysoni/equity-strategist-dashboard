def analyze(tickers, market):
    results = []
    seen = set()                          # ← dedupe guard
    for ticker in tickers:
        if ticker in seen:                # ← skip duplicates
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
                if h == "ultra_short":  s, d = score_ultra_short(info, hist, rsi, ma20, price)
                elif h == "short":      
