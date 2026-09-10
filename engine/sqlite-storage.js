import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'marketarena.sqlite');

/**
 * SQLite Storage Manager for MarketArena
 * Uses Node.js native DatabaseSync (node:sqlite) for zero-dependency persistence.
 * Relational schema prepared for easy migration to PostgreSQL in production.
 */
export class SQLiteStorageManager {
  constructor(customPath = null) {
    this.dbPath = customPath || DB_PATH;
    this._ensureDir();
    this.db = new DatabaseSync(this.dbPath);
    this._initSchema();
  }

  _ensureDir() {
    if (this.dbPath === ':memory:') return;
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  _initSchema() {
    // Enable foreign keys & WAL mode for fast concurrent operations
    if (this.dbPath !== ':memory:') {
      this.db.exec(`PRAGMA journal_mode = WAL;`);
    }
    this.db.exec(`PRAGMA foreign_keys = ON;`);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_npc INTEGER NOT NULL DEFAULT 0,
        initial_capital REAL NOT NULL,
        credits REAL NOT NULL,
        locked_credits REAL NOT NULL DEFAULT 0,
        realized_pnl REAL NOT NULL DEFAULT 0,
        trades_count INTEGER NOT NULL DEFAULT 0,
        volume_traded REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        margin_loan REAL NOT NULL DEFAULT 0,
        leverage INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS holdings (
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        avg_price REAL NOT NULL,
        locked_qty INTEGER NOT NULL DEFAULT 0,
        short_quantity INTEGER NOT NULL DEFAULT 0,
        short_avg_price REAL NOT NULL DEFAULT 0,
        locked_short_qty INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, symbol),
        FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS trade_history (
        entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        role TEXT NOT NULL,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        total_value REAL NOT NULL,
        realized_pnl REAL,
        counterparty TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS achievements (
        user_id TEXT NOT NULL,
        achievement_id TEXT NOT NULL,
        unlocked_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, achievement_id),
        FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_trade_history_user ON trade_history(user_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(user_id);
      CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);

      CREATE TABLE IF NOT EXISTS api_keys (
        key_id TEXT PRIMARY KEY,
        secret TEXT NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT,
        permissions TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

      CREATE TABLE IF NOT EXISTS user_credentials (
        user_id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_user_creds_username ON user_credentials(username);
      CREATE INDEX IF NOT EXISTS idx_user_creds_email ON user_credentials(email);

      CREATE TABLE IF NOT EXISTS user_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        csrf_token TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        is_revoked INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
    `);

    // Dynamic column migrations for backward compatibility
    try { this.db.exec(`ALTER TABLE accounts ADD COLUMN margin_loan REAL NOT NULL DEFAULT 0;`); } catch (_) {}
    try { this.db.exec(`ALTER TABLE accounts ADD COLUMN leverage INTEGER NOT NULL DEFAULT 1;`); } catch (_) {}
    try { this.db.exec(`ALTER TABLE holdings ADD COLUMN short_quantity INTEGER NOT NULL DEFAULT 0;`); } catch (_) {}
    try { this.db.exec(`ALTER TABLE holdings ADD COLUMN short_avg_price REAL NOT NULL DEFAULT 0;`); } catch (_) {}
    try { this.db.exec(`ALTER TABLE holdings ADD COLUMN locked_short_qty INTEGER NOT NULL DEFAULT 0;`); } catch (_) {}
  }

  /**
   * Load all human accounts from SQLite on server bootstrap
   * @returns {Array<Object>} List of reconstructed user account objects
   */
  loadAllAccounts() {
    try {
      const getAccountsStmt = this.db.prepare(`
        SELECT id, name, is_npc, initial_capital, credits, locked_credits, realized_pnl, trades_count, volume_traded, created_at,
               COALESCE(margin_loan, 0) as margin_loan,
               COALESCE(leverage, 1) as leverage
        FROM accounts WHERE is_npc = 0
      `);
      const getHoldingsStmt = this.db.prepare(`
        SELECT symbol, quantity, avg_price, locked_qty,
               COALESCE(short_quantity, 0) as short_quantity,
               COALESCE(short_avg_price, 0) as short_avg_price,
               COALESCE(locked_short_qty, 0) as locked_short_qty
        FROM holdings WHERE user_id = ?
      `);
      const getTradesStmt = this.db.prepare(`
        SELECT trade_id, symbol, side, role, price, quantity, total_value, realized_pnl, counterparty, timestamp
        FROM trade_history
        WHERE user_id = ?
        ORDER BY timestamp DESC
        LIMIT 100
      `);

      const accountRows = getAccountsStmt.all();
      const accountsList = [];

      for (const row of accountRows) {
        const holdingsMap = new Map();
        const holdingRows = getHoldingsStmt.all(row.id);
        for (const h of holdingRows) {
          holdingsMap.set(h.symbol, {
            quantity: h.quantity,
            avgPrice: h.avg_price,
            lockedQty: 0,
            shortQuantity: h.short_quantity || 0,
            shortAvgPrice: h.short_avg_price || 0,
            lockedShortQty: 0
          });
        }

        const tradeRows = getTradesStmt.all(row.id);
        const tradeHistory = tradeRows.map(t => ({
          id: t.trade_id,
          symbol: t.symbol,
          side: t.side,
          role: t.role,
          price: t.price,
          quantity: t.quantity,
          totalValue: t.total_value,
          realizedPnL: t.realized_pnl !== null ? t.realized_pnl : undefined,
          counterparty: t.counterparty,
          timestamp: t.timestamp
        }));

        const achievementsList = this.loadAchievements(row.id);

        accountsList.push({
          id: row.id,
          name: row.name,
          isNpc: false,
          initialCapital: row.initial_capital,
          credits: row.credits,
          lockedCredits: 0,
          marginLoan: row.margin_loan || 0,
          leverage: row.leverage || 1,
          holdings: holdingsMap,
          tradeHistory,
          achievements: new Set(achievementsList),
          realizedPnL: row.realized_pnl,
          tradesCount: row.trades_count,
          volumeTraded: row.volume_traded,
          createdAt: row.created_at
        });
      }

      return accountsList;
    } catch (err) {
      console.error('[SQLite] Error loading accounts:', err.message);
      return [];
    }
  }

  /**
   * Save or update an account and its holdings
   * @param {Object} account
   */
  saveAccount(account) {
    if (!account || account.isNpc) return; // Do not persist bots to SQLite

    try {
      const upsertAccount = this.db.prepare(`
        INSERT INTO accounts (id, name, is_npc, initial_capital, credits, locked_credits, realized_pnl, trades_count, volume_traded, created_at, margin_loan, leverage)
        VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          credits = excluded.credits,
          locked_credits = excluded.locked_credits,
          realized_pnl = excluded.realized_pnl,
          trades_count = excluded.trades_count,
          volume_traded = excluded.volume_traded,
          margin_loan = excluded.margin_loan,
          leverage = excluded.leverage
      `);

      upsertAccount.run(
        account.id,
        account.name,
        account.initialCapital,
        account.credits,
        account.lockedCredits || 0,
        account.realizedPnL || 0,
        account.tradesCount || 0,
        account.volumeTraded || 0,
        account.createdAt || Date.now(),
        account.marginLoan || 0,
        account.leverage || 1
      );

      // Update holdings
      const deleteHoldings = this.db.prepare(`DELETE FROM holdings WHERE user_id = ?`);
      deleteHoldings.run(account.id);

      const insertHolding = this.db.prepare(`
        INSERT INTO holdings (user_id, symbol, quantity, avg_price, locked_qty, short_quantity, short_avg_price, locked_short_qty)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const [symbol, h] of account.holdings.entries()) {
        if ((h.quantity && h.quantity > 0) || (h.shortQuantity && h.shortQuantity > 0)) {
          insertHolding.run(
            account.id,
            symbol,
            h.quantity || 0,
            h.avgPrice || 0,
            h.lockedQty || 0,
            h.shortQuantity || 0,
            h.shortAvgPrice || 0,
            h.lockedShortQty || 0
          );
        }
      }
    } catch (err) {
      console.error('[SQLite] Error saving account:', err.message);
    }
  }

  /**
   * Record a trade in the trade_history table
   * @param {string} userId
   * @param {Object} tradeItem
   */
  recordTrade(userId, tradeItem) {
    try {
      const insertTrade = this.db.prepare(`
        INSERT INTO trade_history (trade_id, user_id, symbol, side, role, price, quantity, total_value, realized_pnl, counterparty, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertTrade.run(
        tradeItem.id,
        userId,
        tradeItem.symbol,
        tradeItem.side,
        tradeItem.role,
        tradeItem.price,
        tradeItem.quantity,
        tradeItem.totalValue,
        tradeItem.realizedPnL !== undefined ? tradeItem.realizedPnL : null,
        tradeItem.counterparty || null,
        tradeItem.timestamp || Date.now()
      );
    } catch (err) {
      console.error('[SQLite] Error recording trade:', err.message);
    }
  }

  /**
   * Record an unlocked achievement
   * @param {string} userId
   * @param {string} achievementId
   * @param {number} [unlockedAt]
   */
  saveAchievement(userId, achievementId, unlockedAt = Date.now()) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO achievements (user_id, achievement_id, unlocked_at)
        VALUES (?, ?, ?)
      `);
      stmt.run(userId, achievementId, unlockedAt);
    } catch (err) {
      console.error('[SQLite] Error saving achievement:', err.message);
    }
  }

  /**
   * Load unlocked achievements for a user
   * @param {string} userId
   * @returns {Array<string>} list of achievement IDs
   */
  loadAchievements(userId) {
    try {
      const stmt = this.db.prepare(`
        SELECT achievement_id FROM achievements WHERE user_id = ?
      `);
      const rows = stmt.all(userId);
      return rows.map(r => r.achievement_id);
    } catch (err) {
      console.error('[SQLite] Error loading achievements:', err.message);
      return [];
    }
  }

  close() {
    try {
      this.db.close();
    } catch (err) {
      // Ignored
    }
  }

  /**
   * Persist API Key in SQLite
   */
  saveApiKey({ keyId, secret, userId, name, permissions, createdAt, active = 1 }) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO api_keys (key_id, secret, user_id, name, permissions, created_at, active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        keyId,
        secret,
        userId,
        name || 'API Key',
        Array.isArray(permissions) ? JSON.stringify(permissions) : permissions,
        createdAt || Date.now(),
        active ? 1 : 0
      );
    } catch (err) {
      console.error('[SQLite] Error saving API key:', err.message);
    }
  }

