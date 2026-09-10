# MarketArena - Financial Market Simulator

## Repository Metadata

- **Current Pushed Version:** v0.2
- **Local Build Version:** v0.3-dev (Testing Phase)
- **Username:** AryanTechie-007
- **Push Timestamp:** 2026-09-10 20:38:00 IST (UTC+05:30)
- **Current Status:** Active Testing Phase (Prepared for Public Deployment)
- **Repository:** https://github.com/AryanTechie-007/Stock-Market-Sim

---

## Overview

MarketArena is a high-performance, gamified financial market simulator and quantitative trading terminal built with Node.js, Express, Socket.IO, and a vanilla JavaScript frontend terminal. The platform provides a realistic, continuous double-auction equity exchange featuring FIFO price-time order matching, multi-asset portfolio accounting, simulated market clock cycles, eight autonomous algorithmic NPC traders, and relational state persistence.

---

## Current Status and Roadmap Note

### Testing Phase & Public Deployment
MarketArena is currently operating in an active local testing phase. While configured for rapid experimentation and local simulation, the system is architected for eventual public deployment where multi-user trading competitions and external programmatic bot participation will be supported.

### Persistence Architecture: SQLite to PostgreSQL
- **Current Implementation (SQLite):** The local testing build implements a native relational SQLite database (`engine/sqlite-storage.js`) leveraging Node.js native `DatabaseSync` (`node:sqlite`). This provides structured table schemas for accounts, stock holdings, and chronological trade histories with zero external database dependencies.
- **Future Migration (PostgreSQL):** For public deployment, MarketArena is designed to migrate from SQLite to PostgreSQL. The current SQLite schema (data types, table relations, foreign keys, and indexes) directly mirrors standard PostgreSQL relational schemas, ensuring a seamless migration path to high-concurrency production hosting.

For a detailed roadmap of queued deep features, see [Future_Scope.md](Future_Scope.md).

---

## Architecture and Core Modules

The system is partitioned into modular subsystems within the `engine/` and `traders/` directories:

### 1. Order Matching Engine (`engine/matching.js`, `engine/orderbook.js`)
- **Execution Mechanism:** Strict Price-Time Priority (FIFO) matching algorithm.
- **Supported Order Types:**
  - **LIMIT Orders:** Placed into the order book at specified prices. Bids are sorted descending by price, then ascending by timestamp; asks are sorted ascending by price, then ascending by timestamp. Unmatched shares remain resting in the order book.
  - **MARKET Orders:** Matched immediately against resting liquidity with slippage protection buffers.
- **Capital and Holding Validation:** Validates funds and share inventory before routing to the book. Buyers have credits locked upon placing limit orders; sellers have share quantities locked to prevent over-allocation.
- **Self-Trade Prevention:** Prevents matching of orders submitted by the same participant ID.
- **Order Cancellation:** Allows cancellation of resting limit orders, immediately unlocking reserved capital or shares.

### 2. Account and Portfolio Management (`engine/accounts.js`)
- **Initial Capital:** Default allocation of 100,000.00 Credits (CR) per human user.
- **Double-Entry Settlement:**
  - Executes instant cash and equity settlement upon trade matching.
  - Tracks available cash versus locked cash (reserved for resting buy orders).
  - Tracks available shares versus locked shares (reserved for resting sell orders).
- **Position Accounting:**
  - Dynamic average cost basis calculation on buy executions.
  - Realized Profit and Loss (P&L) calculation upon share liquidations.
  - Unrealized P&L calculation against live market mark-to-market prices.
  - Real-time net worth and percentage return metrics.
- **Trade History Ledger:** Logs all executions with price, quantity, gross trade value, Maker vs. Taker role, counterparty, and realized P&L.
- **Leaderboard Calculation:** Ranks all human and NPC participants by total net worth and total return.

### 3. Relational Persistence (`engine/sqlite-storage.js`)
- **Database Engine:** Node.js native `node:sqlite` (`DatabaseSync`).
- **Relational Tables:**
  - `accounts`: User identification, starting capital, current credits, locked credits, realized P&L, trades count, volume.
  - `holdings`: Foreign-key bound user positions per symbol, share quantity, average cost price, and locked quantity.
  - `trade_history`: Foreign-key bound chronological transaction log with execution timestamps and counterparty metadata.
- **Bootstrap Restoration:** Automatically reconstructs all active human trader portfolios, holdings, and transaction histories upon server start.

### 4. Market Clock and Phased Trading (`engine/clock.js`)
- **Day and Session State Machine:**
  - **PRE_MARKET (30s):** Orders can be queued; matching is halted.
  - **REGULAR_HOURS (180s / 3 min):** Active trading session with live continuous order execution. Simulated clock runs from 09:30 AM to 04:00 PM.
  - **POST_MARKET (30s):** Market close and settlement recap before day rollover.
- **Session Transitions:** Emits opening bell and closing bell events across the WebSocket network.

