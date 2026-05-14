# MUGGER v0.001

**Anomaly-oriented crypto market observation terminal**

> *Stillness. Focus. Signal.*

---

## What is Mugger

Mugger is a browser-based trading software prototype designed for serious crypto market operators. It is not a generic dashboard, not a retail trading app, and not a school project. Mugger is the first stage of a purpose-built anomaly-detection terminal for crypto derivatives trading.

The philosophy behind Mugger: **do not trade everything. Hunt only asymmetric setups where structure, liquidity, derivatives, and participation align.**

---

## v0.001 — Scope

This version establishes the foundational architecture:

- **Real-time BTC/USDT candlestick chart** powered by Binance WebSocket
- **7 timeframes**: 1M, 5M, 15M, 30M, 1H, 4H, 1D
- **Live market data**: price, 24H stats, funding rate, open interest, long/short ratio
- **Fear & Greed Index** from alternative.me
- **Conditions framework**: lightweight anomaly signal detection (Price Expansion, Volume Spike, Momentum Shift, Volatility Compression, Structure Break)
- **Monochrome terminal aesthetic**: black, charcoal, and grayscale only
- **Production-grade architecture** ready for future expansion

---

## Data Sources (Free Public APIs)

| Source | Data | Endpoint |
|--------|------|----------|
| Binance REST | Candles, 24H ticker | `api.binance.com/api/v3` |
| Binance Futures | Funding rate, Open Interest | `fapi.binance.com/fapi/v1` |
| Binance Futures | Long/Short ratio | `fapi.binance.com/futures/data` |
| Binance WebSocket | Real-time price stream | `stream.binance.com:9443` |
| Alternative.me | Fear & Greed Index | `api.alternative.me/fng` |

All endpoints are free, public, and require no API keys.

---

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** — build tooling
- **lightweight-charts** — professional candlestick charting
- **CSS Modules** — component-scoped styles
- No UI kit dependencies. Custom grayscale design system.

---

## Project Structure

```
mugger-v001/
├── src/
│   ├── components/
│   │   ├── chart/          # CandleChart, TimeframeSelector, ChartWorkspace
│   │   ├── layout/         # Header, Sidebar, Footer
│   │   └── signals/        # SignalsPanel (conditions framework)
│   ├── data/
│   │   ├── api.ts          # All API calls — Binance + Fear/Greed
│   │   └── conditions.ts   # Anomaly condition detection engine
│   ├── hooks/              # Custom hooks (future)
│   ├── styles/
│   │   └── global.css      # Design system — grayscale palette
│   ├── types/
│   │   └── index.ts        # TypeScript interfaces
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Setup

```bash
# Clone
git clone https://github.com/your-username/mugger.git
cd mugger

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Build

```bash
npm run build
npm run preview
```

---

## Roadmap

| Version | Scope |
|---------|-------|
| **v0.001** | ✅ BTC chart, timeframes, live data, conditions framework |
| v0.002 | Anomaly scoring engine, signal ranking, Mugger Score |
| v0.003 | Alert system, threshold configuration |
| v0.004 | Multi-asset watchlist (ETH + alts) |
| v0.005 | Liquidation heatmap integration |
| v0.006 | Open interest divergence detection |
| v0.007 | Funding rate anomaly engine |
| v0.008 | Scenario generator (Long / Short / No-trade) |
| v1.0   | Full anomaly-hunting terminal |

---

## Philosophy

Mugger is built around one principle: **only strike when the edge is real.**

The crocodile waits in still water. It does not react to noise. It does not chase movement. It identifies asymmetry — and then it acts with precision.

The no-trade state is a feature, not a bug.

---

## Disclaimer

This software is for market observation purposes only. Not financial advice. All trading decisions are made independently by the user.

---

*MUGGER v0.001 — Hunt asymmetry*
