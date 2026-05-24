#!/usr/bin/env python3
"""
Equity Strategist Dashboard - Analysis Engine v8

Universe sourcing:
  - Primary: tsx_tickers_cache.txt  (CAD)  + nyse_tickers_cache.txt  (USD)
  - These cache files are refreshed by fetch_tsx_tickers.py / fetch_nyse_tickers.py
    each run, so the tracked count changes day-to-day as tickers enter/leave the exchanges.
  - FUNDAMENTALS dict below is a *seed fallback only* — used when live yfinance
    fetch returns nothing for a field.  Any ticker in the cache is analyzed even
    if it has no seed entry.

Fundamentals sourcing priority (per ticker):
  1. yf.Ticker fast_info   -> market_cap, current_price, shares_outstanding
  2. yf.Ticker financials  -> ROE (net_income / total_equity), gross_margin
  3. yf.Ticker cashflow    -> FCF yield  (operatingCashflow - capex) / mkt_cap
  4. yf.Ticker info        -> div_yield, pe_fwd, debt/equity (attempted; may be blocked)
  5. Static seed dict      -> fallback for any field that failed live fetch

A 'data_source' field is written per ticker:
  'live_yahoo'    = all key fields fetched live
  'partial_yahoo' = some fields live, some from static seed
  'static_seed'   = live fetch failed entirely; all values from seed dict
"""

import os, json, math, time, traceback, sys
import yfinance as yf
import pandas as pd
from datetime import datetime, timezone

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_PATH    = os.path.join(BACKEND_DIR, "..", "public", "recommendations.json")

# Cache file paths (written by fetch_tsx_tickers.py / fetch_nyse_tickers.py)
TSX_CACHE_TXT  = os.path.join(BACKEND_DIR, "tsx_tickers_cache.txt")
NYSE_CACHE_TXT = os.path.join(BACKEND_DIR, "nyse_tickers_cache.txt")

MEGA_CAP  = 200e9
LARGE_CAP = 10e9
MID_CAP   = 2e9

HORIZONS = ["ultra_short", "short", "medium", "long", "ultra_long"]
HORIZON_LABELS = {
    "ultra_short": "0-3m", "short": "0-12m", "medium": "0-36m",
    "long": "0-60m",       "ultra_long": "0-360m",
}
HORIZON_WEIGHTS = {
    "ultra_short": dict(roe=0.05,fcf=0.05,debt=0.05,rsi=0.40,ma50=0.25,ma200=0.10,insider=0.10,shenanigan=-0.30,moat=0.00),
    "short":       dict(roe=0.15,fcf=0.15,debt=0.10,rsi=0.20,ma50=0.15,ma200=0.10,insider=0.10,shenanigan=-0.20,moat=0.05),
    "medium":      dict(roe=0.20,fcf=0.20,debt=0.15,rsi=0.10,ma50=0.10,ma200=0.10,insider=0.05,shenanigan=-0.15,moat=0.10),
    "long":        dict(roe=0.25,fcf=0.25,debt=0.15,rsi=0.05,ma50=0.05,ma200=0.10,insider=0.05,shenanigan=-0.10,moat=0.10),
    "ultra_long":  dict(roe=0.20,fcf=0.15,debt=0.10,rsi=0.00,ma50=0.00,ma200=0.05,insider=0.05,shenanigan=-0.05,moat=0.45),
}

BATCH_SIZE = 10   # smaller batches to avoid rate-limiting
SLEEP_S    = 3

