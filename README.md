# MarketArena - Financial Market Simulator

## Repository Metadata

- **Current Pushed Version:** v0.3
- **Username:** AryanTechie-007
- **Push Timestamp:** 2026-09-10 21:18:00 IST (UTC+05:30)
- **Current Status:** Deployed Build (Tier 2 - Advanced Trading & Gamification Release)
- **Repository:** https://github.com/AryanTechie-007/Stock-Market-Sim

---

## Overview

MarketArena is a high-performance, gamified financial market simulator and quantitative trading terminal built with Node.js, Express, Socket.IO, and a vanilla JavaScript frontend terminal. The platform provides a realistic, continuous double-auction equity exchange featuring FIFO price-time order matching, conditional stop orders, multi-asset portfolio accounting, simulated market clock cycles, eight autonomous algorithmic NPC traders, an achievements milestone engine, end-of-day settlement summaries, and native relational state persistence.

---

## Current Status and Roadmap Note

### Testing Phase & Public Deployment
MarketArena is currently operating in an active local testing phase. While configured for rapid experimentation and local simulation, the system is architected for eventual public deployment where multi-user trading competitions and external programmatic bot participation will be supported.

### Persistence Architecture: SQLite to PostgreSQL
- **Current Implementation (SQLite):** The local build implements a native relational SQLite database (`engine/sqlite-storage.js`) leveraging Node.js native `DatabaseSync` (`node:sqlite`). This provides structured table schemas for accounts, stock holdings, chronological trade histories, and unlocked achievements with zero external database dependencies.
- **Future Migration (PostgreSQL):** For public deployment, MarketArena is designed to migrate from SQLite to PostgreSQL. The current SQLite schema (data types, table relations, foreign keys, and indexes) directly mirrors standard PostgreSQL relational schemas, ensuring a seamless migration path to high-concurrency production hosting.

For a detailed roadmap of queued deep features, see [Future_Scope.md](Future_Scope.md).

---

## Architecture and Core Modules

The system is partitioned into modular subsystems within the `engine/` and `traders/` directories:

### 1. Order Matching Engine (`engine/matching.js`, `engine/orderbook.js`)
- **Execution Mechanism:** Strict Price-Time Priority (FIFO) matching algorithm.
- **Supported Order Types:**
  - **LIMIT Orders:** Placed into the active order book at specified prices. Bids are sorted descending by price, then ascending by timestamp; asks are sorted ascending by price, then ascending by timestamp. Unmatched shares remain resting in the order book.
  - **MARKET Orders:** Matched immediately against resting liquidity with slippage protection buffers.
  - **STOP LOSS Orders:** Conditional risk-management orders held outside the active order book. When market price drops to or below the trigger threshold (for sells) or rises to or above the threshold (for breakout buys), the order automatically converts to a Market order and executes against the book.
  - **STOP LIMIT Orders:** Conditional orders that convert to resting or matching Limit orders at the specified limit price once the stop trigger price is breached.
- **Capital and Holding Validation:** Validates funds and share inventory before routing to the book or stop queue. Buyers have credits locked upon order submission; sellers have share quantities locked to prevent double-spending.
- **Self-Trade Prevention:** Prevents matching of orders submitted by the same participant ID.
- **Order Cancellation:** Allows cancellation of resting limit and stop orders, immediately unlocking reserved capital or shares.

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
- **Achievements & Milestone Engine:** Evaluates criteria upon trade settlement and order routing. Grants credit rewards and persists badges to SQLite.
- **Daily Performance Snapshot:** Tracks starting net worth per day, day P&L, day volume, and daily trade counts for end-of-day settlement.
- **Leaderboard Calculation:** Ranks all human and NPC participants by total net worth and total return.

### 3. Relational Persistence (`engine/sqlite-storage.js`)
- **Database Engine:** Node.js native `node:sqlite` (`DatabaseSync`).
- **Relational Tables:**
  - `accounts`: User identification, starting capital, current credits, locked credits, realized P&L, trades count, volume.
  - `holdings`: Foreign-key bound user positions per symbol, share quantity, average cost price, and locked quantity.
  - `trade_history`: Foreign-key bound chronological transaction log with execution timestamps and counterparty metadata.
  - `achievements`: Foreign-key bound records of unlocked badges and milestone timestamps.
- **Bootstrap Restoration:** Automatically reconstructs all active human trader portfolios, holdings, transaction histories, and unlocked achievements upon server start.

### 4. Market Clock and Phased Trading (`engine/clock.js`)
- **Day and Session State Machine:**
  - **PRE_MARKET (20s):** Orders can be queued; matching is halted.
  - **REGULAR_HOURS (180s / 3 min):** Active trading session with live continuous order execution. Simulated clock runs from 09:30 AM to 04:00 PM.
  - **POST_MARKET (25s):** Market close and settlement recap before day rollover.
- **Session Transitions:** Emits opening bell, closing bell, and day recap events across the WebSocket network.
- **Day Rollover:** Resets intraday accumulators, snapshots new opening net worth, and transitions cleanly into the next trading day.

