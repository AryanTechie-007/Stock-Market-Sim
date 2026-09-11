# MarketArena - Financial Market Simulator

## Repository Metadata

- **Current Pushed Version:** v0.908
- **Username:** AryanTechie-007
- **Push Timestamp:** 2026-09-11 16:15:00 IST (UTC+05:30)
- **Current Status:** Deployed Build (Multi-Asset Correlation Engine Release)
- **Repository:** https://github.com/AryanTechie-007/Stock-Market-Sim

---

## Overview

MarketArena is a high-performance, gamified financial market simulator and quantitative trading terminal built with Node.js, Express, Socket.IO, and a vanilla JavaScript frontend terminal. The platform provides a realistic, continuous double-auction equity exchange featuring FIFO price-time order matching, conditional stop and bracket orders, margin leverage, short selling, an automated liquidation engine, multi-asset portfolio accounting, quantitative risk metrics (Sharpe ratio, maximum drawdown, profit factor, win rate), competitive multi-player speed tournaments, an adaptive market regime engine, ten autonomous algorithmic NPC traders (including statistical arbitrageurs and iceberg order execution whales), multi-timeframe candlestick generation, institutional-grade technical analysis indicators, simulated market clock cycles, an achievements milestone engine, end-of-day settlement summaries, and native relational state persistence.

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

The system is partitioned into modular subsystems within the `engine/`, `traders/`, and `public/` directories:

### 1. Order Matching Engine (`engine/matching.js`, `engine/orderbook.js`)
- **Execution Mechanism:** Strict Price-Time Priority (FIFO) matching algorithm.
- **Supported Order Types:**
  - **LIMIT Orders:** Placed into the active order book at specified prices. Bids are sorted descending by price, then ascending by timestamp; asks are sorted ascending by price, then ascending by timestamp. Unmatched shares remain resting in the order book.
  - **MARKET Orders:** Matched immediately against resting liquidity with slippage protection buffers.
  - **STOP LOSS Orders:** Conditional risk-management orders held outside the active order book. When market price drops to or below the trigger threshold (for sells) or rises to or above the threshold (for breakout buys), the order automatically converts to a Market order and executes against the book.
  - **STOP LIMIT Orders:** Conditional orders that convert to resting or matching Limit orders at the specified limit price once the stop trigger price is breached.
  - **TRAILING STOP Orders:** Dynamic conditional orders with a floating trigger price that automatically ratchets upward as market price advances (for long exits) or downward as market price falls (for short covers), locking in unrealized gains while triggering immediate execution on directional reversal.
  - **OCO (One-Cancels-the-Other) Bracket Orders:** Paired order execution combining an upside Take-Profit limit order and a downside Stop-Loss order. As soon as either leg executes (as maker or taker), the counterpart order is automatically cancelled from the order book or resting stop queue, preventing double execution.
- **Margin Trading & Leverage:**
  - Configurable leverage tiers (1x Cash, 2x Margin, 5x Margin).
  - Margin borrowing against account collateral with automatic borrowing calculation and margin loan tracking.
- **Short Selling & Buy-to-Cover:**
  - Enables selling borrowed shares without preexisting long holdings.
  - Proceeds are credited to cash with initial margin collateral requirements locked.
  - Subsequent purchases automatically buy-to-cover short liabilities, calculating realized profit and loss against the short cost basis.
- **Automated Liquidation Engine:**
  - Continuously evaluates account equity against maintenance margin requirements (25% for long positions, 30% for short positions).
  - Triggers forced market liquidations across positions if total equity falls below the maintenance threshold, preventing negative account balances.
- **Capital and Holding Validation:** Validates funds, collateral, and share inventory before routing to the book or stop queue.
- **Self-Trade Prevention:** Prevents matching of orders submitted by the same participant ID.
- **Order Cancellation:** Allows cancellation of resting limit, stop, and trailing orders, immediately unlocking reserved capital or shares.

### 2. Multi-Timeframe Candlestick Engine (`engine/market.js`)
- **Supported Timeframes:**
  - **1s:** Ultra-high frequency scalping resolution.
  - **5s (Default):** Tactical intraday execution timeframe.
  - **15s:** Short-swing intraday momentum resolution.
  - **1m:** Standard intraday trend resolution.
  - **5m:** Macro structural trend resolution.
- **Continuous Aggregation:**
  - Ticks incoming trade executions across all timeframe buckets simultaneously.
  - Evaluates bar completion on a 1-second cadence, maintaining up to 200 historical candles per timeframe.
  - Delivers requested resolutions on-demand via the WebSocket `chart:history` API.

### 3. Institutional Technical Analysis Engine (`public/js/indicators.js`)
Zero-dependency mathematical library computing real-time technical indicators over OHLCV arrays:
- **Simple Moving Average (SMA 20, SMA 50):** Arithmetic mean over 20 and 50 periods, rendered in amber and sky blue.
- **Exponential Moving Average (EMA 9, EMA 21):** Weighted moving averages with weighting multiplier k = 2 / (N + 1), rendered in purple and emerald.
- **Bollinger Bands (20, 2):** 20-period SMA middle band with symmetric plus/minus 2 standard deviation upper and lower bands and shaded volatility ribbon.
- **Volume Weighted Average Price (VWAP):** Cumulative typical price times volume divided by cumulative volume, rendered as a continuous cyan benchmark curve.
- **Relative Strength Index (RSI 14):** Wilder's smoothed momentum oscillator plotted in a dedicated lower panel with 70 overbought and 30 oversold dashed reference lines.
- **Moving Average Convergence Divergence (MACD 12, 26, 9):** Fast 12 EMA minus slow 26 EMA (MACD line), 9-period signal line, and color-coded momentum histogram bars.

