import crypto from 'crypto';

/**
 * User Authentication, Cryptographic Password Hashing, and Session Security
 * Zero-dependency native Node.js implementation using crypto.scryptSync and timingSafeEqual
 */

const SCRYPT_KEYLEN = 64;
const SESSION_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export class AuthManager {
  /**
   * @param {import('./sqlite-storage.js').SQLiteStorageManager} storage
   */
  constructor(storage) {
    this.storage = storage;
  }

  /**
   * Hash password with unique salt using native scrypt
   * @param {string} password
   * @param {string} [existingSalt]
   * @returns {{ hash: string, salt: string }}
   */
  hashPassword(password, existingSalt = null) {
    const salt = existingSalt || crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
      N: 16384, // CPU/memory cost
      r: 8,     // Block size
      p: 1      // Parallelization
    });
    return {
      hash: derivedKey.toString('hex'),
      salt
    };
  }

  /**
   * Constant-time password verification preventing timing attacks
   * @param {string} password
   * @param {string} hash
   * @param {string} salt
   * @returns {boolean}
   */
  verifyPassword(password, hash, salt) {
    if (!password || !hash || !salt) return false;
    const { hash: computedHash } = this.hashPassword(password, salt);
    const hashBuf = Buffer.from(hash, 'hex');
    const compBuf = Buffer.from(computedHash, 'hex');
    if (hashBuf.length !== compBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, compBuf);
  }

  /**
   * Register a new user with credentials
   * @param {string} username
   * @param {string} email
   * @param {string} password
   * @returns {{ success: boolean, user?: object, session?: object, error?: string }}
   */
  register(username, email, password) {
    const cleanUsername = (username || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 30) {
      return { success: false, error: 'Username must be between 3 and 30 characters' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return { success: false, error: 'Valid email address is required' };
    }

    if (!password || password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters long' };
    }

    // Check duplicate username or email
    const existingUser = this.storage.getUserCredentialByUsername(cleanUsername);
    if (existingUser) {
      return { success: false, error: 'Username is already registered' };
    }

    const existingEmail = this.storage.getUserCredentialByEmail(cleanEmail);
    if (existingEmail) {
      return { success: false, error: 'Email address is already registered' };
    }

    const userId = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const { hash, salt } = this.hashPassword(password);
    const createdAt = Date.now();

    this.storage.saveUserCredentials({
      userId,
      username: cleanUsername,
      email: cleanEmail,
      passwordHash: hash,
      salt,
      createdAt
    });

    const session = this.createSession(userId);

    return {
      success: true,
      user: {
        id: userId,
        username: cleanUsername,
        email: cleanEmail,
        createdAt
      },
      session
    };
  }

  /**
   * Authenticate user with username/email and password
   * @param {string} identifier (username or email)
   * @param {string} password
   * @returns {{ success: boolean, user?: object, session?: object, error?: string }}
   */
  login(identifier, password) {
    const cleanId = (identifier || '').trim();
    if (!cleanId || !password) {
      return { success: false, error: 'Username/email and password are required' };
    }

    let creds = this.storage.getUserCredentialByUsername(cleanId);
    if (!creds) {
      creds = this.storage.getUserCredentialByEmail(cleanId.toLowerCase());
    }

    if (!creds) {
      return { success: false, error: 'Invalid username/email or password' };
    }

    const valid = this.verifyPassword(password, creds.passwordHash, creds.salt);
    if (!valid) {
      return { success: false, error: 'Invalid username/email or password' };
    }

    const session = this.createSession(creds.userId);

    return {
      success: true,
      user: {
        id: creds.userId,
        username: creds.username,
        email: creds.email,
        createdAt: creds.createdAt
      },
      session
    };
  }

  /**
   * Create an active user session with CSRF protection token
   * @param {string} userId
   * @returns {{ token: string, csrfToken: string, expiresAt: number }}
   */
  createSession(userId) {
    const token = `masess_${crypto.randomBytes(32).toString('hex')}`;
    const csrfToken = `macsrf_${crypto.randomBytes(24).toString('hex')}`;
    const now = Date.now();
    const expiresAt = now + SESSION_EXPIRATION_MS;

    this.storage.saveSession({
      token,
      userId,
      csrfToken,
      createdAt: now,
      expiresAt,
      isRevoked: 0
    });

    return {
      token,
      csrfToken,
      expiresAt
    };
  }

  /**
   * Validate session token and return associated user
   * @param {string} token
   * @returns {{ valid: boolean, userId?: string, csrfToken?: string, error?: string }}
   */
  validateSession(token) {
    if (!token) return { valid: false, error: 'Session token required' };

    const session = this.storage.getSession(token);
    if (!session) {
      return { valid: false, error: 'Invalid session token' };
    }

    if (session.isRevoked) {
      return { valid: false, error: 'Session has been revoked' };
    }

    if (Date.now() > session.expiresAt) {
      return { valid: false, error: 'Session has expired' };
    }

    return {
      valid: true,
      userId: session.userId,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt
    };
  }

  /**
   * Revoke a single active session
   * @param {string} token
   * @returns {boolean}
   */
  revokeSession(token) {
    return this.storage.revokeSession(token);
  }

  /**
   * Revoke all sessions for a user
   * @param {string} userId
   * @returns {number} count of revoked sessions
   */
  revokeAllUserSessions(userId) {
    return this.storage.revokeAllUserSessions(userId);
  }

  /**
   * Express middleware for session authentication
   */
  requireSession() {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;
      let token = null;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      } else if (req.headers['x-session-token']) {
        token = req.headers['x-session-token'];
      }

      if (!token) {
        return res.status(401).json({ error: 'Unauthorized: Session token missing' });
      }

      const validation = this.validateSession(token);
      if (!validation.valid) {
        return res.status(401).json({ error: `Unauthorized: ${validation.error}` });
      }

      req.userId = validation.userId;
      req.sessionToken = token;
      req.csrfToken = validation.csrfToken;
      next();
    };
  }

  /**
   * Express middleware for CSRF token validation on state-mutating requests
   */
  requireCsrf() {
    return (req, res, next) => {
      if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        return next();
      }

      const clientCsrf = req.headers['x-csrf-token'] || req.body?._csrf;
      if (!clientCsrf || clientCsrf !== req.csrfToken) {
        return res.status(403).json({ error: 'Forbidden: Invalid or missing CSRF token' });
      }

      next();
    };
  }
}