# ---------------------------------------------------------------------------
# STATIC FUNDAMENTALS SEED  (fallback only — used when live fetch fails)
# Format: ticker -> (name, exchange, sector, industry, market_cap_usd,
#                    roe, fcf_yield, div_yield, debt_eq, gross_margin,
#                    pe_fwd, net_inc_pos, op_cf_pos, insider_pct)
# ---------------------------------------------------------------------------
FUNDAMENTALS = {
    # ---- CAD ----------------------------------------------------------------
    "CNQ.TO":  ("Canadian Natural Resources","TSX","Energy","Oil & Gas E&P",62.8e9, 0.21,0.072,0.045,80,0.48,12.1,True,True,3.5),
    "SU.TO":   ("Suncor Energy","TSX","Energy","Oil & Gas Integrated",52e9,  0.175,0.082,0.043,90,0.44,10.2,True,True,0.5),
    "CVE.TO":  ("Cenovus Energy","TSX","Energy","Oil & Gas Integrated",33e9,  0.14,0.065,0.030,120,0.38,9.8,True,True,0.4),
    "ENB.TO":  ("Enbridge Inc.","TSX","Energy","Midstream",88e9,           0.082,0.055,0.068,210,0.39,18.2,True,True,0.3),
    "TRP.TO":  ("TC Energy","TSX","Energy","Midstream",52e9,               0.071,0.048,0.072,250,0.36,15.4,True,True,0.2),
    "PPL.TO":  ("Pembina Pipeline","TSX","Energy","Midstream",21e9,         0.095,0.058,0.052,180,0.41,14.8,True,True,0.4),
    "AEM.TO":  ("Agnico Eagle Mines","TSX","Basic Materials","Gold Mining",48e9,0.098,0.041,0.022,50,0.42,22,True,True,2.1),
    "ABX.TO":  ("Barrick Gold","TSX","Basic Materials","Gold Mining",32e9,   0.065,0.038,0.018,60,0.38,18.5,True,True,0.8),
    "FNV.TO":  ("Franco-Nevada","TSX","Basic Materials","Gold Streaming",28e9,0.072,0.022,0.012,0,0.87,36,True,True,1.1),
    "WPM.TO":  ("Wheaton Precious Metals","TSX","Basic Materials","Gold Streaming",33e9,0.092,0.031,0.011,0,0.81,35,True,True,0.9),
    "BMO.TO":  ("Bank of Montreal","TSX","Financial Services","Banks",73e9,  0.122,0.042,0.045,150,0.59,11.2,True,True,0.5),
    "BNS.TO":  ("Bank of Nova Scotia","TSX","Financial Services","Banks",62e9,0.108,0.039,0.058,160,0.56,10.1,True,True,0.4),
    "CM.TO":   ("CIBC","TSX","Financial Services","Banks",56e9,             0.135,0.044,0.052,140,0.61,10.8,True,True,0.3),
    "NA.TO":   ("National Bank","TSX","Financial Services","Banks",38e9,    0.158,0.048,0.035,130,0.63,12.4,True,True,0.6),
    "RY.TO":   ("Royal Bank of Canada","TSX","Financial Services","Banks",171e9,0.158,0.051,0.038,120,0.62,13.4,True,True,0.4),
    "TD.TO":   ("Toronto-Dominion Bank","TSX","Financial Services","Banks",109e9,0.131,0.048,0.050,150,0.58,11.8,True,True,0.3),
    "MFC.TO":  ("Manulife Financial","TSX","Financial Services","Insurance",48e9,0.142,0.052,0.042,80,0.64,10.5,True,True,0.5),
    "SLF.TO":  ("Sun Life Financial","TSX","Financial Services","Insurance",36e9,0.131,0.049,0.038,70,0.61,12.1,True,True,0.4),
    "FFH.TO":  ("Fairfax Financial","TSX","Financial Services","Insurance",28e9,0.185,0.062,0.012,60,0.71,9.2,True,True,1.8),
    "GWO.TO":  ("Great-West Lifeco","TSX","Financial Services","Insurance",22e9,0.128,0.046,0.048,90,0.59,11.4,True,True,0.3),
    "SHOP.TO": ("Shopify Inc.","TSX","Technology","Internet Commerce",141e9, 0.112,0.019,0.000,20,0.51,62,True,True,0.2),
    "CSU.TO":  ("Constellation Software","TSX","Technology","Software",78e9, 0.318,0.028,0.002,30,0.77,38,True,True,2.8),
    "CAE.TO":  ("CAE Inc.","TSX","Industrials","Aerospace",7.2e9,           0.082,0.031,0.008,140,0.44,21,True,True,0.4),
    "CGI.TO":  ("CGI Inc.","TSX","Technology","IT Services",21e9,           0.178,0.068,0.000,60,0.34,19.2,True,True,0.6),
    "OTEX.TO": ("Open Text","TSX","Technology","Software",9.8e9,            0.092,0.058,0.028,180,0.71,14.5,True,True,0.3),
    "CP.TO":   ("Canadian Pacific Kansas City","TSX","Industrials","Railroads",69e9,0.089,0.032,0.008,280,0.58,24,True,True,0.2),
    "CNR.TO":  ("Canadian National Railway","TSX","Industrials","Railroads",72e9,0.248,0.042,0.022,150,0.63,20.4,True,True,0.5),
    "FTS.TO":  ("Fortis Inc.","TSX","Utilities","Electric Utilities",22e9,   0.072,0.038,0.042,160,0.52,18.2,True,True,0.4),
    "EMA.TO":  ("Emera Inc.","TSX","Utilities","Electric Utilities",12e9,    0.068,0.035,0.058,200,0.49,17.8,True,True,0.3),
    "CU.TO":   ("Canadian Utilities","TSX","Utilities","Electric Utilities",8.5e9,0.062,0.041,0.052,180,0.46,16.5,True,True,0.4),
    "L.TO":    ("Loblaw Companies","TSX","Consumer Staples","Grocery Retail",34e9,0.195,0.048,0.018,120,0.31,19.8,True,True,0.5),
    "DOL.TO":  ("Dollarama","TSX","Consumer Staples","Discount Retail",28e9, 0.412,0.038,0.004,90,0.44,34,True,True,0.8),
    "ATD.TO":  ("Alimentation Couche-Tard","TSX","Consumer Staples","Convenience Retail",58e9,0.238,0.055,0.011,80,0.34,18.2,True,True,1.2),
    "MRU.TO":  ("Metro Inc.","TSX","Consumer Staples","Grocery Retail",16e9, 0.158,0.042,0.018,90,0.28,17.5,True,True,0.4),
    "QSR.TO":  ("Restaurant Brands Intl.","TSX","Consumer Cyclical","Fast Food",28e9,0.091,0.055,0.032,420,0.52,21.4,True,True,0.3),
    "GFL.TO":  ("GFL Environmental","TSX","Industrials","Waste Management",14e9,0.042,0.028,0.002,280,0.31,42,True,False,0.4),
    "WCN.TO":  ("Waste Connections","TSX","Industrials","Waste Management",38e9,0.132,0.038,0.008,80,0.42,32,True,True,0.5),
    "STN.TO":  ("Stantec","TSX","Industrials","Engineering",9.2e9,           0.148,0.045,0.012,60,0.55,22.8,True,True,0.8),
    "BAM.TO":  ("Brookfield Asset Mgmt.","TSX","Financial Services","Asset Management",98e9,0.148,0.038,0.031,110,0.71,32,True,True,2.2),
    "BN.TO":   ("Brookfield Corp.","TSX","Financial Services","Diversified",82e9,0.092,0.028,0.008,120,0.68,28,True,True,1.8),
    "IFC.TO":  ("Intact Financial","TSX","Financial Services","P&C Insurance",35e9,0.142,0.052,0.022,50,0.72,18.4,True,True,0.6),
    "POW.TO":  ("Power Corporation","TSX","Financial Services","Diversified",21e9,0.118,0.048,0.058,90,0.61,11.2,True,True,0.4),
    "NTR.TO":  ("Nutrien Ltd.","TSX","Basic Materials","Agricultural Inputs",31e9,0.071,0.045,0.038,180,0.31,18,True,True,0.3),
    "AG.TO":   ("First Majestic Silver","TSX","Basic Materials","Silver Mining",2.1e9,0.048,0.018,0.000,40,0.28,35,True,False,1.2),
    "LUN.TO":  ("Lundin Mining","TSX","Basic Materials","Copper Mining",9.8e9, 0.118,0.058,0.022,60,0.38,12.4,True,True,0.8),
    "X.TO":    ("TMX Group","TSX","Financial Services","Financial Exchanges",6.8e9,0.152,0.048,0.028,80,0.62,22.4,True,True,0.5),
    "EQB.TO":  ("EQB Inc.","TSX","Financial Services","Banks",3.8e9,          0.162,0.055,0.028,110,0.65,8.9,True,True,1.2),
    "IAG.TO":  ("iA Financial","TSX","Financial Services","Insurance",9.2e9,  0.138,0.051,0.035,70,0.62,10.8,True,True,0.5),
    # ---- USD ----------------------------------------------------------------
    "AAPL":    ("Apple Inc.","NASDAQ","Technology","Consumer Electronics",3200e9,1.47,0.033,0.005,90,0.461,31,True,True,0.1),
    "MSFT":    ("Microsoft Corp.","NASDAQ","Technology","Software",3100e9,    0.371,0.022,0.007,40,0.700,33,True,True,0.1),
    "NVDA":    ("NVIDIA Corp.","NASDAQ","Technology","Semiconductors",2850e9,  0.891,0.018,0.001,30,0.782,37,True,True,0.1),
    "GOOGL":   ("Alphabet Inc.","NASDAQ","Communication Services","Internet Content",2050e9,0.321,0.034,0.005,10,0.587,20,True,True,0.1),
    "AMZN":    ("Amazon.com Inc.","NASDAQ","Consumer Cyclical","Internet Retail",2200e9,0.241,0.021,0.000,60,0.498,38,True,True,0.1),
    "META":    ("Meta Platforms","NASDAQ","Communication Services","Internet Content",1470e9,0.362,0.031,0.004,10,0.816,25,True,True,0.1),
    "TSLA":    ("Tesla Inc.","NASDAQ","Consumer Cyclical","Auto Manufacturers",1080e9,0.098,0.008,0.000,50,0.178,128,True,False,0.1),
    "AVGO":    ("Broadcom Inc.","NASDAQ","Technology","Semiconductors",780e9,  0.512,0.028,0.012,120,0.641,32,True,True,0.2),
    "ORCL":    ("Oracle Corp.","NYSE","Technology","Software",480e9,           0.000,0.021,0.008,0,0.719,32,True,True,0.1),
    "CRM":     ("Salesforce Inc.","NYSE","Technology","Software",320e9,        0.098,0.025,0.005,30,0.768,32,True,True,0.1),
    "JPM":     ("JPMorgan Chase","NYSE","Financial Services","Banks",750e9,    0.178,0.049,0.022,180,0.620,14,True,True,1.2),
    "BAC":     ("Bank of America","NYSE","Financial Services","Banks",330e9,   0.098,0.038,0.025,160,0.580,13,True,True,0.4),
    "GS":      ("Goldman Sachs","NYSE","Financial Services","Investment Banking",168e9,0.142,0.052,0.022,0,0.720,14,True,True,0.5),
    "MS":      ("Morgan Stanley","NYSE","Financial Services","Investment Banking",195e9,0.128,0.048,0.028,0,0.690,17,True,True,0.4),
    "WFC":     ("Wells Fargo","NYSE","Financial Services","Banks",235e9,       0.118,0.042,0.028,150,0.610,13,True,True,0.3),
    "BLK":     ("BlackRock Inc.","NYSE","Financial Services","Asset Management",148e9,0.178,0.058,0.025,50,0.780,21,True,True,0.5),
    "V":       ("Visa Inc.","NYSE","Financial Services","Payment Processing",590e9,0.528,0.031,0.008,80,0.804,29,True,True,0.2),
    "MA":      ("Mastercard Inc.","NYSE","Financial Services","Payment Processing",472e9,0.000,0.028,0.006,0,0.792,30,True,True,0.2),
    "UNH":     ("UnitedHealth Group","NYSE","Healthcare","Health Insurance",390e9,0.258,0.042,0.018,60,0.241,18,True,True,0.3),
    "LLY":     ("Eli Lilly","NYSE","Healthcare","Drug Manufacturers",720e9,   0.512,0.014,0.006,110,0.812,46,True,True,0.2),
    "JNJ":     ("Johnson & Johnson","NYSE","Healthcare","Drug Manufacturers",375e9,0.218,0.041,0.032,50,0.692,15,True,True,0.3),
    "MRK":     ("Merck & Co.","NYSE","Healthcare","Drug Manufacturers",248e9,  0.392,0.048,0.028,80,0.718,12,True,True,0.3),
    "ABBV":    ("AbbVie Inc.","NYSE","Healthcare","Drug Manufacturers",312e9,  0.000,0.038,0.032,350,0.702,15,True,True,0.4),
    "TMO":     ("Thermo Fisher","NYSE","Healthcare","Life Sciences",198e9,     0.142,0.035,0.003,80,0.512,28,True,True,0.2),
    "ISRG":    ("Intuitive Surgical","NASDAQ","Healthcare","Medical Devices",168e9,0.182,0.028,0.000,10,0.672,62,True,True,0.2),
    "REGN":    ("Regeneron","NASDAQ","Healthcare","Drug Manufacturers",78e9,   0.218,0.048,0.000,10,0.712,15,True,True,0.4),
    "VRTX":    ("Vertex Pharma","NASDAQ","Healthcare","Drug Manufacturers",128e9,0.298,0.038,0.000,10,0.728,32,True,True,0.3),
    "CAT":     ("Caterpillar Inc.","NYSE","Industrials","Farm & Construction",152e9,0.562,0.038,0.018,0,0.412,16,True,True,0.3),
    "HON":     ("Honeywell Intl.","NASDAQ","Industrials","Conglomerate",138e9, 0.328,0.042,0.022,150,0.341,20,True,True,0.2),
    "GE":      ("GE Aerospace","NYSE","Industrials","Aerospace",196e9,         0.398,0.028,0.008,0,0.382,38,True,True,0.3),
    "RTX":     ("RTX Corp.","NYSE","Industrials","Defense",172e9,              0.128,0.038,0.022,100,0.362,21,True,True,0.2),
    "LMT":     ("Lockheed Martin","NYSE","Industrials","Defense",112e9,        0.000,0.062,0.028,0,0.318,18,True,True,0.2),
    "XOM":     ("Exxon Mobil","NYSE","Energy","Oil & Gas Integrated",498e9,    0.142,0.058,0.038,20,0.412,14,True,True,0.3),
    "CVX":     ("Chevron Corp.","NYSE","Energy","Oil & Gas Integrated",278e9,  0.118,0.062,0.042,20,0.388,15,True,True,0.4),
    "COP":     ("ConocoPhillips","NYSE","Energy","Oil & Gas E&P",128e9,        0.178,0.072,0.028,30,0.458,13,True,True,0.5),
    "EOG":     ("EOG Resources","NYSE","Energy","Oil & Gas E&P",68e9,          0.218,0.082,0.032,10,0.548,12,True,True,0.8),
    "COST":    ("Costco Wholesale","NASDAQ","Consumer Staples","Discount Retail",398e9,0.318,0.028,0.008,50,0.128,52,True,True,0.2),
    "WMT":     ("Walmart Inc.","NYSE","Consumer Staples","Grocery Retail",742e9,0.148,0.022,0.012,90,0.248,32,True,True,0.1),
    "HD":      ("Home Depot","NYSE","Consumer Cyclical","Home Improvement",368e9,0.000,0.038,0.022,0,0.332,24,True,True,0.2),
    "MCD":     ("McDonald's Corp.","NYSE","Consumer Cyclical","Fast Food",212e9,0.000,0.058,0.022,0,0.572,22,True,True,0.2),
    "NKE":     ("Nike Inc.","NYSE","Consumer Cyclical","Footwear",92e9,        0.258,0.042,0.018,80,0.442,26,True,True,0.2),
    "TGT":     ("Target Corp.","NYSE","Consumer Staples","Discount Retail",48e9,0.218,0.048,0.038,90,0.298,15,True,True,0.3),
    "BKNG":    ("Booking Holdings","NASDAQ","Consumer Cyclical","Online Travel",178e9,0.000,0.042,0.000,0,0.782,26,True,True,0.2),
    "NOW":     ("ServiceNow","NYSE","Technology","Software",195e9,             0.198,0.023,0.000,40,0.788,58,True,True,0.2),
    "SNOW":    ("Snowflake Inc.","NYSE","Technology","Data Cloud",52e9,         0.000,0.012,0.000,10,0.672,182,True,False,0.2),
    "DDOG":    ("Datadog Inc.","NASDAQ","Technology","Observability",38e9,     0.082,0.018,0.000,10,0.782,68,True,True,0.3),
    "CRWD":    ("CrowdStrike","NASDAQ","Technology","Cybersecurity",96e9,       0.162,0.019,0.000,80,0.752,82,True,True,0.2),
    "PANW":    ("Palo Alto Networks","NASDAQ","Technology","Cybersecurity",128e9,0.312,0.022,0.000,90,0.752,52,True,True,0.2),
    "ZS":      ("Zscaler Inc.","NASDAQ","Technology","Cybersecurity",38e9,     0.142,0.015,0.000,20,0.782,78,True,True,0.3),
    "NET":     ("Cloudflare Inc.","NYSE","Technology","Networking",42e9,       0.082,0.012,0.000,10,0.782,182,True,False,0.3),
    "HUBS":    ("HubSpot Inc.","NYSE","Technology","Software",28e9,            0.082,0.018,0.000,10,0.832,68,True,True,0.2),
    "TEAM":    ("Atlassian Corp.","NASDAQ","Technology","Software",52e9,       0.000,0.015,0.000,0,0.812,78,True,False,0.2),
    "WDAY":    ("Workday Inc.","NASDAQ","Technology","Software",68e9,          0.098,0.022,0.000,40,0.762,42,True,True,0.2),
    "VEEV":    ("Veeva Systems","NYSE","Technology","Software",32e9,           0.178,0.028,0.000,10,0.712,38,True,True,0.3),
    "PLTR":    ("Palantir Technologies","NASDAQ","Technology","Software",270e9, 0.148,0.012,0.000,0,0.811,168,True,True,2.2),
    "MDB":     ("MongoDB Inc.","NASDAQ","Technology","Database",22e9,           0.000,0.012,0.000,10,0.712,78,True,False,0.2),
    "GTLB":    ("GitLab Inc.","NASDAQ","Technology","DevOps",8.2e9,             0.000,0.008,0.000,10,0.882,0,True,False,0.4),
    "AMD":     ("Advanced Micro Devices","NASDAQ","Technology","Semiconductors",258e9,0.048,0.012,0.000,10,0.512,32,True,True,0.1),
    "QCOM":    ("Qualcomm Inc.","NASDAQ","Technology","Semiconductors",168e9,  0.398,0.042,0.022,80,0.562,16,True,True,0.4),
    "TXN":     ("Texas Instruments","NASDAQ","Technology","Semiconductors",168e9,0.528,0.032,0.028,40,0.642,32,True,True,0.3),
    "AMAT":    ("Applied Materials","NASDAQ","Technology","Semiconductor Equipment",148e9,0.398,0.038,0.012,30,0.472,18,True,True,0.3),
    "LRCX":    ("Lam Research","NASDAQ","Technology","Semiconductor Equipment",98e9,0.448,0.042,0.012,40,0.482,18,True,True,0.3),
    "KLAC":    ("KLA Corp.","NASDAQ","Technology","Semiconductor Equipment",78e9,0.000,0.038,0.012,0,0.592,24,True,True,0.4),
    "MU":      ("Micron Technology","NASDAQ","Technology","Semiconductors",112e9,0.148,0.028,0.000,40,0.382,14,True,True,0.2),
    "MRVL":    ("Marvell Technology","NASDAQ","Technology","Semiconductors",62e9,0.012,0.012,0.002,80,0.482,48,True,False,0.2),
    "ARM":     ("Arm Holdings","NASDAQ","Technology","Semiconductors",148e9,   0.218,0.018,0.000,10,0.962,68,True,True,0.2),
    "BRK-B":   ("Berkshire Hathaway","NYSE","Financial Services","Conglomerate",950e9,0.148,0.042,0.000,0,0.000,22,True,True,0.5),
    "KO":      ("Coca-Cola Co.","NYSE","Consumer Staples","Beverages",268e9,   0.398,0.038,0.028,0,0.602,24,True,True,0.2),
    "PEP":     ("PepsiCo Inc.","NASDAQ","Consumer Staples","Beverages",198e9,  0.478,0.042,0.032,0,0.552,21,True,True,0.2),
    "PG":      ("Procter & Gamble","NYSE","Consumer Staples","Household Products",358e9,0.288,0.038,0.025,80,0.512,25,True,True,0.2),
    "IBM":     ("IBM Corp.","NYSE","Technology","IT Services",212e9,            0.128,0.048,0.032,300,0.558,22,True,True,0.3),
    "O":       ("Realty Income","NYSE","Real Estate","Net Lease REIT",48e9,     0.042,0.058,0.058,180,0.962,44,True,True,0.4),
    "SPY":     ("SPDR S&P 500 ETF","NYSE","ETF","Broad Market",548e9,          0.158,0.018,0.012,0,1.000,22,True,True,0.0),
    "QQQ":     ("Invesco QQQ ETF","NASDAQ","ETF","Nasdaq-100",248e9,            0.218,0.015,0.005,0,1.000,28,True,True,0.0),
    "IWM":     ("iShares Russell 2000","NYSE","ETF","Small Cap",68e9,           0.082,0.018,0.012,0,1.000,18,True,True,0.0),
    "GLD":     ("SPDR Gold Shares","NYSE","ETF","Gold",78e9,                    0.000,0.000,0.000,0,1.000,0,True,True,0.0),
    "TLT":     ("iShares 20+ Year Treasury","NYSE","ETF","Long-Term Bonds",48e9,0.000,0.042,0.042,0,1.000,0,True,True,0.0),
}