### 4. Quantitative Risk Analytics Engine (`engine/analytics.js`)
Real-time mathematical performance analytics evaluated continuously on user equity curves and closed trade histories:
- **Sharpe Ratio:** Evaluates risk-adjusted excess returns over a baseline annual risk-free rate of 2.0%, measuring return generated per unit of total portfolio volatility.
- **Maximum Drawdown (MDD % & Value):** Quantifies worst-case peak-to-trough capital loss percentage across historical equity curves.
- **Profit Factor:** Ratio of gross winning profits to gross losing trades. Values greater than 1.5 represent robust edge.
- **Win Rate & Payoff Ratio:** Percentage of profitable closed positions paired with average winning trade divided by average losing trade.
- **Continuous Recalculation:** Computed on every portfolio state transition and broadcasted across WebSocket connections.

### 5. Competitive Blitz Tournament Coordinator (`engine/tournament.js`)
Standardized multiplayer tournament arena supporting high-speed round competitions:
- **Standardized Bankrolls:** Enrolled participants receive an isolated 50,000.00 CR competition bankroll with equal starting terms.
- **Automated Round Lifecycle:** State transitions through IDLE, COUNTDOWN (10s), ACTIVE (180s live trading), and CONCLUDED.
- **Isolated Trade Ledger:** Automatically tracks fills, realized P&L, and open inventory across tournament participants without affecting primary capital.
- **Live Mark-to-Market Ranking:** Dynamically values participant portfolios against live market prices and streams ranked standings.
- **Podium Prize Distribution:** Rewards top 3 finishers (1st Place: +5,000 CR, 2nd Place: +3,000 CR, 3rd Place: +1,500 CR) with instant balance deposits credited to primary accounts.

### 6. Account and Portfolio Management (`engine/accounts.js`)
- **Initial Capital:** Default allocation of 100,000.00 Credits (CR) per human user.
- **Double-Entry Settlement:**
  - Executes instant cash, equity, and margin loan settlement upon trade matching.
  - Tracks available cash versus locked cash (reserved for resting buy orders or short margin).
  - Tracks available long shares versus locked shares (reserved for resting sell orders).
  - Tracks short quantities, short average prices, and locked short quantities.
- **Position Accounting:**
  - Dynamic average cost basis calculation on long buy executions.
  - Short average execution price calculation on short selling executions.
  - Realized Profit and Loss (P&L) calculation upon share liquidations or buy-to-cover executions.
  - Unrealized P&L calculation against live market mark-to-market prices for both long and short positions.
  - Margin metrics: Total equity, total margin loan, maintenance margin requirement, and margin call alerts.
  - Real-time net worth and percentage return metrics.
- **Trade History Ledger:** Logs all executions with price, quantity, gross trade value, Maker vs. Taker role, counterparty, leverage, short indicator, and realized P&L.
- **Achievements & Milestone Engine:** Evaluates criteria upon trade settlement and order routing. Grants credit rewards and persists badges to SQLite.
- **Daily Performance Snapshot:** Tracks starting net worth per day, day P&L, day volume, and daily trade counts for end-of-day settlement.
- **Leaderboard Calculation:** Ranks all human and NPC participants by total net worth and total return.

### 7. Relational Persistence (`engine/sqlite-storage.js`)
- **Database Engine:** Node.js native `node:sqlite` (`DatabaseSync`).
- **Relational Tables:**
  - `accounts`: User identification, starting capital, current credits, locked credits, margin loans, leverage settings, realized P&L, trades count, volume.
  - `holdings`: Foreign-key bound user positions per symbol, long share quantity, average cost price, locked quantity, short quantity, short average price, and locked short quantity.
  - `trade_history`: Foreign-key bound chronological transaction log with execution timestamps, counterparty metadata, leverage, and short flags.
  - `achievements`: Foreign-key bound records of unlocked badges and milestone timestamps.
- **Bootstrap Restoration:** Automatically reconstructs all active human trader portfolios, holdings, margin balances, transaction histories, and unlocked achievements upon server start.

### 8. Market Clock and Phased Trading (`engine/clock.js`)
- **Day and Session State Machine:**
  - **PRE_MARKET (20s):** Orders can be queued; matching is halted.
  - **REGULAR_HOURS (180s / 3 min):** Active trading session with live continuous order execution. Simulated clock runs from 09:30 AM to 04:00 PM.
  - **POST_MARKET (25s):** Market close and settlement recap before day rollover.
- **Session Transitions:** Emits opening bell, closing bell, and day recap events across the WebSocket network.
- **Day Rollover:** Resets intraday accumulators, snapshots new opening net worth, and transitions cleanly into the next trading day.

### 9. Algorithmic NPC Traders (`traders/`)
Ten autonomous algorithmic trading bots interact with the matching engine to provide realistic market depth, cross-asset price discovery, and institutional order flow:
- **Market Makers (MM Alpha Securities, Apex Liquidity LP):** Continuous two-sided limit orders with dynamic volatility spread expansion based on macroeconomic regimes.
- **Statistical Arbitrageur (Citadel StatArb Alpha):** Real-time monitoring of cointegrated equity pairs (AUTO vs. SOLR, BYTE vs. NBNK), submitting pairs trades upon ratio divergences (|z| > 1.8) and unwinding upon mean reversion.
- **Institutional Whale (BlackRock Execution LP):** Iceberg block order execution bot that slices large institutional orders (800 - 2,500 shares) into small visible tranches (40 - 120 shares), automatically replenishing upon fill.
- **Momentum Traders (Velocity Quant Bot, TrendRider Algorithmic):** Dual SMA momentum breakouts and breaking news catalyst executions.
- **Value Investors (DeepValue Asset Mgmt, Horizon Fundamental Fund):** Intrinsic value evaluation with safety margins.
- **Noise / Retail Traders (Retail Swarm Alpha, Retail Swarm Beta):** Stochastic retail order flow.