### 5. Market and Stock Universe (`engine/market.js`)
- Five corporate entities across diverse market sectors:
  - **AUTO (AutoCorp):** Automotive and Electric Vehicles.
  - **SOLR (SolarGen):** Clean energy and solar utility infrastructure.
  - **BYTE (ByteWorks):** Cloud computing, hardware, and AI systems.
  - **NBNK (National Bank):** Financial institution and treasury banking.
  - **MEDL (MedLife):** Pharmaceuticals and clinical biotechnology.
- **Candlestick Aggregator:** Rolls OHLC (Open, High, Low, Close) candles at 5-second intervals with persistent rolling history for charting.
- **News and Sentiment Generator:** Periodic breaking news engine with fundamental valuation and market sentiment adjustments.

### 6. Algorithmic NPC Traders (`traders/`)
Eight autonomous trading bots interact with the matching engine to provide realistic market depth and price discovery:
- **Market Makers (MM Alpha Securities, Apex Liquidity LP):** Provide continuous two-sided limit orders across bids and asks around the mid-price.
- **Momentum Traders (Velocity Quant Bot, TrendRider Algorithmic):** Detect short-term price momentum and submit directional orders.
- **Value Investors (DeepValue Asset Mgmt, Horizon Fundamental Fund):** Evaluate current prices against company intrinsic value with safety margins.
- **Noise / Retail Traders (Retail Swarm Alpha, Retail Swarm Beta):** Simulate stochastic retail order flow.

---

## User Interface and Trading Terminal (`public/`)

The web client provides a desktop terminal layout:
- **Top Bar:** Market clock phase display, simulated time, session countdown timer, global ticker tape, audio mute toggle, callsign manager.
- **Watchlist and Fundamentals:** Multi-asset ticker list with real-time percentage changes, company descriptions, P/E ratios, market caps, and sentiment indicators.
- **Interactive Candlestick & Volume Chart:**
  - HTML5 Canvas chart displaying real-time OHLC candlestick bodies and wicks.
  - Integrated Volume Histogram sub-panel aligned to the bottom.
  - Interactive crosshair tracking with floating OHLCV inspection HUD.
  - Current market price dashed reference line and active price tag.
- **Live Execution Tape:** Real-time stream of matched trades showing price, quantity, taker side, and execution timestamps.
- **Order Entry Pad:** Interactive controls for Buy/Sell selection, Limit/Market order selection, quick percentage sizing (25%, 50%, 75%, Max), estimated trade value calculation, and best-price autofill.
- **Order Book Ladder:** Depth visualization displaying aggregate bid and ask volumes, cumulative depth bars, and bid-ask spread indicators.
- **Bottom Drawer Tabbed Views:**
  - **Portfolio:** Net worth, cash, locked funds, realized and unrealized P&L, holdings table with average cost and position values.
  - **Open Orders:** Active resting orders with immediate cancellation triggers.
  - **My Trades:** Personal transaction ledger with execution timestamps, symbols, Buy/Sell indicators, Maker/Taker badges, and realized P&L.
  - **Leaderboard:** Live rankings of all active human and bot participants.
  - **News Log:** Historical archive of economic news and market catalysts.
- **Audio Feedback:** Synthesized Web Audio tones for order fills, session opening and closing bells, and breaking economic news alerts.

---

## Technology Stack

- **Backend:** Node.js (ES Modules, v22+ / v24+), Express
- **Database:** SQLite via native `node:sqlite` (`DatabaseSync`), planned migration to PostgreSQL
- **Real-Time Communication:** Socket.IO
- **Frontend:** Vanilla HTML5, CSS3, JavaScript (no framework dependencies)
- **Testing:** Node.js built-in assertion module (`assert`)

---

## Installation and Setup

### Prerequisites
- Node.js (v22.0.0 or higher recommended for native SQLite support)
- npm (v9.0.0 or higher)

### Steps

1. Clone the repository:
```bash
git clone https://github.com/AryanTechie-007/Stock-Market-Sim.git
cd Stock-Market-Sim
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```
Or run the production start script:
```bash
npm start
```

4. Access the application:
Open your browser and navigate to:
```
http://localhost:3000
```

---

## Automated Verification and Tests

To execute the test suite:
```bash
node tests/engine.test.js
```

### Verified Test Cases:
1. Limit order book sorting and FIFO price-time priority.
2. Incoming order execution and trade generation.
3. Account management, margin locks, and post-trade settlement.
4. Full end-to-end matching coordinator and clock integration.
5. Personal trade history logging with Maker vs. Taker role assignment.
6. Memory state serialization and restoration.
7. Native SQLite relational persistence (accounts, holdings, and trade history).

---

## Version History

- **v0.1 (Pushed to GitHub):** Initial release featuring FIFO matching engine, account management, multi-archetype NPC bots, market clock cycle, and full-featured web trading terminal.
- **v0.2 (In Local Testing):** Native SQLite relational persistence, personal trade history ledger and terminal tab, advanced candlestick and volume charting with crosshair inspection, and harmonic audio feedback.
