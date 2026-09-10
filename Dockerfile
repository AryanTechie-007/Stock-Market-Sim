# Multi-stage production container build for MarketArena
FROM node:22-alpine AS base
WORKDIR /app

# Stage 1: Install production dependencies
FROM base AS dependencies
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Final minimal production runtime
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root system group and user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 marketarena -G nodejs

# Copy installed production node_modules from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./

# Copy core engine, trading modules, public terminal assets, and SDKs
COPY engine ./engine
COPY traders ./traders
COPY public ./public
COPY sdk ./sdk
COPY server.js ./

# Create data directory with proper ownership for SQLite persistence
RUN mkdir -p /app/data && chown -R marketarena:nodejs /app

USER marketarena

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/ping || exit 1

CMD ["npm", "start"]