### 10. Adaptive Market Regime Engine (`engine/regimes.js`)
Macroeconomic volatility coordinator modulating market-wide spreads, price volatility, and bot aggression:
- **NORMAL:** Baseline equilibrium conditions (1.0x spread multiplier, 1.0x volatility multiplier).
- **LOW_VOLATILITY:** Tight consolidation with compressed spreads (0.75x) and reduced tick volatility.
- **BREAKOUT:** Directional momentum impulse with expanding volume (2.2x) and wider directional ranges.
- **HIGH_VOLATILITY:** Liquidity drought where market makers expand spreads (2.2x) to protect capital.
- **FLASH_CRASH:** Severe liquidity withdrawal with cascading aggressive sell orders and 3.5x spread expansion, followed by automated mean-reversion recovery.
- **Live WebSocket Broadcasting:** Regime transitions stream in real-time across `regime:change` and `regime:tick` events.

---

## User Interface and Trading Terminal (`public/`)

The web client provides a professional desktop terminal layout:
- **Top Bar:** Market clock phase display, simulated time, session countdown timer, global ticker tape, Market Regime HUD indicator pill with live pulse status, Blitz tournament status bar and countdown timer, audio mute toggle, callsign manager.
- **Watchlist and Fundamentals:** Multi-asset ticker list with real-time percentage changes, company descriptions, P/E ratios, market caps, and sentiment indicators.
- **Interactive Candlestick & Volume Chart with Technical Suite:**
  - HTML5 Canvas chart displaying real-time OHLC candlestick bodies and wicks.
  - Integrated Volume Histogram sub-panel aligned to the bottom of the price chart.
  - **Timeframe Selector:** Instant resolution switching between `1s`, `5s`, `15s`, `1m`, and `5m`.
  - **Indicator Toolbar:** Toggles for `SMA`, `EMA`, `BOLL`, `VWAP`, `RSI`, and `MACD`.
  - **Oscillator Sub-Panel:** Dedicated lower canvas track displaying RSI 14 with 70/30 bands or MACD lines with zero-axis histogram bars.
  - **Interactive Crosshair HUD:** Hovering over any candle displays exact timestamp, OHLCV values, and live readings for all enabled technical indicators.
  - Current market price dashed reference line and active price tag.
- **Live Execution Tape:** Real-time stream of matched trades showing price, quantity, taker side, and execution timestamps.
- **Order Entry Pad:**
  - Interactive controls for Buy/Sell selection.
  - Six order execution types: Limit, Market, Stop Loss, Stop Limit, Trailing Stop, and OCO Bracket.
  - Trailing Stop Delta input field with dynamic ratchet tracking.
  - OCO dual inputs: Take-Profit Limit Price and Stop-Loss Trigger Price with best-quote autofill.
  - Leverage selector toggles (1x Cash, 2x Margin, 5x Margin) with real-time collateral margin cost estimation.
  - Quick percentage sizing (25%, 50%, 75%, Max), estimated trade value calculation, and best-price autofill.
- **Order Book Ladder:** Depth visualization displaying aggregate bid and ask volumes, cumulative depth bars, and bid-ask spread indicators.
- **Bottom Drawer Tabbed Views:**
  - **Portfolio:** Net worth, cash, locked funds, margin loan, margin health level, realized and unrealized P&L, holdings table with average cost, position values, and Long/Short badges.
  - **Quantitative Risk Analytics Row:** Dedicated institutional risk bar displaying Sharpe Ratio, Maximum Drawdown (MDD %), Profit Factor, Win Rate %, Wins / Losses ratio, and Payoff Ratio.
  - **Tournament Arena:** Competitive speed trading arena featuring live round timer, status indicator, standardized 50k CR bankrolls, prize pool schedule, and real-time mark-to-market competitor rankings.
  - **Open Orders:** Active resting limit, stop, trailing stop, and OCO bracket orders with trigger thresholds and immediate cancellation buttons.
  - **My Trades:** Personal transaction ledger with execution timestamps, symbols, Buy/Sell indicators, Maker/Taker badges, and realized P&L.
  - **Achievements:** Trophy room displaying all 7 trading badges, completion status, criteria descriptions, and reward values.
  - **Leaderboard:** Live rankings of all active human and bot participants.
  - **News Log:** Historical archive of economic news and market catalysts.
- **End-of-Day Summary Modal:** Daily session recap dialog displaying intraday P&L, ending net worth, total volume, execution counts, top market gainer, and countdown to next session opening bell.
- **Tournament Podium Modal:** Concluded round celebration card presenting gold, silver, and bronze podium finishers with net returns and cash prize allocations.
- **Audio Feedback:** Synthesized Web Audio tones for order fills, session opening and closing bells, breaking economic news alerts, stop order triggers, and milestone unlocks.

### 11. Programmatic Bot API & Developer SDK Engine (`engine/api-keys.js`, `engine/rate-limiter.js`, `sdk/`)
- **Public RESTful Endpoints (`/api/v1`):**
  - `GET /api/v1/ping`: Server health check, phase, and timestamp.
  - `GET /api/v1/regime`: Query active macroeconomic market regime and multipliers.
  - `GET /api/v1/orderbook/:symbol`: Fetch real-time L2 order book depth (bids, asks, spread).
  - `GET /api/v1/candles/:symbol`: Query historical OHLCV candlestick bars across all resolutions (`1s`, `5s`, `15s`, `1m`, `5m`).
  - `POST /api/v1/keys`: Generate cryptographically randomized API key pairs for trader accounts.
  - `GET /api/v1/keys`: Query active API keys for a trader.
  - `DELETE /api/v1/keys/:keyId`: Revoke an active API key.
  - `GET /api/v1/account`: Query portfolio balances, cash, margin debt, and quantitative risk metrics.
  - `GET /api/v1/orders`: List active resting orders for the authenticated bot.
  - `POST /api/v1/orders`: Execute limit, market, stop-loss, stop-limit, trailing stop, and margin/short orders programmatically.
  - `DELETE /api/v1/orders/:id`: Cancel resting orders by order ID.
- **HMAC-SHA256 Cryptographic Authentication:**
  - Header signature authentication using `X-API-KEY`, `X-API-TIMESTAMP`, and `X-API-SIGNATURE` (`timestamp + method + path + body`).
  - 60-second replay attack protection window.
  - Granular permission scopes (`read` vs. `trade`).
