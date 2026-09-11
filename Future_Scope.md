# MarketArena - Future Scope and Technical Roadmap

## Overview

This document outlines the architectural roadmap and deep feature queue for MarketArena as the platform progresses from its current local testing phase toward a public-facing, multi-tenant quantitative trading and market simulation platform.

Features completed in releases (e.g. SQLite persistence, achievements, multi-day rollover, stop-loss, stop-limit, trailing stops, OCO bracket orders, margin trading, short selling, multi-timeframe candles, institutional indicators, quantitative risk analytics, tournament mode, adaptive market regimes, statistical arbitrage bots, iceberg order execution, programmatic bot REST APIs, HMAC-SHA256 authentication, token-bucket rate limiting, Python/JavaScript client SDKs, responsive mobile/tablet layout, workspace layout presets, granular audio synthesis sound board, multi-stage Docker containerization, GitHub Actions CI/CD, cryptographic scrypt user authentication with session management, Geometric Brownian Motion continuous price discovery, news impact decay with spike-and-settle digestion, Opening Auction call market mechanism at single uniform clearing price, 10-company multi-asset expansion across 6 sectors, dynamic simulation world news engine, and expanded 23-bot NPC trader fleet with scalper and news reactor archetypes) are migrated into production documentation upon verification.

---

## 1. Database and Persistence Infrastructure

### PostgreSQL Production Migration
- **Current State:** Zero-dependency SQLite implementation (`engine/sqlite-storage.js`) leveraging Node.js native `DatabaseSync` (`node:sqlite`).
- **Target State:** Managed PostgreSQL instance with connection pooling.
- **Migration Plan:**
  - Standardize schema DDL using an automated migration manager (such as Knex or Prisma).
  - Implement a pluggable database adapter interface (`DatabaseAdapter`) to allow seamless switching between SQLite for offline local testing and PostgreSQL for production staging and deployment.
  - Implement read-replicas for analytical queries (leaderboard calculations, historical candle queries) while directing write operations (order submissions and settlements) to the primary node.
  - Enforce strict ACID transaction isolation (`SERIALIZABLE` or `REPEATABLE READ`) for balance and position settlements.

### Redis In-Memory State & Pub/Sub
- Cache high-frequency order book depth and live ticker statistics.
- Use Redis Pub/Sub to decouple matching engine instances from WebSocket delivery nodes, enabling horizontal scalability across multiple server processes.

---

## 2. Production Deployment and Security

### Infrastructure & Cloud Hosting
- Cloud hosting deployment on managed platforms (e.g., Render, Railway, AWS ECS) with automated TLS/SSL certificate renewal.
- Edge caching and CDN reverse proxy configuration for static terminal assets.

### Authentication & Multi-Tenancy
- External identity providers: OAuth2 integration (GitHub, Google OAuth) to complement the native scrypt credentials and session security engine.
- Multi-factor authentication (TOTP/RFC 6238) for high-value tournament and margin accounts.

---

## 3. Quantitative Market Realism & Microstructure Simulation

### Correlated Price Movement Across Sectors (Cholesky Decomposition)
- **Problem:** Currently, each equity instrument undergoes independent stochastic price discovery. In real capital markets, asset returns exhibit strong cross-sectional correlation driven by macroeconomic factors (e.g., interest rate shifts, tech sector beta, clean energy subsidies).
- **Target Design:**
  - Define an empirical $N \times N$ correlation matrix $\mathbf{\Sigma}$ across all listed equities (e.g., BYTE $\leftrightarrow$ SOLR: $+0.35$, NBNK $\leftrightarrow$ AUTO: $-0.20$).
  - Compute the lower triangular Cholesky decomposition matrix $\mathbf{L}$ such that $\mathbf{\Sigma} = \mathbf{L} \mathbf{L}^T$.
  - At each simulation step, generate independent standard normal random variates $\mathbf{Z} \sim \mathcal{N}(\mathbf{0}, \mathbf{I})$ and transform them into correlated Wiener increments $\mathbf{dW} = \mathbf{L} \mathbf{Z} \sqrt{\Delta t}$.
  - Enable realistic market contagion, sector rotation, and synthetic pair cointegration dynamics.

### Order Book Imbalance (OBI) Signals for Market Making
- **Problem:** Market makers currently quote symmetric two-sided depth around fair value. Real market makers dynamically skew quote depth and bid-ask spreads in response to order book volume imbalances.
- **Target Design:**
  - Measure Level 2 Order Book Imbalance:
    $$OBI = \frac{V_{\text{bid}} - V_{\text{ask}}}{V_{\text{bid}} + V_{\text{ask}}}$$
    where $V_{\text{bid}}$ and $V_{\text{ask}}$ represent total resting volume across the top $K$ price levels.
  - Skew quoting intensity: when $OBI > 0.30$ (strong buying pressure), raise bid quotes and tighten ask prices; when $OBI < -0.30$ (heavy ask overhang), lower bids and widen asks to prevent adverse selection.
  - Introduce self-reinforcing short-term momentum and realistic liquidity withdrawal during directional imbalances.


