"""
Forensic Accounting — Schilit's Shenanigans Checker
Flags:
  1. Net Income rising while Operating Cash Flow falling
  2. Days Sales Outstanding (DSO) growing faster than revenue
  3. Auto-downgrade high-debt CAD small-caps if 10Y Canada yield spikes > 50bps
"""

import pandas as pd
import numpy as np


def check_ni_vs_ocf(financials: dict) -> dict:
    """Flag if Net Income trend is up but Operating Cash Flow trend is down."""
    result = {"flag": False, "detail": ""}
    ni  = financials.get("net_income", [])
    ocf = financials.get("operating_cash_flow", [])
    if len(ni) < 2 or len(ocf) < 2:
        return result
    ni_trend  = ni[-1]  - ni[-2]
    ocf_trend = ocf[-1] - ocf[-2]
    if ni_trend > 0 and ocf_trend < 0:
        result["flag"]   = True
        result["detail"] = (
            f"NI rose ${ni_trend:,.0f} but OCF fell ${abs(ocf_trend):,.0f} — "
            "potential earnings quality issue (Shenanigan #1)"
        )
    return result


def check_dso(financials: dict) -> dict:
    """Flag if DSO is growing faster than revenue."""
    result = {"flag": False, "detail": ""}
    dso = financials.get("dso", [])
    rev = financials.get("revenue", [])
    if len(dso) < 2 or len(rev) < 2:
        return result
    dso_growth = (dso[-1] - dso[-2]) / max(abs(dso[-2]), 1)
    rev_growth = (rev[-1] - rev[-2]) / max(abs(rev[-2]), 1)
    if dso_growth > rev_growth and dso_growth > 0.05:
        result["flag"]   = True
        result["detail"] = (
            f"DSO grew {dso_growth:.1%} vs revenue growth {rev_growth:.1%} — "
            "receivables inflating faster than sales (Shenanigan #2)"
        )
    return result


def check_yield_spike(ticker: str, market: str, net_debt_ebitda: float,
                      market_cap_usd: float, yield_change_bps: float) -> dict:
    """Auto-downgrade high-debt CAD small-caps on 10Y Canada yield spike > 50bps."""
    result = {"flag": False, "action": "", "detail": ""}
    if market != "CAD":
        return result
    is_small_cap   = market_cap_usd < 2_000_000_000
    is_high_debt   = net_debt_ebitda > 3.0
    is_yield_spike = yield_change_bps > 50
    if is_small_cap and is_high_debt and is_yield_spike:
        result["flag"]   = True
        result["action"] = "DOWNGRADE → SELL/HOLD"
        result["detail"] = (
            f"{ticker}: 10Y Canada yield spiked {yield_change_bps:.0f}bps. "
            f"ND/EBITDA={net_debt_ebitda:.1f}x, small-cap. Auto-downgraded."
        )
    return result


def run_all_checks(ticker: str, market: str, financials: dict,
                   net_debt_ebitda: float = 0.0,
                   market_cap_usd: float  = 10e9,
                   yield_change_bps: float = 0.0) -> dict:
    """Run all forensic checks and return combined result."""
    ni_ocf = check_ni_vs_ocf(financials)
    dso    = check_dso(financials)
    yield_ = check_yield_spike(ticker, market, net_debt_ebitda,
                               market_cap_usd, yield_change_bps)
    flags = [f for f in [ni_ocf, dso, yield_] if f["flag"]]
    return {
        "ticker":          ticker,
        "shenanigan_flag": len(flags) > 0,
        "flag_count":      len(flags),
        "flags":           flags,
    }


if __name__ == "__main__":
    sample = {
        "net_income":          [100e6, 130e6],
        "operating_cash_flow": [90e6,  60e6],
        "dso":                 [35, 52],
        "revenue":             [500e6, 510e6],
    }
    result = run_all_checks("XYZ.TO", "CAD", sample,
                            net_debt_ebitda=3.5,
                            market_cap_usd=800e6,
                            yield_change_bps=65)
    import json
    print(json.dumps(result, indent=2))