- **Token-Bucket Rate Limiter:**
  - In-memory token bucket rate limiting per API key or IP address (capacity: 100 requests, refill: 20 tokens/sec).
  - Emits standard `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` HTTP headers.
  - Rejects rate-limit breaches with HTTP 429 Too Many Requests and `Retry-After` headers.
- **Zero-Dependency Python 3 Client SDK (`sdk/python/marketarena.py`):**
  - Pure standard library Python client supporting HMAC request signing, order placement, book inspection, and optional Pandas DataFrame export.
  - Includes ready-to-run algorithmic bot script (`sdk/python/example_bot.py`).
- **Zero-Dependency JavaScript Node.js Client SDK (`sdk/js/marketarena.js`):**
  - Asynchronous client class supporting automated request signing and promise-based market interactions.
  - Includes ready-to-run algorithmic bot script (`sdk/js/example_bot.js`).
- **In-Terminal Developer Portal Modal:**
  - Dedicated "DEV API" topbar button launching the interactive portal.
  - One-click API key generation, credential reveal/hide toggles, clipboard copying, and live code snippet generation for Python, Node.js, and cURL.

### 12. Frontend Terminal Modernization, Responsive Layout, & Audio Synthesis (`public/`)
- **Responsive Breakpoint Engine:**
  - Multi-tier responsive grid system supporting desktop, tablet, and mobile screens (`1200px`, `992px`, `768px`, and `480px`).
  - Adaptive column reflow from 3-column desktop layout to collapsible tablet view and vertical mobile stream.
  - Horizontal swipeable ticker ribbon with touch scrolling.
- **Mobile Bottom Sheet Drawer & Floating Quick Trade Bar:**
  - Sticky bottom trade bar on mobile displaying active symbol, live market price, and rapid BUY / SELL action triggers.
  - Bottom sheet sliding drawer (`#colOrder.mobile-drawer-open`) with smooth cubic-bezier animation and dismiss controls.
- **Workspace Layout Presets & Customization:**
  - Interactive workspace layout selector offering four specialized trading configurations:
    - **PRO TERMINAL:** Standard comprehensive 3-column layout with Watchlist, Fundamentals, Candlestick Chart, Tape, Depth Ladder, and Order Form.
    - **CHART FOCUS:** Maximized full-width candlestick canvas and execution tape for deep technical charting.
    - **SPEED TRADER:** L2 depth ladder and order entry pad prioritized for rapid intraday scalping.
    - **ANALYTICS HUD:** Quantitative performance metrics, portfolio breakdown, and tournament standings prioritized.
  - Granular panel visibility toggles (Watchlist, Depth/Order, Tape) with persistent state saved in local browser storage.
- **Granular Synthesized Audio Sound Board:**
  - Dedicated interactive Web Audio sound board modal with master volume slider (0% to 100%) and instant master mute toggle.
  - Six independent audio channels with dedicated volume sliders and live test audition triggers:
    - Channel 1: Trade Fills & Executions (harmonic dual-sine chord)
    - Channel 2: Tape Order Ticks (pitch-modulated frequency tick)
    - Channel 3: Stop Breaches & Liquidation (descending sawtooth alarm)
    - Channel 4: Market Session Bells (opening C5 and closing G4 bells)
    - Channel 5: Breaking News & Macro Catalysts (staccato alert beep)
    - Channel 6: Milestone Fanfare & Tournament Podium (triad fanfare chords)
  - Full volume configuration and mute settings persisted in browser storage.

### 13. Geometric Brownian Motion (GBM) Price Discovery Engine (`engine/market.js`)
- **Stochastic Continuous Price Discovery:**
  - Continuous Itô process simulation modeling equity price discovery via Geometric Brownian Motion:
    $$dS_t = \mu S_t dt + \sigma S_t dW_t$$
  - Discrete simulation step evaluation based on analytical Itô lognormal solution:
    $$S_{t + \Delta t} = S_t \cdot \exp\left( \left(\mu - \frac{1}{2}\sigma^2\right) \Delta t + \sigma \sqrt{\Delta t} \, Z_t \right)$$
    where $Z_t \sim \mathcal{N}(0, 1)$ is generated via the Box-Muller transformation.
- **Annualized Drift and Volatility Parameters:**
  - Each listed company is parameterized with individual expected annual capital appreciation ($\mu \in [0.06, 0.16]$) and annualized volatility ($\sigma \in [0.1587, 0.3969]$) scaled to simulation time steps ($\Delta t = \frac{1}{252 \times 180}$).
- **Macroeconomic Regime Volatility Multipliers:**
  - Diffusion term $\sigma \sqrt{\Delta t} Z_t$ scales dynamically with `MarketRegimeEngine` multipliers (from 0.5x in `LOW_VOLATILITY` to 4.0x in `FLASH_CRASH`).
- **Trading Session Phase Gating:**
  - GBM stochastic ticks run continuously during `REGULAR_HOURS` and automatically halt during `PRE_MARKET` and `POST_MARKET` settlement cycles.
- **Anti-Flatline Quiet Interval Protection:**
  - If a stock experiences $\ge 3$ seconds without trade execution, soft mean-reversion nudges the market price toward living intrinsic value, synchronizing active candlestick bodies and eliminating artificial flatlines.
- **Designated Market Maker Quote Centering:**
  - Designated Market Makers dynamically anchor two-sided quote ladders around fair value (blending last traded price with living intrinsic value), allowing fundamental drift to translate naturally into order-driven price discovery.

