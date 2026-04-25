# backend/analyze_stocks.py
# Writes public/recommendations.json consumed by the React dashboard

import os
import json
import yfinance as yf
import pandas as pd
from datetime import datetime, timezone


# ── Seed Lists ────────────────────────────────────────────────────────────────

def _usd_seed():
    return [
        "A", "AA", "AACB", "AACBR", "AACBU", "AACG", "AACI", "AACIU", "AACIW", "AACO",
        "AACOU", "AACOW", "AACPU", "AAL", "AAME", "AAMI", "AAOI", "AAON", "AAP", "AAPG",
        "AAPL", "AARD", "AAT", "AAUC", "AB", "ABAT", "ABBV", "ABCB", "ABCL", "ABEO",
        "ABEV", "ABG", "ABLV", "ABLVW", "ABM", "ABNB", "ABOS", "ABR", "ABR^D", "ABR^E",
        "ABR^F", "ABSI", "ABT", "ABTC", "ABTS", "ABUS", "ABVC", "ABVE", "ABVEW", "ABVX",
        "ABX", "ABXL", "ACA", "ACAA", "ACAAU", "ACAAW", "ACAD", "ACB", "ACCL", "ACCO",
        "ACCS", "ACDC", "ACEL", "ACET", "ACFN", "ACGCU", "ACGL", "ACGLN", "ACGLO", "ACH",
        "ACHC", "ACHR", "ACHV", "ACI", "ACIC", "ACIU", "ACIW", "ACLS", "ACLX", "ACM",
        "ACMR", "ACN", "ACNB", "ACNT", "ACOG", "ACON", "ACONW", "ACP", "ACP^A", "ACR",
        "ACR^C", "ACR^D", "ACRE", "ACRS", "ACRV", "ACT", "ACTG", "ACTU", "ACU", "ACV",
        "ACVA", "ACXP", "AD", "ADAC", "ADACW", "ADAG", "ADAM", "ADAMG", "ADAMH", "ADAMI",
        "ADAML", "ADAMM", "ADAMN", "ADAMO", "ADAMZ", "ADBE", "ADC", "ADC^A", "ADCT", "ADEA",
        "ADGM", "ADI", "ADIL", "ADM", "ADMA", "ADNT", "ADP", "ADPT", "ADSE", "ADSEW",
        "ADSK", "ADT", "ADTN", "ADTX", "ADUR", "ADUS", "ADV", "ADVB", "ADX", "ADXN",
        "AEAQW", "AEBI", "AEC", "AEE", "AEF", "AEFC", "AEG", "AEHL", "AEHR", "AEI",
        "AEIS", "AEM", "AEMD", "AENT", "AENTW", "AEO", "AEON", "AEP", "AER", "AERO",
        "AERT", "AERTW", "AES", "AESI", "AEVA", "AEXA", "AEYE", "AFB", "AFBI", "AFCG",
        "AFG", "AFGB", "AFGC", "AFGD", "AFGE", "AFJK", "AFJKR", "AFJKU", "AFL", "AFRI",
        "AFRIW", "AFRM", "AFYA", "AG", "AGAE", "AGBK", "AGCC", "AGCO", "AGD", "AGEN",
        "AGH", "AGI", "AGIG", "AGIO", "AGL", "AGM", "AGM^D", "AGM^E", "AGM^F", "AGM^G",
        "AGM^H", "AGMB", "AGMH", "AGNC", "AGNCL", "AGNCM", "AGNCN", "AGNCO", "AGNCP", "AGNCZ",
        "AGO", "AGPU", "AGRO", "AGRZ", "AGX", "AGYS", "AHCO", "AHG", "AHL^D", "AHL^E",
        "AHL^F", "AHMA", "AHR", "AHRT", "AHRT^A", "AHT", "AHT^D", "AHT^F", "AHT^G", "AHT^H",
        "AHT^I", "AI", "AIB", "AIDX", "AIFF", "AIFU", "AIG", "AIHS", "AII", "AIIA",
        "AIIO", "AIIOW", "AIM", "AIMD", "AIMDW", "AIN", "AIO", "AIOS", "AIOT", "AIP",
        "AIR", "AIRE", "AIRG", "AIRI", "AIRJ", "AIRJW", "AIRO", "AIRS", "AIRT", "AIRTP",
        "AISP", "AISPW", "AIT", "AIV", "AIXC", "AIXI", "AIZ", "AIZN", "AJG", "AKA",
        "AKAM", "AKAN", "AKBA", "AKO/A", "AKO/B", "AKR", "AKTS", "AKTX", "ALAB", "ALAR",
        "ALB", "ALB^A", "ALBT", "ALC", "ALCO", "ALCY", "ALCYU", "ALCYW", "ALDF", "ALDFU",
        "ALDFW", "ALDX", "ALEC", "ALF", "ALFUU", "ALG", "ALGM", "ALGN", "ALGS", "ALGT",
        "ALH", "ALHC", "ALIS", "ALISR", "ALISU", "ALIT", "ALK", "ALKS", "ALKT", "ALL",
        "ALL^B", "ALL^H", "ALL^I", "ALL^J", "ALLE", "ALLO", "ALLR", "ALLT", "ALLY", "ALM",
        "ALMR", "ALMS", "ALMU", "ALNT", "ALNY", "ALOT", "ALOV", "ALOVU", "ALOVW", "ALOY",
        "ALP", "ALPS", "ALRM", "ALRS", "ALSN", "ALT", "ALTG", "ALTG^A", "ALTI", "ALTO",
        "ALTS", "ALV", "ALVO", "ALVOW", "ALX", "ALXO", "ALZN", "AM", "AMAL", "AMAT",
        "AMBA", "AMBO", "AMBP", "AMBQ", "AMBR", "AMC", "AMCI", "AMCR", "AMCX", "AMD",
        "AME", "AMG", "AMGN", "AMH", "AMH^G", "AMH^H", "AMIX", "AMKR", "AMLX", "AMN",
        "AMOD", "AMODW", "AMP", "AMPG", "AMPGR", "AMPGZ", "AMPH", "AMPL", "AMPX", "AMPY",
        "AMR", "AMRC", "AMRN", "AMRX", "AMRZ", "AMS", "AMSC", "AMSF", "AMST", "AMT",
        "AMTB", "AMTD", "AMTM", "AMTX", "AMWD", "AMWL", "AMX", "AMZE", "AMZN", "AN",
        "ANAB", "ANDE", "ANDG", "ANET", "ANF", "ANG^D", "ANGH", "ANGHW", "ANGI", "ANGO",
        "ANGX", "ANIK", "ANIP", "ANIX", "ANL", "ANNA", "ANNAW", "ANNX", "ANPA", "ANRO",
        "ANSC", "ANSCW", "ANTA", "ANTX", "ANVS", "ANY", "AOD", "AOMD", "AOMN", "AOMR",
        "AON", "AORT", "AOS", "AOSL", "AOUT", "AP", "APA", "APAC", "APACR", "APACU",
        "APAD", "APADR", "APADU", "APAM", "APC", "APD", "APEI", "APG", "APGE", "APH",
        "API", "APLD", "APLE", "APLM", "APLMW", "APLS", "APM", "APO", "APO^A", "APOG",
        "APOS", "APP", "APPF", "APPN", "APPS", "APRE", "APT", "APTV", "APVO", "APWC",
        "APXT", "APXTU", "APXTW", "APYX", "AQB", "AQMS", "AQN", "AQNB", "AQST", "AR",
        "ARAI", "ARAY", "ARBB", "ARBE", "ARBEW", "ARBK", "ARCB", "ARCC", "ARCI", "ARCIU",
        "ARCIW", "ARCO", "ARCT", "ARDC", "ARDT", "ARDX", "ARE", "AREC", "AREN", "ARES",
        "ARES^B", "ARGX", "ARHS", "ARI", "ARIS", "ARKO", "ARKR", "ARL", "ARLO", "ARLP",
        "ARM", "ARMK", "ARMP", "AROC", "AROW", "ARQ", "ARQQ", "ARQQW", "ARQT", "ARR",
        "ARR^C", "ARRY", "ARTC", "ARTCU", "ARTCW", "ARTL", "ARTNA", "ARTV", "ARTW", "ARVN",
        "ARW", "ARWR", "ARX", "ARXS", "AS", "ASA", "ASAN", "ASB", "ASB^E", "ASB^F",
        "ASBA", "ASBP", "ASBPW", "ASC", "ASG", "ASGI", "ASH", "ASIC", "ASIX", "ASLE",
        "ASM", "ASMB", "ASML", "ASND", "ASO", "ASPC", "ASPCU", "ASPI", "ASPN", "ASPS",
        "ASPSW", "ASPSZ", "ASR", "ASRT", "ASRV", "ASST", "ASTC", "ASTE", "ASTH", "ASTI",
        "ASTL", "ASTLW", "ASTS", "ASUR", "ASX", "ASYS", "ATAI", "ATAT", "ATCH", "ATCX",
        "ATEC", "ATEN", "ATER", "ATEX", "ATGL", "ATH^A", "ATH^B", "ATH^D", "ATH^E", "ATHE",
        "ATHM", "ATHR", "ATHS", "ATI", "ATII", "ATIIU", "ATIIW", "ATKR", "ATLC", "ATLCL",
        "ATLCP", "ATLCZ", "ATLN", "ATLO", "ATLX", "ATMU", "ATNI", "ATNM", "ATO", "ATOM",
        "ATOS", "ATPC", "ATR", "ATRA", "ATRC", "ATRO", "ATS", "ATXG", "ATYR", "AU",
        "AUB", "AUB^A", "AUBN", "AUDC", "AUGO", "AUID", "AUNA", "AUPH", "AUR", "AURA",
        "AURE", "AUROW", "AUST", "AUTL", "AUUD", "AVA", "AVAH", "AVAL", "AVAV", "AVB",
        "AVBC", "AVBH", "AVBP", "AVD", "AVEX", "AVGO", "AVIR", "AVK", "AVNS", "AVNT",
        "AVNW", "AVO", "AVPT", "AVR", "AVT", "AVTR", "AVTX", "AVX", "AVXL", "AVY",
        "AWF", "AWI", "AWK", "AWP", "AWR", "AWRE", "AWX", "AX", "AXG", "AXGN",
        "AXIA", "AXIA^", "AXIA^C", "AXIL", "AXIN", "AXINR", "AXINU", "AXON", "AXP", "AXR",
        "AXS", "AXS^E", "AXSM", "AXTA", "AXTI", "AYI", "AYTU", "AZ", "AZI", "AZN",
        "AZO", "AZTA", "AZTR", "AZZ",
    ]


