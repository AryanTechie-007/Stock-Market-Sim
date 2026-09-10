# MarketArena - Financial Market Simulator

## Repository Metadata

- **Current Push Version:** v0.1
- **Username:** AryanTechie-007
- **Push Timestamp:** 2026-09-10 20:13:17 IST (UTC+05:30)
- **Repository:** https://github.com/AryanTechie-007/Stock-Market-Sim

---

## Overview

MarketArena is a high-performance, gamified financial market simulator and trading laboratory built with Node.js, Express, Socket.IO, and a vanilla JavaScript frontend terminal. The platform simulates a live stock exchange featuring continuous double-auction limit order books, FIFO price-time matching, multi-asset portfolio accounting, simulated market clock cycles, and eight autonomous algorithmic NPC traders.

---

## Architecture and Core Modules

The system is partitioned into modular subsystems within the `engine/` and `traders/` directories:

### 1. Order Matching Engine (`engine/matching.js`, `engine/orderbook.js`)
- **Execution Mechanism:** Strict Price-Time Priority (FIFO) matching algorithm.
- **Supported Order Types:**
  - **LIMIT Orders:** Placed into the order book at specified prices. Bids are sorted descending by price, then ascending by timestamp; asks are sorted ascending by price, then ascending by timestamp. Unmatched shares remain resting in the order book.
  - **MARKET Orders:** Matched immediately against resting liquidity with slippage protection buffers.
- **Capital and Holding Validation:** Validates funds and share inventory before routing to book. Buyers have credits locked upon placing limit orders; sellers have share quantities locked to prevent over-allocation.
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
- **Leaderboard Calculation:** Ranks all human and NPC participants by total net worth and total return.

### 3. Market Clock and Phased Trading (`engine/clock.js`)
- **Day and Session State Machine:**
  - **PRE_MARKET (30s):** Orders can be queued; matching is halted.
  - **REGULAR_HOURS (180s / 3 min):** Active trading session with live continuous order execution. Simulated clock runs from 09:30 AM to 04:00 PM.
  - **POST_MARKET (30s):** Market close and settlement recap before day rollover.
- **Session Transitions:** Emits opening bell and closing bell events across the WebSocket network.

### 4. Market and Stock Universe (`engine/market.js`)
- Five distinct corporate entities across varying market sectors:
  - **AUTO (AutoCorp):** Automotive and Electric Vehicles.
  - **SOLR (SolarGen):** Clean energy and solar utility infrastructure.
  - **BYTE (ByteWorks):** Cloud computing, hardware, and AI systems.
  - **NBNK (National Bank):** Financial institution and treasury banking.
  - **MEDL (MedLife):** Pharmaceuticals and clinical biotechnology.
- **Candlestick Aggregator:** Rolls OHLC (Open, High, Low, Close) candles at 5-second intervals with persistent rolling history for charting.
- **News and Sentiment Generator:** Periodic breaking news engine with fundamental valuation and market sentiment adjustments.

### 5. Algorithmic NPC Traders (`traders/`)
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
- **Interactive Chart:** HTML5 Canvas chart displaying real-time price trends and historical candles.
- **Live Execution Tape:** Real-time stream of matched trades showing price, quantity, taker side, and execution timestamps.
- **Order Entry Pad:** Interactive controls for Buy/Sell selection, Limit/Market order selection, quick percentage sizing (25%, 50%, 75%, Max), estimated trade value calculation, and best-price autofill.
- **Order Book Ladder:** Depth visualization displaying aggregate bid and ask volumes, cumulative depth bars, and bid-ask spread indicators.
- **Bottom Drawer Tabbed Views:**
  - **Portfolio:** Net worth, cash, locked funds, realized and unrealized P&L, holdings table with average cost and position values.
  - **Open Orders:** Active resting orders with immediate cancellation triggers.
  - **Leaderboard:** Live rankings of all active human and bot participants.
  - **News Log:** Historical archive of economic news and market catalysts.
- **Audio Feedback:** Web Audio API sound synthesis for trade executions.

---

## Technology Stack

- **Backend:** Node.js (ES Modules), Express
- **Real-Time Communication:** Socket.IO
- **Frontend:** Vanilla HTML5, CSS3, JavaScript (no framework dependencies)
- **Testing:** Node.js built-in assertion module (`assert`)

---

## Installation and Setup

### Prerequisites
- Node.js (v18.0.0 or higher recommended)
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

To run the engine test suite:
```bash
node tests/engine.test.js
```

### Verified Test Cases:
1. Limit order book sorting and FIFO price-time priority.
2. Incoming order execution and trade generation.
3. Account management, margin locks, and post-trade settlement.
4. Full end-to-end matching coordinator and clock integration.

---

## Version History

- **v0.1:** Initial release featuring FIFO matching engine, account management, multi-archetype NPC bots, market clock cycle, and full-featured web trading terminal.
