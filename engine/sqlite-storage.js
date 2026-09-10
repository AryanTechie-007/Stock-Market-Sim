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
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS holdings (
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        avg_price REAL NOT NULL,
        locked_qty INTEGER NOT NULL DEFAULT 0,
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
    `);
  }

  /**
   * Load all human accounts from SQLite on server bootstrap
   * @returns {Array<Object>} List of reconstructed user account objects
   */
  loadAllAccounts() {
    try {
      const getAccountsStmt = this.db.prepare(`
        SELECT * FROM accounts WHERE is_npc = 0
      `);
      const getHoldingsStmt = this.db.prepare(`
        SELECT symbol, quantity, avg_price, locked_qty FROM holdings WHERE user_id = ?
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
            lockedQty: 0 // Reset locked qty on reboot
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
          lockedCredits: 0, // Reset locked credits on reboot
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
        INSERT INTO accounts (id, name, is_npc, initial_capital, credits, locked_credits, realized_pnl, trades_count, volume_traded, created_at)
        VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          credits = excluded.credits,
          locked_credits = excluded.locked_credits,
          realized_pnl = excluded.realized_pnl,
          trades_count = excluded.trades_count,
          volume_traded = excluded.volume_traded
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
        account.createdAt || Date.now()
      );

      // Update holdings
      const deleteHoldings = this.db.prepare(`DELETE FROM holdings WHERE user_id = ?`);
      deleteHoldings.run(account.id);

      const insertHolding = this.db.prepare(`
        INSERT INTO holdings (user_id, symbol, quantity, avg_price, locked_qty)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const [symbol, h] of account.holdings.entries()) {
        if (h.quantity > 0) {
          insertHolding.run(account.id, symbol, h.quantity, h.avgPrice, h.lockedQty || 0);
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
}
