/**
 * Token Bucket Rate Limiter
 * Provides configurable burst and steady-state rate limiting per API key or IP address.
 */
export class TokenBucketRateLimiter {
  /**
   * @param {Object} options
   * @param {number} options.capacity Maximum burst capacity (tokens)
   * @param {number} options.refillRate Tokens added per second
   */
  constructor({ capacity = 60, refillRate = 10 } = {}) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.buckets = new Map(); // identifier -> { tokens, lastRefill }

    // Periodic cleanup of stale buckets every 5 minutes
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, bucket] of this.buckets.entries()) {
        if (now - bucket.lastRefill > 300000) {
          this.buckets.delete(id);
        }
      }
    }, 300000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  /**
   * Consume tokens for an identifier
   * @param {string} identifier Unique client ID (API key or IP)
   * @param {number} cost Tokens to consume (default 1)
   * @returns {{ allowed: boolean, limit: number, remaining: number, reset: number, retryAfter?: number }}
   */
  consume(identifier, cost = 1) {
    const now = Date.now();
    let bucket = this.buckets.get(identifier);

    if (!bucket) {
      bucket = {
        tokens: this.capacity,
        lastRefill: now
      };
      this.buckets.set(identifier, bucket);
    } else {
      // Refill tokens based on elapsed time
      const elapsedSec = (now - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + (elapsedSec * this.refillRate));
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      const remaining = Math.max(0, Math.floor(bucket.tokens));
      const reset = Math.ceil((this.capacity - bucket.tokens) / this.refillRate);
      return {
        allowed: true,
        limit: this.capacity,
        remaining,
        reset
      };
    } else {
      const needed = cost - bucket.tokens;
      const retryAfter = Math.max(1, Math.ceil(needed / this.refillRate));
      return {
        allowed: false,
        limit: this.capacity,
        remaining: 0,
        reset: retryAfter,
        retryAfter
      };
    }
  }

  /**
   * Reset rate limit bucket for an identifier (useful in testing)
   */
  reset(identifier) {
    this.buckets.delete(identifier);
  }

  /**
   * Returns Express middleware for automatic rate limiting
   */
  middleware() {
    return (req, res, next) => {
      const identifier = req.apiKey?.keyId || req.headers['x-api-key'] || req.ip || req.socket?.remoteAddress || 'unknown';
      const result = this.consume(identifier);

      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', result.reset);

      if (!result.allowed) {
        res.setHeader('Retry-After', result.retryAfter);
        return res.status(429).json({
          error: 'Rate limit exceeded. Too many requests.',
          retryAfter: result.retryAfter,
          limit: result.limit
        });
      }

      next();
    };
  }
}
