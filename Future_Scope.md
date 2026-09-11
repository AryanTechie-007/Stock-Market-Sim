# MarketArena - Future Scope and Technical Roadmap

## Overview

This document outlines the architectural roadmap and deep feature queue for MarketArena as the platform progresses from its current local testing phase toward a public-facing, multi-tenant quantitative trading and market simulation platform.

Features completed in releases (e.g. SQLite persistence, achievements, multi-day rollover, stop-loss, stop-limit, trailing stops, OCO bracket orders, margin trading, short selling, multi-timeframe candles, institutional indicators, quantitative risk analytics, tournament mode, adaptive market regimes, statistical arbitrage bots, iceberg order execution, programmatic bot REST APIs, HMAC-SHA256 authentication, token-bucket rate limiting, Python/JavaScript client SDKs, responsive mobile/tablet layout, workspace layout presets, granular audio synthesis sound board, multi-stage Docker containerization, GitHub Actions CI/CD, cryptographic scrypt user authentication with session management, Geometric Brownian Motion continuous price discovery, news impact decay with spike-and-settle digestion, Opening Auction call market mechanism at single uniform clearing price, 10-company multi-asset expansion across 6 sectors, dynamic simulation world news engine, expanded 23-bot NPC trader fleet with scalper and news reactor archetypes, and Multi-Asset Correlation Engine via Cholesky Factorization) are migrated into production documentation upon verification.

---

## 1. Database and Persistence Infrastructure

### PostgreSQL Production Migration (Queued for v0.914)
- **Current State:** Zero-dependency SQLite implementation (`engine/sqlite-storage.js`) leveraging Node.js native `DatabaseSync` (`node:sqlite`).
- **Target State:** Managed PostgreSQL instance with connection pooling.
- **Migration Plan:**
  - Implement a pluggable database adapter interface (`DatabaseAdapter`) to allow seamless switching between SQLite for offline local testing and PostgreSQL for production staging and deployment.
  - Standardize schema DDL and migrations with identical foreign key constraints and indices.
  - Implement connection pooling and transaction isolation for high-concurrency order submissions and settlements.

### Redis In-Memory State & Pub/Sub
- Cache high-frequency order book depth and live ticker statistics.
- Use Redis Pub/Sub to decouple matching engine instances from WebSocket delivery nodes, enabling horizontal scalability across multiple server processes.

---

## 2. Quantitative Market Realism & Microstructure Simulation

### Order Book Imbalance (OBI) Signals & Adverse Selection Quoting (Queued for v0.909)
- **Problem:** Market makers currently quote symmetric two-sided depth around fair value. Real market makers dynamically skew quote depth and bid-ask spreads in response to order book volume imbalances and inventory risk.
- **Target Design:**
  - Measure Level 2 Order Book Imbalance:
    $$OBI = \frac{V_{\text{bid}} - V_{\text{ask}}}{V_{\text{bid}} + V_{\text{ask}}}$$
    where $V_{\text{bid}}$ and $V_{\text{ask}}$ represent total resting volume across the top $K$ price levels.
  - Skew quoting intensity: when $OBI > 0.30$ (strong buying pressure), raise bid quotes and tighten ask prices; when $OBI < -0.30$ (heavy ask overhang), lower bids and widen asks to prevent adverse selection.
  - Introduce dynamic inventory penalty skewing quotes toward neutral inventory.

### Closing Call Auction & Market-On-Close (MOC) / Limit-On-Close (LOC) Orders (Queued for v0.910)
- Formal closing call auction matching at 04:00 PM establishing official `closePrice`.
- MOC / LOC conditional order execution matching strictly at the closing cross.

### Indicative Auction Call HUD & Simulation World Macro Bar (Queued for v0.911)
- Terminal UI enhancements showing live Indicative Equilibrium Price (IEP) and Volume (IEV) paired with macro indicators (Interest Rate, CPI, GDP, Sector sentiment meters).

### Options Chains & Black-Scholes-Merton Derivatives Engine (Queued for v0.912)
- European/American Call & Put options pricing via Black-Scholes-Merton PDE.
- Real-time Greeks calculation ($\Delta, \Gamma, \Theta, \mathcal{V}, \rho$) and implied volatility surfaces.

### Dark Pool & Alternative Trading System (ATS) Midpoint Cross (Queued for v0.913)
- Non-displayed liquidity venue matching block orders at the midpoint of National Best Bid and Offer (NBBO) with zero displayed market impact.


