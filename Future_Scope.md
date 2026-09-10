# MarketArena - Future Scope and Technical Roadmap

## Overview

This document outlines the architectural roadmap and deep feature queue for MarketArena as the platform progresses from its current local testing phase toward a public-facing, multi-tenant quantitative trading and market simulation platform.

Features completed in releases (e.g. SQLite persistence, achievements, multi-day rollover, stop-loss, stop-limit, trailing stops, OCO bracket orders, margin trading, short selling, multi-timeframe candles, institutional indicators, quantitative risk analytics, tournament mode, adaptive market regimes, statistical arbitrage bots, and iceberg order execution) are migrated into production documentation upon verification.

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

## 2. Programmatic Bot API and Developer SDK

### Public Trading API
- Provide a standardized RESTful API and WebSocket API allowing external developers to connect custom trading scripts directly to MarketArena.
- Endpoints:
  - `POST /api/v1/orders`: Submit limit, market, and stop orders.
  - `DELETE /api/v1/orders/:id`: Cancel resting orders.
  - `GET /api/v1/orderbook/:symbol`: Fetch current L2 depth.
  - `GET /api/v1/candles/:symbol`: Query historical OHLCV data.
  - `WS /ws/v1/stream`: Real-time streaming for ticker updates, order book changes, personal executions, and account events.

### API Security and Rate Limiting
- HMAC SHA-256 API key authentication with granular permissions (Read-Only vs. Trading).
- Token bucket rate limiting per IP and API key to prevent order book spam.

### Python and TypeScript Client SDKs
- Lightweight Python package (`marketarena-python`) enabling rapid algorithmic prototyping using pandas, numpy, and backtesting frameworks.

---

## 3. Frontend Terminal Modernization

### Responsive Layout
- Fully responsive mobile and tablet interface with touch-optimized order entry drawers.
- Dedicated mobile view featuring quick-swipe ticker navigation.

### Workspace Customization
- Modular, draggable dock panels allowing users to arrange order books, charts, tapes, and watchlists according to personal workflow preferences.
- Audio synthesis control panel allowing granular volume adjustment for fills, tape ticks, news alerts, and session bells.

---

## 4. Production Deployment and Security

### Infrastructure Configuration
- Docker containerization for matching engine, background workers, and web frontend.
- Continuous Integration and Deployment (CI/CD) pipelines running automated regression test suites.
- Cloud hosting on managed platforms (e.g., Render, Railway, AWS ECS) with automated TLS/SSL certificate renewal.

### Authentication & Multi-Tenancy
- User authentication via OAuth2 (GitHub, Google) and email/password with Argon2 password hashing.
- Session revocation and cross-site request forgery (CSRF) protection.