### 14. News Impact Decay & Spike-and-Settle Engine (`engine/market.js`)
- **Behavioral Overreaction & Digestion Modeling:**
  - Implements realistic financial market response to economic catalysts and corporate breaking news:
    1. **Immediate Overreaction (Spike Phase):** Confirmed news events overshoot fundamental value by 140% ($1.4\times$ multiplier), while speculative rumors produce higher speculative frenzy of 160% ($1.6\times$ multiplier).
    2. **Exponential Digestion (Settling Phase):** Over a standard 30-second trading horizon, the transient overreaction undergoes continuous convex exponential digestion via normalized decay:
       $$\alpha(\tau) = \frac{\exp(-3.0 \cdot \tau) - \exp(-3.0)}{1 - \exp(-3.0)} \quad \text{where } \tau = \frac{t}{D} \in [0, 1]$$
    3. **Permanent Fundamental Residual:** Value smoothly converges to a permanent structural shift (~55% of raw impact for confirmed catalysts, ~30% for unconfirmed rumors).
- **Log-Space Exact Multiplier Convergence:**
  - Employs exact log-ratio step adjustments ($\ln(M_{\text{decay}}) = \ln(\frac{1 + \text{residualFactor}}{1 + \text{initialShockFactor}})$) ensuring mathematical convergence to theoretical residual targets with zero roundoff drift.
- **Sentiment Decoupling and Reversion:**
  - Sentiment metrics surge instantaneously on breaking catalysts and exponentially settle back toward baseline equilibrium alongside intrinsic value.
- **Concurrent News Multi-Event Queue:**
  - Supports overlapping concurrent catalysts across multiple symbols, tracking and resolving active decay curves independently.

### 15. Opening Auction Call Market Engine (`engine/orderbook.js`, `engine/matching.js`)
- **Call Market Pre-Market Accumulation:**
  - Orders accumulate in the book during `PRE_MARKET` without continuous FIFO matching, allowing overlapping bids and asks to build institutional liquidity.
- **Volume Maximization Algorithm ($P^*$):**
  - Evaluates cumulative buy and sell schedules across candidate price levels, determining the single equilibrium clearing price $P^*$ that maximizes executable volume:
    $$Q_{\text{exec}}(P) = \min(Q_{\text{buy}}(P), Q_{\text{sell}}(P))$$
  - Multi-tier tie-breaking: Maximizes volume $\rightarrow$ Minimizes imbalance $|Q_{\text{buy}} - Q_{\text{sell}}| \rightarrow$ Minimizes distance to reference price (previous close / midpoint).
- **Single Uniform Clearing Price Execution:**
  - All crossing orders execute at identical price $P^*$.
  - Unmatched resting shares remain in the order book, creating an uncrossed double auction for regular trading hours.
  - The opening trade establishes the official `openPrice` and initial candle of the session.
  - Real-time Indicative Equilibrium Price (IEP) and Volume (IEV) query endpoints (`/api/v1/auction/:symbol`, `/api/v1/auction`).

### 16. Simulation World News Engine & Multi-Asset Expansion (`engine/news-engine.js`, `engine/market.js`, `traders/`)
- **10-Company Multi-Asset Expansion:**
  - Expanded listed equities from 5 to 10 companies across 6 distinct sectors:
    - `AUTO` (Auto · EV), `SOLR` (Clean Energy), `BYTE` (Cloud · AI), `NBNK` (Banking), `MEDL` (Biotech · Pharma).
    - `AERO` (AeroDynamics Inc. — Aerospace & Defense), `SEMI` (NovaSilicon Technologies — Semiconductors & Hardware), `RETL` (OmniRetail Global — Retail & E-Commerce), `CYBR` (CipherShield Security — Cybersecurity & GovTech), `STRM` (StreamPulse Entertainment — Digital Media).
  - Each equity possesses full quantitative GBM parameters ($\mu, \sigma$), fundamental valuation statistics, marks, and descriptions.
- **Dynamic Simulation World News Engine:**
  - Procedural macroeconomic world context (interest rate environment, CPI inflation, GDP growth rate, sector sentiment trackers).
  - Five distinct catalyst event classes: Macroeconomic Policy, Sector Waves, Quarterly Earnings Reports (procedural EPS beats and misses), Corporate Catalysts, and Speculative Rumors.
  - Interleaved with the v0.906 Spike-and-Settle decay engine.
- **Expanded 23-Bot NPC Trader Fleet:**
  - Expanded from 10 to 23 autonomous algorithmic bots spanning 8 distinct archetypes:
    - 4 Market Makers, 4 Momentum Traders, 3 Value Investors, 4 Retail Swarm Bots, 2 Statistical Arbitrageurs, 2 Iceberg Whales.
    - **High-Frequency Scalpers (`traders/scalper.js`):** Microsecond-level evaluation of the top of book, penny-jumping inside spreads, and rapid order recycling.
    - **News Sentiment Momentum Reactors (`traders/news-reactor.js`):** Rapidly front-runs initial spike phases and takes profit during the 30s digestion window.
  - Pre-market auction order priming ensures rich liquidity and executable volume at the opening bell.

### 17. Multi-Asset Correlation Engine via Cholesky Factorization (`engine/market.js`)
- **Analytical Matrix Factorization ($\mathbf{\Sigma} = \mathbf{L} \mathbf{L}^T$):**
  - Synthesizes a positive semi-definite $10 \times 10$ asset cross-correlation matrix spanning all listed equities across 6 sectors.
  - Implements native, zero-dependency Cholesky-Banachiewicz decomposition algorithm to compute the exact lower triangular matrix $\mathbf{L}$:
    $$L_{j,j} = \sqrt{\Sigma_{j,j} - \sum_{k=1}^{j-1} L_{j,k}^2}, \quad L_{i,j} = \frac{1}{L_{j,j}} \left( \Sigma_{i,j} - \sum_{k=1}^{j-1} L_{i,k} L_{j,k} \right) \quad (i > j)$$
  - Factorization satisfies exact analytical reconstruction with machine-precision residual error ($||\mathbf{L} \mathbf{L}^T - \mathbf{\Sigma}|| \le 2.22 \times 10^{-16}$).