# ETF tickers — skip fundamental live-fetch for these (no financials available)
ETF_TICKERS = {"SPY","QQQ","IWM","GLD","TLT"}

# ---------------------------------------------------------------------------
# NULL SEED — used for tickers that exist in the cache but not in FUNDAMENTALS
# All fields are zero/False so the live yfinance fetch is the sole data source
# ---------------------------------------------------------------------------
NULL_SEED = ("Unknown","Unknown","Unknown","Unknown",0,
             0.0, 0.0, 0.0, 0.0, 0.0, 0.0, False, False, 0.0)


def load_ticker_cache(path):
    """Read a one-ticker-per-line cache file; return a deduplicated list."""
    if not os.path.exists(path):
        print(f"  WARNING: cache file not found: {path}", flush=True)
        return []
    tickers = []
    with open(path) as f:
        for line in f:
            t = line.strip()
            if t and not t.startswith("#"):
                tickers.append(t)
    # deduplicate while preserving order
    seen = set()
    result = []
    for t in tickers:
        if t not in seen:
            seen.add(t)
            result.append(t)
    return result


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


def get_price_data(sym):
    """Download OHLCV via yf.download — reliable even from CI."""
    for period in ("1y", "6mo", "3mo"):
        try:
            h = yf.download(sym, period=period, auto_adjust=True,
                            progress=False, show_errors=False)
            if h is None or h.empty:
                continue
            if isinstance(h.columns, pd.MultiIndex):
                h.columns = [c[0] if isinstance(c, tuple) else c for c in h.columns]
            h.columns = [str(c).strip().title() for c in h.columns]
            if "Close" in h.columns and len(h) > 5:
                return h
        except Exception as e:
            print(f"    hist {period}: {e}")
    return None