def _cad_seed():
    # Placeholder — auto-replaced by backend/fetch_tsx_tickers.py
    # Run `python backend/fetch_tsx_tickers.py` to populate with full TSX listing
    return [
        "RY.TO", "TD.TO", "BNS.TO", "BMO.TO", "CM.TO", "NA.TO",
        "SLF.TO", "MFC.TO", "GWO.TO", "IAG.TO", "IFC.TO", "FFH.TO",
        "ENB.TO", "TRP.TO", "SU.TO", "CNQ.TO", "CVE.TO", "IMO.TO",
        "ARX.TO", "BTE.TO", "WCP.TO", "VET.TO", "PPL.TO", "GEI.TO",
        "ABX.TO", "WPM.TO", "AEM.TO", "K.TO", "AGI.TO", "DPM.TO",
        "OR.TO", "FNV.TO", "ELD.TO", "IMG.TO", "SSL.TO",
        "FM.TO", "CS.TO", "LUN.TO", "HBM.TO", "ERO.TO",
        "CCO.TO", "NXE.TO",
        "CNR.TO", "CP.TO", "CAE.TO", "WSP.TO", "STN.TO",
        "ATS.TO", "MDA.TO",
        "BCE.TO", "T.TO", "RCI-B.TO",
        "HR-UN.TO", "AP-UN.TO", "CAR-UN.TO", "BEI-UN.TO", "FCR-UN.TO",
        "ATD.TO", "MRU.TO", "L.TO", "EMP-A.TO", "DOL.TO", "CTC-A.TO",
        "GIL.TO", "ATZ.TO",
        "FTS.TO", "EMA.TO", "CU.TO", "BEP-UN.TO", "NPI.TO",
        "POW.TO", "IGM.TO", "BAM.TO", "BN.TO", "EQB.TO",
        "CSU.TO", "DSG.TO", "SHOP.TO", "DCBO.TO", "ENGH.TO",
        "AFN.TO", "NTR.TO",
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
    print(f"[{label}] Analysing {len(tickers)} tickers...")
    results = []
    for t in tickers:
        rated = rate_stock(fetch_fundamentals(t))
        rated["market"] = label
        if rated.get("rating") != "N/A":
            results.append(rated)
    # Sort highest score → lowest so the frontend slice(0, 30) gets the best stocks
    results.sort(key=lambda x: (x.get("score") or -99), reverse=True)
    return results


if __name__ == "__main__":
    os.makedirs("public", exist_ok=True)

    usd_results = run_analysis(_usd_seed, "USD")
    cad_results = run_analysis(_cad_seed, "CAD")

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cad": cad_results,
        "usd": usd_results,
    }

    out_path = "public/recommendations.json"
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)

    print(f"\n✅ Wrote {len(cad_results)} CAD + {len(usd_results)} USD recommendations to {out_path}")