  /**
   * Get single API key record
   */
  getApiKey(keyId) {
    try {
      const stmt = this.db.prepare(`
        SELECT key_id as keyId, secret, user_id as userId, name, permissions, created_at as createdAt, active
        FROM api_keys WHERE key_id = ?
      `);
      const row = stmt.get(keyId);
      if (!row) return null;
      return {
        ...row,
        permissions: JSON.parse(row.permissions || '[]'),
        active: Boolean(row.active)
      };
    } catch (err) {
      console.error('[SQLite] Error getting API key:', err.message);
      return null;
    }
  }

  /**
   * Get all active API keys for a user
   */
  getUserApiKeys(userId) {
    try {
      const stmt = this.db.prepare(`
        SELECT key_id as keyId, secret, user_id as userId, name, permissions, created_at as createdAt, active
        FROM api_keys WHERE user_id = ? AND active = 1
        ORDER BY created_at DESC
      `);
      const rows = stmt.all(userId);
      return rows.map(row => ({
        ...row,
        permissions: JSON.parse(row.permissions || '[]'),
        active: Boolean(row.active)
      }));
    } catch (err) {
      console.error('[SQLite] Error getting user API keys:', err.message);
      return [];
    }
  }

  /**
   * Revoke/delete an API key
   */
  deleteApiKey(keyId) {
    try {
      const stmt = this.db.prepare(`UPDATE api_keys SET active = 0 WHERE key_id = ?`);
      stmt.run(keyId);
    } catch (err) {
      console.error('[SQLite] Error deleting API key:', err.message);
    }
  }