def _series_latest(df, *row_keys):
    """Pull the most-recent non-null value from a financials DataFrame row."""
    if df is None or df.empty:
        return None
    for key in row_keys:
        for idx in df.index:
            if str(idx).lower().replace(" ", "").replace("_", "") == key.lower().replace(" ", "").replace("_", ""):
                row = df.loc[idx].dropna()
                if not row.empty:
                    return safe(row.iloc[0])
    return None


def fetch_live_fundamentals(sym, seed):
    """
    Attempt to fetch live fundamentals from Yahoo Finance.
    seed may be None (for tickers not in the static FUNDAMENTALS dict),
    in which case NULL_SEED is used so the live fetch is the only data source.
    Returns a dict of live values + 'data_source' indicator.
    """
    if seed is None:
        seed = NULL_SEED

    (name, exchange, sector, industry, seed_mcap,
     seed_roe, seed_fcf, seed_div, seed_debt,
     seed_gm, seed_pe, seed_ni_pos, seed_ocf_pos, seed_ins) = seed

    # ETFs: skip live fundamental fetch entirely
    if sym in ETF_TICKERS:
        return dict(
            market_cap_usd = seed_mcap,
            roe            = seed_roe,
            fcf_yield      = seed_fcf,
            div_yield      = seed_div,
            debt_eq        = seed_debt,
            gross_margin   = seed_gm,
            pe_fwd         = seed_pe,
            net_inc_pos    = seed_ni_pos,
            op_cf_pos      = seed_ocf_pos,
            insider_pct    = seed_ins,
            data_source    = "static_seed",
        )

    live = {}
    live_fields = 0
    total_fields = 6  # mcap, roe, fcf, div, gm, pe

    try:
        ticker = yf.Ticker(sym)

        # ── 1. Market Cap via fast_info (very reliable) ──────────────────────
        try:
            fi = ticker.fast_info
            mcap = safe(getattr(fi, "market_cap", None))
            if mcap and mcap > 1e6:
                live["market_cap_usd"] = mcap
                live_fields += 1
                print(f"    mcap live: ${mcap/1e9:.1f}B")
        except Exception as e:
            print(f"    fast_info error: {e}")

        # ── 2. Dividend yield + PE via info dict ──────────────────────────────
        try:
            info = {}
            try:
                info = ticker.info or {}
            except Exception:
                pass
            raw_div = safe(info.get("dividendYield") or info.get("trailingAnnualDividendYield"))
            if raw_div is not None and raw_div >= 0:
                live["div_yield"] = raw_div
                live_fields += 1
                print(f"    div_yield live: {raw_div*100:.2f}%")
            raw_pe = safe(info.get("forwardPE") or info.get("trailingPE"))
            if raw_pe is not None and 0 < raw_pe < 1000:
                live["pe_fwd"] = raw_pe
                live_fields += 1
                print(f"    pe_fwd live: {raw_pe:.1f}x")
            # Also pick up sector/industry/name for non-seed tickers
            if not info.get("shortName") and info.get("longName"):
                live["_name"]     = info.get("longName", sym)
            elif info.get("shortName"):
                live["_name"]     = info["shortName"]
            if info.get("sector"):
                live["_sector"]   = info["sector"]
            if info.get("industry"):
                live["_industry"] = info["industry"]
            if info.get("exchange"):
                live["_exchange"] = info["exchange"]
        except Exception as e:
            print(f"    info fetch note: {e}")

        # ── 3. Income statement → ROE & Gross Margin ─────────────────────────
        try:
            fin   = ticker.financials
            bs    = ticker.balance_sheet
            cf    = ticker.cashflow

            gp  = _series_latest(fin, "GrossProfit", "Gross Profit")
            rev = _series_latest(fin, "TotalRevenue", "Total Revenue")
            if gp is not None and rev and rev != 0:
                gm = gp / rev
                if 0 < gm < 1:
                    live["gross_margin"] = gm
                    live_fields += 1
                    print(f"    gross_margin live: {gm*100:.1f}%")

            ni  = _series_latest(fin, "NetIncome", "Net Income")
            eq  = _series_latest(bs,  "StockholdersEquity", "Stockholders Equity",
                                       "CommonStockEquity", "Total Stockholders Equity")
            if ni is not None and eq and eq != 0:
                roe = ni / eq
                if -2 < roe < 10:
                    live["roe"] = roe
                    live_fields += 1
                    print(f"    roe live: {roe*100:.1f}%")

            ocf = _series_latest(cf, "OperatingCashFlow", "Operating Cash Flow",
                                       "CashFlowFromContinuingOperatingActivities")
            if ni is not None:
                live["net_inc_pos"] = ni > 0
            if ocf is not None:
                live["op_cf_pos"] = ocf > 0

            capex = _series_latest(cf, "CapitalExpenditures", "Capital Expenditures",
                                        "CapitalExpenditure")
            mcap_for_fcf = live.get("market_cap_usd") or seed_mcap
            if ocf is not None and capex is not None and mcap_for_fcf:
                fcf = ocf - abs(capex)
                fcf_yield = fcf / mcap_for_fcf
                if -0.5 < fcf_yield < 0.5:
                    live["fcf_yield"] = fcf_yield
                    live_fields += 1
                    print(f"    fcf_yield live: {fcf_yield*100:.2f}%")

        except Exception as e:
            print(f"    financials fetch note: {e}")

        # ── 4. Debt/Equity via balance sheet ─────────────────────────────────
        try:
            bs  = ticker.balance_sheet
            tde = _series_latest(bs, "TotalDebt", "Total Debt", "LongTermDebt")
            eq2 = _series_latest(bs, "StockholdersEquity", "Stockholders Equity",
                                       "CommonStockEquity", "Total Stockholders Equity")
            if tde is not None and eq2 and eq2 != 0:
                de = (tde / eq2) * 100
                if 0 <= de < 2000:
                    live["debt_eq"] = de
                    print(f"    debt/equity live: {de:.0f}%")
        except Exception as e:
            print(f"    debt fetch note: {e}")

    except Exception as e:
        print(f"    yf.Ticker init error for {sym}: {e}")

    # ── Merge live values over seed, determine data_source ───────────────────
    result = dict(
        market_cap_usd = live.get("market_cap_usd", seed_mcap),
        roe            = live.get("roe",             seed_roe),
        fcf_yield      = live.get("fcf_yield",       seed_fcf),
        div_yield      = live.get("div_yield",        seed_div),
        debt_eq        = live.get("debt_eq",          seed_debt),
        gross_margin   = live.get("gross_margin",     seed_gm),
        pe_fwd         = live.get("pe_fwd",           seed_pe),
        net_inc_pos    = live.get("net_inc_pos",      seed_ni_pos),
        op_cf_pos      = live.get("op_cf_pos",        seed_ocf_pos),
        insider_pct    = seed_ins,   # SEDI/Form4 not available via yfinance
        # carry enriched name/sector/industry from live info if seed was null
        _name          = live.get("_name",     name),
        _exchange      = live.get("_exchange", exchange),
        _sector        = live.get("_sector",   sector),
        _industry      = live.get("_industry", industry),
    )

    if live_fields >= total_fields - 1:
        result["data_source"] = "live_yahoo"
    elif live_fields >= 2:
        result["data_source"] = "partial_yahoo"
    else:
        result["data_source"] = "static_seed"

    result["last_updated_utc"] = datetime.now(timezone.utc).isoformat()
    return result


