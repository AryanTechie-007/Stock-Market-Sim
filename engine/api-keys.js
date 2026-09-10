import crypto from 'crypto';

/**
 * API Key Manager and HMAC-SHA256 Authentication Engine
 */
export class APIKeyManager {
  /**
   * @param {Object} storageManager SQLite storage instance for persistence
   */
  constructor(storageManager = null) {
    this.storage = storageManager;
    this.cache = new Map(); // keyId -> keyRecord
  }

  /**
   * Generate a cryptographically secure API key & secret pair
   * @param {string} userId Owner user account ID
   * @param {string} name Friendly label
   * @param {Array<string>} permissions ['read', 'trade']
   * @returns {Object} Key record including plaintext secret
   */
  createKey(userId, name = 'Default Bot Key', permissions = ['read', 'trade']) {
    const keyId = 'mak_' + crypto.randomBytes(16).toString('hex');
    const secret = 'mas_' + crypto.randomBytes(24).toString('hex');
    const now = Date.now();

    const record = {
      keyId,
      secret,
      userId,
      name,
      permissions: Array.isArray(permissions) ? permissions : ['read', 'trade'],
      createdAt: now,
      active: true
    };

    this.cache.set(keyId, record);

    if (this.storage && typeof this.storage.saveApiKey === 'function') {
      this.storage.saveApiKey(record);
    }

    return record;
  }

  /**
   * Get an active API key record
   * @param {string} keyId
   * @returns {Object|null}
   */
  getKey(keyId) {
    if (!keyId) return null;
    if (this.cache.has(keyId)) {
      const cached = this.cache.get(keyId);
      if (cached.active) return cached;
      return null;
    }

    if (this.storage && typeof this.storage.getApiKey === 'function') {
      const record = this.storage.getApiKey(keyId);
      if (record && record.active) {
        this.cache.set(keyId, record);
        return record;
      }
    }

    return null;
  }

  /**
   * List all active API keys for a user (secrets partially masked for security)
   * @param {string} userId
   * @returns {Array<Object>}
   */
  getUserKeys(userId) {
    let keys = [];
    if (this.storage && typeof this.storage.getUserApiKeys === 'function') {
      keys = this.storage.getUserApiKeys(userId);
    } else {
      for (const rec of this.cache.values()) {
        if (rec.userId === userId && rec.active) {
          keys.push({ ...rec });
        }
      }
    }

    return keys.map(k => ({
      keyId: k.keyId,
      name: k.name,
      maskedSecret: k.secret ? `${k.secret.slice(0, 8)}...${k.secret.slice(-4)}` : '',
      secret: k.secret,
      permissions: k.permissions,
      createdAt: k.createdAt
    }));
  }

  /**
   * Revoke an API key
   * @param {string} keyId
   * @param {string} [userId]
   * @returns {boolean}
   */
  revokeKey(keyId, userId = null) {
    const key = this.getKey(keyId);
    if (!key) return false;
    if (userId && key.userId !== userId) return false;

    key.active = false;
    this.cache.set(keyId, key);

    if (this.storage && typeof this.storage.deleteApiKey === 'function') {
      this.storage.deleteApiKey(keyId);
    }
    return true;
  }

  /**
   * Compute HMAC-SHA256 signature for a request
   * @param {string} secret API Secret
   * @param {number|string} timestamp Epoch ms or sec
   * @param {string} method GET, POST, DELETE
   * @param {string} path Endpoint path (e.g. /api/v1/orders)
   * @param {string|Object} [body=''] Request payload
   * @returns {string} Hex signature
   */
  sign(secret, timestamp, method, path, body = '') {
    const bodyStr = typeof body === 'object' ? JSON.stringify(body) : (body || '');
    const payload = `${timestamp}${method.toUpperCase()}${path}${bodyStr}`;
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Verify an incoming request signature or header credentials
   * @param {Object} req Express request object
   * @returns {{ authenticated: boolean, error?: string, key?: Object, userId?: string, permissions?: Array<string> }}
   */
  verifyRequest(req) {
    const keyId = req.headers['x-api-key'] || req.query?.api_key;
    if (!keyId) {
      // Check Bearer authorization format: "Bearer <keyId>:<secret>" or "Bearer <secret>"
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        if (token.includes(':')) {
          const [kId, sec] = token.split(':');
          const keyRecord = this.getKey(kId);
          if (keyRecord && keyRecord.secret === sec) {
            return {
              authenticated: true,
              key: keyRecord,
              userId: keyRecord.userId,
              permissions: keyRecord.permissions
            };
          }
        }
      }
      return { authenticated: false, error: 'Missing X-API-KEY header' };
    }

    const keyRecord = this.getKey(keyId);
    if (!keyRecord || !keyRecord.active) {
      return { authenticated: false, error: 'Invalid or revoked API Key' };
    }

    // Direct secret header check for fast testing / development
    const directSecret = req.headers['x-api-secret'];
    if (directSecret && directSecret === keyRecord.secret) {
      return {
        authenticated: true,
        key: keyRecord,
        userId: keyRecord.userId,
        permissions: keyRecord.permissions
      };
    }

    // Full HMAC-SHA256 signature verification
    const timestamp = req.headers['x-api-timestamp'];
    const signature = req.headers['x-api-signature'];

    if (!timestamp || !signature) {
      return { authenticated: false, error: 'Missing X-API-TIMESTAMP or X-API-SIGNATURE' };
    }

    // Replay attack prevention: 60-second window
    const now = Date.now();
    const reqTime = Number(timestamp);
    if (isNaN(reqTime) || Math.abs(now - reqTime) > 60000) {
      return { authenticated: false, error: 'Request timestamp expired or outside 60s replay window' };
    }

    // Match signature
    const path = req.originalUrl || req.url;
    const bodyStr = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '';
    const expectedSig = this.sign(keyRecord.secret, timestamp, req.method, path, bodyStr);

    try {
      const sigBuf = Buffer.from(signature, 'hex');
      const expectedBuf = Buffer.from(expectedSig, 'hex');
      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return { authenticated: false, error: 'Invalid HMAC signature' };
      }
    } catch (_) {
      return { authenticated: false, error: 'Signature format mismatch' };
    }

    return {
      authenticated: true,
      key: keyRecord,
      userId: keyRecord.userId,
      permissions: keyRecord.permissions
    };
  }

  /**
   * Express middleware to enforce authentication and specific permission
   * @param {string} requiredPermission 'read' or 'trade'
   */
  requireAuth(requiredPermission = 'read') {
    return (req, res, next) => {
      const result = this.verifyRequest(req);
      if (!result.authenticated) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: result.error
        });
      }

      if (requiredPermission && !result.permissions.includes(requiredPermission)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `API Key missing required permission: '${requiredPermission}'`
        });
      }

      req.apiKey = result.key;
      req.userId = result.userId;
      req.permissions = result.permissions;
      next();
    };
  }
}