### 5. Market and Stock Universe (`engine/market.js`)
- Five corporate entities across diverse market sectors:
  - **AUTO (AutoCorp):** Automotive and Electric Vehicles.
  - **SOLR (SolarGen):** Clean energy and solar utility infrastructure.
  - **BYTE (ByteWorks):** Cloud computing, hardware, and AI systems.
  - **NBNK (National Bank):** Financial institution and treasury banking.
  - **MEDL (MedLife):** Pharmaceuticals and clinical biotechnology.
- **Candlestick Aggregator:** Rolls OHLC (Open, High, Low, Close) candles at 5-second intervals with persistent rolling history for charting.
- **News and Sentiment Generator:** Periodic breaking news engine with fundamental valuation and market sentiment adjustments.
- **Daily Performance Metrics:** Computes top gainer, top loser, and cumulative daily exchange volume.

### 6. Algorithmic NPC Traders (`traders/`)
Eight autonomous trading bots interact with the matching engine to provide realistic market depth and price discovery:
- **Market Makers (MM Alpha Securities, Apex Liquidity LP):**
  - Provide continuous two-sided limit orders across bids and asks around the mid-price.
  - Dynamically widen spreads by up to 2.2x during breaking news or elevated volatility to guard against adverse selection.
  - Rebalance inventory skew when holdings deviate from neutral inventory targets.
- **Momentum Traders (Velocity Quant Bot, TrendRider Algorithmic):**
  - Calculate dual Simple Moving Averages (Fast 3-period vs Slow 8-period) to detect genuine momentum breakouts.
  - React directly to breaking news catalysts with high-conviction market executions.
- **Value Investors (DeepValue Asset Mgmt, Horizon Fundamental Fund):**
  - Evaluate current prices against company intrinsic value with defined safety margins.
  - Automatically re-evaluate discount and premium levels upon breaking corporate news updates.
- **Noise / Retail Traders (Retail Swarm Alpha, Retail Swarm Beta):**
  - Simulate stochastic retail order flow.

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
- **Order Entry Pad:**
  - Interactive controls for Buy/Sell selection.
  - Four order execution types: Limit, Market, Stop Loss, and Stop Limit.
  - Dynamic fields for limit price and stop trigger price with autofill helpers.
  - Quick percentage sizing (25%, 50%, 75%, Max), estimated trade value calculation, and best-price autofill.
- **Order Book Ladder:** Depth visualization displaying aggregate bid and ask volumes, cumulative depth bars, and bid-ask spread indicators.
- **Bottom Drawer Tabbed Views:**
  - **Portfolio:** Net worth, cash, locked funds, realized and unrealized P&L, holdings table with average cost and position values.
  - **Open Orders:** Active resting limit and stop orders with trigger thresholds and immediate cancellation triggers.
  - **My Trades:** Personal transaction ledger with execution timestamps, symbols, Buy/Sell indicators, Maker/Taker badges, and realized P&L.
  - **Achievements:** Trophy room displaying all 7 trading badges, completion status, criteria descriptions, and reward values.
  - **Leaderboard:** Live rankings of all active human and bot participants.
  - **News Log:** Historical archive of economic news and market catalysts.
- **End-of-Day Summary Modal:** Daily session recap dialog displaying intraday P&L, ending net worth, total volume, execution counts, top market gainer, and countdown to next session opening bell.
- **Audio Feedback:** Synthesized Web Audio tones for order fills, session opening and closing bells, breaking economic news alerts, stop order triggers, and milestone unlocks.

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

To execute the unit and integration test suite:
```bash
node tests/engine.test.js
```

To execute the live WebSocket integration test:
```bash
node tests/tier2_e2e_simulation.js
```

### Verified Test Cases:
1. Limit order book sorting and FIFO price-time priority.
2. Incoming order execution and trade generation.
3. Account management, margin locks, and post-trade settlement.
4. Full end-to-end matching coordinator and clock integration.
5. Personal trade history logging with Maker vs. Taker role assignment.
6. Memory state serialization and restoration.
7. Native SQLite relational persistence (accounts, holdings, and trade history).
8. Advanced order types (Stop-Loss and Stop-Limit execution upon price trigger breaches).
9. Achievements milestone detection, reward credit awards, and SQLite persistence.
10. Multi-day progression, end-of-day summary calculation, and clean day rollover.

---

## Version History

- **v0.1 (Pushed to GitHub):** Initial release featuring FIFO matching engine, account management, multi-archetype NPC bots, market clock cycle, and full-featured web trading terminal.
- **v0.2 (Pushed to GitHub):** Native SQLite relational persistence, personal trade history ledger and terminal tab, advanced candlestick and volume charting with crosshair inspection, and harmonic audio feedback.
- **v0.3 (Pushed to GitHub):** Advanced order types (Stop Loss & Stop Limit), 7 gamified achievements with credit rewards and HUD toasts, multi-day progression with End-of-Day recap modal, smarter NPC behavior (volatility spreads, news catalysts, SMA momentum), and full 10-test automated suite.