def score_ticker(sym, seed, hist, live_fund):
    """
    seed may be None for tickers not in the static FUNDAMENTALS dict.
    All metadata (name, exchange, sector, industry) is resolved via live_fund
    in that case.
    """
    if seed is not None:
        name, exchange, sector, industry = seed[0], seed[1], seed[2], seed[3]
    else:
        name     = live_fund.get("_name",     sym)
        exchange = live_fund.get("_exchange", "Unknown")
        sector   = live_fund.get("_sector",   "Unknown")
        industry = live_fund.get("_industry", "Unknown")

    roe_raw    = live_fund["roe"]
    fcf_yield  = live_fund["fcf_yield"]
    div_yield  = live_fund["div_yield"]
    debt_eq    = live_fund["debt_eq"]
    gross_mg   = live_fund["gross_margin"]
    pe_fwd     = live_fund["pe_fwd"]
    net_inc_pos= live_fund["net_inc_pos"]
    op_cf_pos  = live_fund["op_cf_pos"]
    insider_pct= live_fund["insider_pct"]

    closes     = hist["Close"].dropna() if hist is not None else None
    rsi_val    = calc_rsi(closes)
    above_50 = above_200 = None
    if closes is not None and len(closes) > 0:
        lp = float(closes.iloc[-1])
        if len(closes) >= 50:
            above_50  = lp > float(closes.rolling(50).mean().dropna().iloc[-1])
        if len(closes) >= 200:
            above_200 = lp > float(closes.rolling(200).mean().dropna().iloc[-1])

    ins_buy = insider_pct > 1.0
    shenan  = net_inc_pos and not op_cf_pos

    rsi_score = 0.5
    if rsi_val is not None:
        rsi_score = 0.3 if rsi_val < 30 else (0.4 if rsi_val > 70 else min(1.0, (rsi_val - 30) / 40))

    n = dict(
        roe        = min(1.0, max(0.0, (roe_raw    or 0) / 0.20)),
        fcf        = min(1.0, max(0.0, (fcf_yield  or 0) / 0.08)),
        debt       = min(1.0, max(0.0, 1 - ((debt_eq or 100) / 200))),
        rsi        = rsi_score,
        ma50       = (1.0 if above_50  else 0.0) if above_50  is not None else 0.5,
        ma200      = (1.0 if above_200 else 0.0) if above_200 is not None else 0.5,
        insider    = 1.0 if ins_buy else 0.0,
        shenanigan = 1.0 if shenan  else 0.0,
        moat       = min(1.0, max(0.0, gross_mg or 0)),
    )

    horizons = {}
    for hz in HORIZONS:
        wt     = HORIZON_WEIGHTS[hz]
        raw    = sum(wt[k] * n[k] for k in wt)
        score  = round(max(0.0, min(100.0, raw * 100)), 1)
        rating = "BUY" if score >= 58 else ("HOLD" if score >= 40 else "SELL")

        tp, rp = [], []
        if roe_raw   and roe_raw   > 0.12: tp.append(f"ROE {roe_raw*100:.0f}%")
        if fcf_yield and fcf_yield > 0.03: tp.append(f"FCF yield {fcf_yield*100:.1f}%")
        if above_50:                       tp.append("above 50-DMA")
        if above_200:                      tp.append("above 200-DMA")
        if ins_buy:                        tp.append("insider buying")
        if gross_mg  and gross_mg  > 0.50: tp.append(f"wide margins ({gross_mg*100:.0f}%)")
        if rsi_val   and rsi_val   < 35:   tp.append(f"oversold RSI {rsi_val:.0f}")

        if shenan:                         rp.append("earnings-OCF divergence")
        if debt_eq   and debt_eq   > 150:  rp.append("high leverage")
        if rsi_val   and rsi_val   > 70:   rp.append("overbought RSI")
        if above_200 is False:             rp.append("below 200-DMA")
        if pe_fwd    and pe_fwd    > 50:   rp.append(f"stretched P/E {pe_fwd:.0f}x")

        horizons[hz] = dict(
            rating=rating, score=score, label=HORIZON_LABELS[hz],
            thesis=";\u00a0".join(tp) or "No strong signals",
            risk  =";\u00a0".join(rp) or "Monitor macro conditions",
        )

    return horizons, dict(
        name               = name,
        exchange           = exchange,
        sector             = sector,
        industry           = industry,
        market_cap_usd     = live_fund["market_cap_usd"],
        cap_tier           = cap_tier(live_fund["market_cap_usd"]),
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
        data_source        = live_fund["data_source"],
        last_updated_utc   = live_fund["last_updated_utc"],
    )