  /**
   * Save user credentials
   */
  saveUserCredentials({ userId, username, email, passwordHash, salt, createdAt }) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO user_credentials (user_id, username, email, password_hash, salt, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(userId, username, email, passwordHash, salt, createdAt);
    } catch (err) {
      console.error('[SQLite] Error saving user credentials:', err.message);
      throw err;
    }
  }

  /**
   * Get user credentials by username
   */
  getUserCredentialByUsername(username) {
    try {
      const stmt = this.db.prepare(`
        SELECT user_id as userId, username, email, password_hash as passwordHash, salt, created_at as createdAt
        FROM user_credentials WHERE username = ?
      `);
      return stmt.get(username) || null;
    } catch (err) {
      console.error('[SQLite] Error getting credentials by username:', err.message);
      return null;
    }
  }

  /**
   * Get user credentials by email
   */
  getUserCredentialByEmail(email) {
    try {
      const stmt = this.db.prepare(`
        SELECT user_id as userId, username, email, password_hash as passwordHash, salt, created_at as createdAt
        FROM user_credentials WHERE email = ?
      `);
      return stmt.get(email) || null;
    } catch (err) {
      console.error('[SQLite] Error getting credentials by email:', err.message);
      return null;
    }
  }

  /**
   * Get user credentials by user ID
   */
  getUserCredentialById(userId) {
    try {
      const stmt = this.db.prepare(`
        SELECT user_id as userId, username, email, password_hash as passwordHash, salt, created_at as createdAt
        FROM user_credentials WHERE user_id = ?
      `);
      return stmt.get(userId) || null;
    } catch (err) {
      console.error('[SQLite] Error getting credentials by ID:', err.message);
      return null;
    }
  }

  /**
   * Save user session
   */
  saveSession({ token, userId, csrfToken, createdAt, expiresAt, isRevoked }) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO user_sessions (token, user_id, csrf_token, created_at, expires_at, is_revoked)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(token, userId, csrfToken, createdAt, expiresAt, isRevoked ? 1 : 0);
    } catch (err) {
      console.error('[SQLite] Error saving session:', err.message);
      throw err;
    }
  }

  /**
   * Get session by token
   */
  getSession(token) {
    try {
      const stmt = this.db.prepare(`
        SELECT token, user_id as userId, csrf_token as csrfToken, created_at as createdAt, expires_at as expiresAt, is_revoked as isRevoked
        FROM user_sessions WHERE token = ?
      `);
      const row = stmt.get(token);
      if (!row) return null;
      return {
        ...row,
        isRevoked: Boolean(row.isRevoked)
      };
    } catch (err) {
      console.error('[SQLite] Error getting session:', err.message);
      return null;
    }
  }

  /**
   * Revoke an active session
   */
  revokeSession(token) {
    try {
      const stmt = this.db.prepare(`UPDATE user_sessions SET is_revoked = 1 WHERE token = ?`);
      const result = stmt.run(token);
      return result.changes > 0;
    } catch (err) {
      console.error('[SQLite] Error revoking session:', err.message);
      return false;
    }
  }

  /**
   * Revoke all active sessions for a user
   */
  revokeAllUserSessions(userId) {
    try {
      const stmt = this.db.prepare(`UPDATE user_sessions SET is_revoked = 1 WHERE user_id = ? AND is_revoked = 0`);
      const result = stmt.run(userId);
      return result.changes;
    } catch (err) {
      console.error('[SQLite] Error revoking user sessions:', err.message);
      return 0;
    }
  }
}