- **Correlated Multi-Asset Wiener Increments:**
  - Converts $N$ independent standard Gaussian normal variates $\mathbf{Z} \sim \mathcal{N}(0, \mathbf{I})$ generated via Box-Muller transformation into correlated shock vectors:
    $$\mathbf{\epsilon} = \mathbf{L} \cdot \mathbf{Z}, \quad \text{where } \text{Cov}(\mathbf{\epsilon}) = \mathbf{L} \mathbf{L}^T = \mathbf{\Sigma}$$
  - Multiplies shocks by $\sqrt{\Delta t}$ to produce authentic correlated Brownian increments $dW_i = \epsilon_i \sqrt{\Delta t}$ driving Itô diffusion.
- **Synchronized Sector Price Discovery:**
  - High intra-sector correlation pairs (e.g., Tech `BYTE` $\leftrightarrow$ `SEMI` $\rho = +0.70$, Defense `AERO` $\leftrightarrow$ `CYBR` $\rho = +0.55$, Clean Energy `AUTO` $\leftrightarrow$ `SOLR` $\rho = +0.58$) demonstrate authentic co-movement frequency ($> 68\%$), while counter-cyclical pairs (Banking `NBNK` $\leftrightarrow$ Tech `BYTE` $\rho = -0.15$) exhibit realistic diversification.
- **RESTful Correlation Inspection Endpoint:**
  - `GET /api/v1/market/correlation`: Exposes asset list, raw correlation matrix $\mathbf{\Sigma}$, and calculated lower-triangular Cholesky factor matrix $\mathbf{L}$ for quantitative analysis.

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

### Running with Docker

1. Build and start using Docker Compose:
```bash
docker compose up -d --build
```

2. Inspect container status and health:
```bash
docker ps
docker logs -f marketarena-server
```

3. Stop the container stack:
```bash
docker compose down
```

---

## Automated Verification and Tests

To execute the core engine unit and integration test suite:
```bash
node tests/engine.test.js
```

To execute the technical indicators mathematical verification suite:
```bash
node tests/indicators.test.js
```

To execute the quantitative risk analytics performance test suite:
```bash
node tests/analytics.test.js
```

To execute the competitive tournament coordinator test suite:
```bash
node tests/tournament.test.js
```

To execute the adaptive market regime engine test suite:
```bash
node tests/regimes.test.js
```

To execute the statistical arbitrage algorithmic bot test suite:
```bash
node tests/arbitrage.test.js
```

To execute the iceberg whale institutional bot test suite:
```bash
node tests/iceberg.test.js
```

To execute the API security, authentication, and rate limiting test suite:
```bash
node tests/api_security.test.js
```

To execute the public RESTful endpoints test suite:
```bash
node tests/rest_api.test.js
```

To execute the developer SDK client test suite (JS and Python):
```bash
node tests/sdk_client.test.js
```

To execute the frontend modernization, responsive layout, and audio sound board test suite:
```bash
node tests/v09_frontend_modernization.test.js
```

To execute the production containerization and CI/CD configuration test suite:
```bash
node tests/container_config.test.js
```

To execute the user authentication and session security test suite:
```bash
node tests/auth.test.js
```