def process_universe(tickers, label):
    """
    Process a list of tickers.  Any ticker is accepted — seed from FUNDAMENTALS
    if available, otherwise use NULL_SEED so live yfinance is the sole source.
    No ticker is silently skipped just because it lacks a seed entry.
    """
    results = []
    for i, sym in enumerate(tickers):
        seed = FUNDAMENTALS.get(sym)   # None if not in static dict — that's OK
        print(f"  [{label}] {i+1}/{len(tickers)} {sym}"
              f"{'  (seed)' if seed else '  (live-only)'}", flush=True)
        try:
            hist      = get_price_data(sym)
            live_fund = fetch_live_fundamentals(sym, seed)

            if hist is not None:
                print(f"    price rows: {len(hist)}", flush=True)
            else:
                print(f"    no price data — using static signals", flush=True)

            horizons, metrics = score_ticker(sym, seed, hist, live_fund)

            results.append(dict(
                ticker   = sym,
                name     = metrics.pop("name"),
                exchange = metrics.pop("exchange"),
                sector   = metrics.pop("sector"),
                industry = metrics.pop("industry"),
                **metrics,
                horizons = horizons,
            ))
            print(f"    -> OK  score={horizons['short']['score']}  "
                  f"source={metrics['data_source']}  cap={metrics['cap_tier']}", flush=True)
        except Exception:
            print(f"    -> ERROR:\n{traceback.format_exc()}", flush=True)

        if (i + 1) % BATCH_SIZE == 0:
            time.sleep(SLEEP_S)

    return results


