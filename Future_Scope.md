# MarketArena - Future Scope and Technical Roadmap

## Overview

This document outlines the architectural roadmap and deep feature queue for MarketArena as the platform progresses from its current local testing phase toward a public-facing, multi-tenant quantitative trading and market simulation platform.

Features completed in releases (e.g. SQLite persistence, achievements, multi-day rollover, stop-loss, stop-limit, trailing stops, OCO bracket orders, margin trading, short selling, multi-timeframe candles, institutional indicators, quantitative risk analytics, tournament mode, adaptive market regimes, statistical arbitrage bots, iceberg order execution, programmatic bot REST APIs, HMAC-SHA256 authentication, token-bucket rate limiting, Python/JavaScript client SDKs, responsive mobile/tablet layout, workspace layout presets, and granular audio synthesis sound board) are migrated into production documentation upon verification.

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

### Infrastructure Configuration
- Docker containerization for matching engine, background workers, and web frontend.
- Continuous Integration and Deployment (CI/CD) pipelines running automated regression test suites.
- Cloud hosting on managed platforms (e.g., Render, Railway, AWS ECS) with automated TLS/SSL certificate renewal.

### Authentication & Multi-Tenancy
- User authentication via OAuth2 (GitHub, Google) and email/password with Argon2 password hashing.
- Session revocation and cross-site request forgery (CSRF) protection.