To execute the live WebSocket integration tests:
```bash
node tests/tier2_e2e_simulation.js
node tests/v04_e2e_simulation.js
node tests/v05_e2e_simulation.js
node tests/v06_e2e_simulation.js
node tests/v07_e2e_simulation.js
node tests/v08_e2e_simulation.js
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
11. Trailing Stop dynamic ratcheting and execution on directional reversals.
12. OCO bracket orders mutual cancellation upon execution of either leg.
13. Short selling, margin collateral verification, and buy-to-cover P&L settlement.
14. Margin borrowing (up to 5x), maintenance margin monitoring, and automated forced liquidation.
15. SQLite persistence of margin loans, short positions, and short cost basis.
16. Multi-timeframe candlestick generation across 1s, 5s, 15s, 1m, and 5m resolutions.
17. Indicator math: Simple Moving Average (SMA 20/50).
18. Indicator math: Exponential Moving Average (EMA 9/21).
19. Indicator math: Bollinger Bands standard deviation envelopes and bandwidth.
20. Indicator math: Volume Weighted Average Price (VWAP) volume-weighted accumulation.
21. Indicator math: Relative Strength Index (RSI 14) boundary conditions and Wilder smoothing.
22. Indicator math: Moving Average Convergence Divergence (MACD 12/26/9) lines and histogram.
23. Quantitative analytics: Win rate, gross profit/loss, and profit factor calculation.
24. Quantitative analytics: Maximum drawdown (MDD) peak-to-trough equity drop.
25. Quantitative analytics: Sharpe ratio risk-adjusted return calculation.
26. Tournament coordinator: Bankroll initialization, isolated round ledger, and trade settlement.
27. Tournament coordinator: Mark-to-market leaderboard, podium ranking, and prize bonus awards.
28. Adaptive market regime engine: Macroeconomic state transitions, dynamic spread multipliers (up to 3.5x), and volatility multipliers.
29. Statistical arbitrage: Cointegrated pairs price-ratio tracking, rolling Z-score calculation, threshold divergence entry, and mean reversion unwinding.
30. Iceberg whale execution: Institutional parent block slicing, visible tranche placement, reserve depth concealment, and automatic fill replenishment.
31. Autonomous NPC fleet: 10 concurrent algorithmic bots spanning 6 specialized archetypes responding synchronously to macroeconomic regime shifts.
32. Cryptographic API key generation, SQLite persistence, and HMAC-SHA256 signature verification.
33. Replay attack defense and granular permission scope enforcement (read vs. trade).
34. Token-bucket rate limiter burst enforcement and HTTP 429 exhaustion handling.
35. Programmatic algorithmic bot integration and execution via Python and JavaScript SDKs.
36. Responsive layout breakpoints (1200px, 992px, 768px, 480px) and mobile bottom sheet drawer CSS.
37. Workspace layout presets (PRO, CHART_FOCUS, SPEED, ANALYTICS) and dynamic panel visibility toggling.
38. Multi-channel audio synthesizer sound board gain scaling, mute state, and persistent sound configuration.
39. JavaScript terminal frontend zero-syntax compilation and interactive button event listener integrity.
40. Multi-round platform stress testing suite (5 consecutive rounds, 25 test executions) and repository-wide regression runner.
41. Multi-stage Docker container build directives, alpine runtime minimization, docker-compose orchestration, and GitHub Actions CI workflow.
42. Cryptographic scrypt password hashing, unique random salting, constant-time verification, session token lifecycle, and CSRF protection.
43. Geometric Brownian Motion (GBM) Box-Muller normality, asset parameterization, Itô lognormal non-negativity, trading clock phase gating, regime volatility scaling, market maker fair value quotation, and anti-flatline quiet interval drift.
44. News Impact Decay overreaction spike (140% confirmed, 160% rumor), convex exponential digestion trajectory, permanent residual convergence (~55%), bearish panic plunge-and-rebound, market maker quote adaptation, and multi-event concurrent queue resilience.
45. Opening Auction Call Market pre-market accumulation, volume-maximizing clearing price determination (P*), multi-tier tie-breaking, uniform clearing price execution, residual order retention, and automated opening bell trigger establishing official openPrice.
46. Simulation World News Engine procedural event generation (Macro, Sector, Earnings, Corporate, Rumors), macroeconomic state tracking, 10-company multi-asset parameterization across 6 sectors, and 23-bot NPC fleet execution with Scalper and News Reactor archetypes.
47. Multi-Asset Correlation Engine 10x10 matrix symmetry, analytical Cholesky factorization exact reconstruction ($||\mathbf{L} \mathbf{L}^T - \mathbf{\Sigma}|| < 10^{-15}$), Monte Carlo empirical covariance convergence ($N=10,000$), correlated Wiener diffusion co-movement frequency, and 500-step long-horizon multi-asset stability.

---

## Version History

- **v0.1 (Pushed to GitHub):** Initial release featuring FIFO matching engine, account management, multi-archetype NPC bots, market clock cycle, and full-featured web trading terminal.
- **v0.2 (Pushed to GitHub):** Native SQLite relational persistence, personal trade history ledger and terminal tab, advanced candlestick and volume charting with crosshair inspection, and harmonic audio feedback.
- **v0.3 (Pushed to GitHub):** Advanced order types (Stop Loss & Stop Limit), 7 gamified achievements with credit rewards and HUD toasts, multi-day progression with End-of-Day recap modal, smarter NPC behavior (volatility spreads, news catalysts, SMA momentum), and full 10-test automated suite.
- **v0.4 (Pushed to GitHub):** Advanced execution mechanics: Trailing Stop orders with dynamic peak/trough ratcheting, OCO (One-Cancels-the-Other) bracket orders with mutual counterpart cancellation, Margin Trading with up to 5x leverage, Short Selling with borrow collateral mechanics, automated maintenance margin monitoring and forced liquidation engine, SQLite schema migrations for margin loans and short positions.
- **v0.5 (Pushed to GitHub):** Technical Analysis & Multi-Timeframe Charting Suite: Multi-timeframe candlestick engine (1s, 5s, 15s, 1m, 5m), overlay indicators (SMA 20/50, EMA 9/21, Bollinger Bands with shaded channel, session VWAP), lower Oscillator sub-panel (RSI 14 with 70/30 thresholds, MACD with signal line and colored histogram), expanded interactive HUD crosshair, and mathematical indicator test suite.
- **v0.6 (Pushed to GitHub):** Quantitative Risk Analytics & Competitive Tournament Mode: Zero-dependency quantitative performance engine (Sharpe Ratio, Maximum Drawdown %, Profit Factor, Win Rate %, Win/Loss Ratio, Payoff Ratio) integrated into portfolio tracking and WebSockets; Competitive Blitz Tournament Coordinator featuring standardized 50,000 CR bankrolls, automated round lifecycle transitions (Countdown, Active, Concluded), mark-to-market live rankings, isolated trade accounting, top-3 podium cash awards (1st +5,000 CR, 2nd +3,000 CR, 3rd +1,500 CR) deposited to primary accounts, dedicated Tournament Arena tab, and celebratory podium modal.
- **v0.7 (Pushed to GitHub):** Advanced Algorithmic NPCs & Adaptive Market Regimes: Autonomous macroeconomic state coordinator (MarketRegimeEngine) transitioning between NORMAL, LOW_VOLATILITY, BREAKOUT, HIGH_VOLATILITY, and FLASH_CRASH states with dynamic spread and volatility multipliers; Statistical Arbitrage Bot (StatisticalArbitrageTrader) tracking cointegrated synthetic pairs (AUTO/SOLR, BYTE/NBNK) via rolling Z-scores with entry on divergence and exit on mean reversion; Iceberg Whale Bot (IcebergWhaleTrader) slicing institutional orders (800 - 2,500 shares) into small visible tranches (40 - 120 shares) with automatic post-fill replenishment while concealing reserve depth; dynamic Market Maker quote spread scaling; and real-time Topbar Regime HUD indicator pill with status-colored pulse animations and breaking catalyst toast notifications.
- **v0.8 (Pushed to GitHub):** Programmatic Bot API & Developer SDK: Comprehensive RESTful trading API and WebSocket streaming architecture for external algorithmic bots; HMAC-SHA256 cryptographic request signing (X-API-KEY, X-API-TIMESTAMP, X-API-SIGNATURE) with replay protection; token-bucket rate limiting (capacity 100, refill 20 tokens/sec); full REST endpoints for public market data (/api/v1/orderbook/:symbol, /api/v1/candles/:symbol, /api/v1/regime, /api/v1/ping) and authenticated trading operations (/api/v1/account, /api/v1/orders, /api/v1/keys); zero-dependency Python 3 Client SDK (sdk/python/marketarena.py); zero-dependency JavaScript Node.js Client SDK (sdk/js/marketarena.js); plug-and-play bot example scripts; and interactive in-terminal Developer Portal modal with one-click credential generation and code snippet exporter.
- **v0.9 (Pushed to GitHub):** Frontend Terminal Modernization & Responsive Layout: Multi-tier responsive breakpoint engine across mobile, tablet, and ultra-wide viewports (1200px, 992px, 768px, 480px); mobile floating quick trade action bar and smooth sliding bottom sheet order entry drawer; Workspace Layout Customizer featuring four specialized presets (PRO TERMINAL, CHART FOCUS, SPEED TRADER, ANALYTICS HUD) and individual panel toggles; and Granular Synthesized Audio Sound Board with master volume slider, master mute toggle, and six independent audio channels (Fills, Ticks, Alerts, Bells, News, Fanfare) with live audition triggers and persistent browser storage.
- **v0.901 (Pushed to GitHub):** Frontend Terminal Event System & Button Interaction Hotfix: Eliminated dangling HTML template tokens that caused JavaScript parsing syntax errors in app.js, restored complete browser button click responsiveness across order pads, workspace presets, and sound boards, and added automated compile-time syntax validation to frontend modernization test suite.
- **v0.902 (Pushed to GitHub):** Platform Stress Runner & Test Automation: Integrated multi-round automated stress testing suite (tests/stress_runner.test.js) and full repository regression runner (tests/full_regression.test.js) into standard npm test lifecycle scripts.
- **v0.903 (Pushed to GitHub):** Production Docker Containerization & CI/CD Pipeline: Engineered multi-stage production Dockerfile based on node:22-alpine with non-root security boundaries and built-in HTTP healthchecks; authored docker-compose.yml with persistent SQLite volume mounts; configured .dockerignore rules; and established automated GitHub Actions CI workflow (.github/workflows/ci.yml) validating all test suites on node:20.x and node:22.x runners.
- **v0.904 (Pushed to GitHub):** User Authentication, Password Hashing & Session Security: Built native cryptographic credentials subsystem (engine/auth.js) utilizing Node.js crypto.scryptSync with 16-byte random salts and constant-time timingSafeEqual verification; engineered SQLite relational tables (user_credentials, user_sessions) with foreign key relationships; created 24-hour cryptographically randomized session tokens (masess_...) and per-session CSRF tokens (macsrf_...); and mounted RESTful authentication endpoints (/api/v1/auth/register, /login, /me, /logout, /logout-all).
- **v0.905 (Pushed to GitHub):** Geometric Brownian Motion (GBM) Price Discovery Engine: Engineered continuous stochastic price discovery subsystem (`engine/market.js`) implementing Itô's Lemma Geometric Brownian Motion ($dS_t = \mu S_t dt + \sigma S_t dW_t$) with Box-Muller normal variate generation; parameterized all listed equities with quantitative annual drift ($\mu$) and annualized volatility ($\sigma$); coupled diffusion variance dynamically to `MarketRegimeEngine` multipliers (0.5x to 4.0x); gated stochastic execution strictly to `REGULAR_HOURS`; added quiet interval anti-flatline soft mean-reversion drift synchronizing multi-timeframe candlestick buffers; updated Designated Market Maker quoting logic (`traders/market-maker.js`) to anchor quote ladders around living fair value; and authored full 8-test verification suite (`tests/gbm.test.js`) integrated into multi-round stress runner and repository regression suite.
- **v0.906 (Pushed to GitHub):** News Impact Decay & Spike-and-Settle Engine: Engineered behavioral news impact digestion subsystem (`engine/market.js`) modeling the empirical three-stage market response to news catalysts (immediate overreaction spike, 30-second convex exponential digestion, and permanent fundamental residual); parameterized confirmed news at 140% spike with 55% residual and speculative rumors at 160% spike with 30% residual; implemented exact log-ratio step multipliers strictly converging to theoretical targets; coupled sentiment decay and Market Maker quoting adaptation across the digestion horizon; and authored dedicated 7-test verification suite (`tests/news_decay.test.js`) integrated into multi-round stress runner and repository regression suite.
- **v0.907 (Pushed to GitHub):** Opening Auction Mechanism, Simulation World News Engine & Multi-Asset Expansion: Implemented call market opening auction mechanism (`engine/orderbook.js`, `engine/matching.js`) with pre-market order accumulation, volume-maximizing clearing price algorithm ($P^*$), multi-tier tie-breaking, and uniform single clearing price execution establishing session `openPrice`; expanded listed equity universe to 10 companies across 6 economic sectors (`AUTO`, `SOLR`, `BYTE`, `NBNK`, `MEDL`, `AERO`, `SEMI`, `RETL`, `CYBR`, `STRM`); engineered stateful Simulation World News Engine (`engine/news-engine.js`) generating procedural macroeconomic, sector, quarterly earnings, corporate, and rumor catalysts; expanded autonomous NPC trader fleet to 23 bots introducing High-Frequency Scalpers (`traders/scalper.js`) and News Sentiment Momentum Reactors (`traders/news-reactor.js`); authored dedicated automated suites (`tests/opening_auction.test.js`, `tests/simulation_world.test.js`) and verified across 50-execution multi-round stress runner and 24-suite platform regression.
- **v0.908 (Current Release):** Multi-Asset Correlation Engine via Cholesky Factorization: Implemented native analytical Cholesky decomposition ($\mathbf{\Sigma} = \mathbf{L} \mathbf{L}^T$) across a positive semi-definite 10x10 correlation matrix spanning all listed equities; transformed independent standard normal Gaussian variates into correlated multi-asset Wiener shock vectors ($\mathbf{dW}_t = \mathbf{L} \cdot \mathbf{Z}_t \sqrt{\Delta t}$); integrated correlated diffusion into Geometric Brownian Motion continuous price discovery; exposed RESTful matrix inspection endpoint (`GET /api/v1/market/correlation`); authored 5-test analytical and Monte Carlo verification suite (`tests/cholesky_correlation.test.js`) achieving machine-precision matrix reconstruction error ($< 10^{-15}$); and verified 100% reliability across 55-execution multi-round stress runner and 25-suite platform regression.