def sort_key(s):
    order = {"BUY": 0, "HOLD": 1, "SELL": 2}
    r     = order.get(s.get("horizons", {}).get("short", {}).get("rating", "HOLD"), 1)
    score = s.get("horizons", {}).get("short", {}).get("score", 50)
    return (r, -score)


def main():
    print("=" * 60, flush=True)
    print("Equity Strategist Dashboard - Analysis Engine v8", flush=True)
    print(f"Python  {sys.version}", flush=True)
    print(f"yfinance {yf.__version__}", flush=True)
    print(f"pandas   {pd.__version__}", flush=True)
    print("=" * 60, flush=True)

    # ── Build dynamic universe from refreshed cache files ────────────────────
    # The cache files are updated by fetch_tsx_tickers.py / fetch_nyse_tickers.py
    # before analyze_stocks.py runs, so the count changes day-to-day.
    cad_from_cache = load_ticker_cache(TSX_CACHE_TXT)
    usd_from_cache = load_ticker_cache(NYSE_CACHE_TXT)

    # Fall back to FUNDAMENTALS keys if cache files are missing/empty
    if not cad_from_cache:
        print("  WARNING: tsx cache empty — falling back to FUNDAMENTALS CAD keys", flush=True)
        cad_from_cache = [s for s in FUNDAMENTALS if s.endswith(".TO") or s.endswith(".V")]
    if not usd_from_cache:
        print("  WARNING: nyse cache empty — falling back to FUNDAMENTALS USD keys", flush=True)
        usd_from_cache = [s for s in FUNDAMENTALS
                          if not s.endswith(".TO") and not s.endswith(".V")]

    print(f"Universe: {len(cad_from_cache)} CAD + {len(usd_from_cache)} USD "
          f"= {len(cad_from_cache)+len(usd_from_cache)} total", flush=True)

    cad = process_universe(cad_from_cache, "CAD")
    usd = process_universe(usd_from_cache, "USD")

    cad.sort(key=sort_key)
    usd.sort(key=sort_key)

    print(f"\nResults: {len(cad)} CAD, {len(usd)} USD", flush=True)

    if len(cad) == 0 and len(usd) == 0:
        print("ERROR: Zero results produced.", file=sys.stderr)
        sys.exit(1)

    live_count    = sum(1 for s in cad+usd if s.get("data_source") == "live_yahoo")
    partial_count = sum(1 for s in cad+usd if s.get("data_source") == "partial_yahoo")
    print(f"  live_yahoo: {live_count}  partial: {partial_count}", flush=True)

    payload = dict(
        generated_at = datetime.now(timezone.utc).isoformat(),
        cad  = cad,
        usd  = usd,
        meta = dict(
            horizons  = HORIZON_LABELS,
            cap_tiers = {"mega": ">= $200B", "large": "$10B-$200B",
                         "mid": "$2B-$10B", "small": "< $2B"},
            note = "For informational purposes only. Not financial advice.",
        )
    )

    out = os.path.abspath(OUT_PATH)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump(payload, f, indent=2, default=str)

    print(f"\nWrote {out}", flush=True)
    print(f"  CAD BUYs: {sum(1 for s in cad if s['horizons']['short']['rating']=='BUY')}", flush=True)
    print(f"  USD BUYs: {sum(1 for s in usd if s['horizons']['short']['rating']=='BUY')}", flush=True)


if __name__ == "__main__":
    main()
