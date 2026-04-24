# 📊 Equity Strategist Dashboard

A full-stack, dark-mode financial dashboard delivering **BUY / HOLD / SELL** recommendations for **CAD (TSX/TSXV)** and **USD (NYSE/NASDAQ)** equities across 5 time horizons.

## 🏗 Architecture

## ⚡ Time Horizons
| Label | Range | Priority |
|---|---|---|
| Ultra Short | 0–3 months | RSI + MOC + PDUFA catalysts |
| Short | 0–12 months | Sector rotation + CAGR + RPOs |
| Medium | 0–36 months | ROE > 12%, ND/EBITDA < 4x |
| Long | 0–60 months | Moats, AISC, AI data center demand |
| Ultra Long | 0–360 months | TAM, energy transition, demographics |

## 🔐 Required GitHub Secrets
- `POLYGON_API_KEY`
- `ALPHA_VANTAGE_KEY`
- `DISPATCH_TOKEN`

## 🚀 Setup
```bash
npm install && npm run dev
pip install -r requirements.txt
python backend/analyze_stocks.py
```

## 🌐 Live Dashboard
`https://sujaysoni.github.io/equity-strategist-dashboard`
