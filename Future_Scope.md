# MarketArena - Future Scope and Technical Roadmap

## Overview

This document outlines the architectural roadmap and deep feature queue for MarketArena as the platform progresses from its current local testing phase toward a public-facing, multi-tenant quantitative trading and market simulation platform.

Features completed in releases (e.g. SQLite persistence, achievements, multi-day rollover, stop-loss, stop-limit, trailing stops, OCO bracket orders, margin trading, short selling, multi-timeframe candles, institutional indicators, quantitative risk analytics, tournament mode, adaptive market regimes, statistical arbitrage bots, iceberg order execution, programmatic bot REST APIs, HMAC-SHA256 authentication, token-bucket rate limiting, Python/JavaScript client SDKs, responsive mobile/tablet layout, workspace layout presets, granular audio synthesis sound board, multi-stage Docker containerization, GitHub Actions CI/CD, and cryptographic scrypt user authentication with session management and CSRF protection) are migrated into production documentation upon verification.

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

