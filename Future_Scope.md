# MarketArena - Future Scope and Technical Roadmap

## Overview

This document outlines the architectural roadmap and deep feature queue for MarketArena as the platform progresses from its current local testing phase toward a public-facing, multi-tenant quantitative trading and market simulation platform.

Features completed in releases (e.g. SQLite persistence, achievements, multi-day rollover, stop-loss, stop-limit, trailing stops, OCO bracket orders, margin trading, short selling, multi-timeframe candles, institutional indicators, quantitative risk analytics, tournament mode, adaptive market regimes, statistical arbitrage bots, iceberg order execution, programmatic bot REST APIs, HMAC-SHA256 authentication, token-bucket rate limiting, Python/JavaScript client SDKs, responsive mobile/tablet layout, workspace layout presets, granular audio synthesis sound board, multi-stage Docker containerization, GitHub Actions CI/CD, cryptographic scrypt user authentication with session management, Geometric Brownian Motion continuous price discovery, news impact decay with spike-and-settle digestion, Opening Auction call market mechanism at single uniform clearing price, 10-company multi-asset expansion across 6 sectors, dynamic simulation world news engine, expanded 23-bot NPC trader fleet with scalper and news reactor archetypes, Multi-Asset Correlation Engine via Cholesky Factorization, Order Book Imbalance Signals & Adverse Selection Quoting, Closing Call Auction with MOC/LOC Order Execution, and Indicative Auction Call HUD & Simulation World Macro Bar) are migrated into production documentation upon verification.

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

### Options Chains & Black-Scholes-Merton Derivatives Engine (Queued for v0.912)
- European/American Call & Put options pricing via Black-Scholes-Merton PDE.
- Real-time Greeks calculation ($\Delta, \Gamma, \Theta, \mathcal{V}, \rho$) and implied volatility surfaces.

### Dark Pool & Alternative Trading System (ATS) Midpoint Cross (Queued for v0.913)
- Non-displayed liquidity venue matching block orders at the midpoint of National Best Bid and Offer (NBBO) with zero displayed market impact.


