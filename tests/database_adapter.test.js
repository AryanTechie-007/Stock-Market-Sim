import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseAdapter, SQLiteAdapter, PostgresAdapter, createDatabaseAdapter } from '../engine/database-adapter.js';

test('1. Database adapter interface compliance and factory selection', () => {
  const sqliteAdapter = createDatabaseAdapter({ type: 'sqlite', sqlitePath: ':memory:' });
  assert.ok(sqliteAdapter instanceof DatabaseAdapter);
  assert.equal(sqliteAdapter.type, 'sqlite');

  const pgAdapter = createDatabaseAdapter({ type: 'postgres' });
  assert.ok(pgAdapter instanceof DatabaseAdapter);
  assert.equal(pgAdapter.type, 'postgres');

  // Verify all required methods exist on both instances
  const requiredMethods = [
    'initialize', 'close', 'loadAllAccounts', 'saveAccount', 'recordTrade',
    'saveAchievement', 'loadAchievements', 'saveApiKey', 'getApiKey',
    'getUserApiKeys', 'deleteApiKey', 'saveUserCredentials',
    'getUserCredentialByUsername', 'getUserCredentialByEmail', 'getUserCredentialById',
    'saveSession', 'getSession', 'revokeSession', 'revokeAllUserSessions'
  ];

  for (const method of requiredMethods) {
    assert.equal(typeof sqliteAdapter[method], 'function', `SQLiteAdapter missing ${method}`);
    assert.equal(typeof pgAdapter[method], 'function', `PostgresAdapter missing ${method}`);
  }

  sqliteAdapter.close();
});

test('2. PostgreSQL schema DDL and parameterized placeholder translation', () => {
  const pgAdapter = new PostgresAdapter();

  // Test SQL placeholder conversion (? -> $1, $2, ...)
  const sqliteSql = 'SELECT * FROM trade_history WHERE user_id = ? AND symbol = ? ORDER BY timestamp DESC LIMIT ?;';
  const pgSql = pgAdapter.translatePlaceholders(sqliteSql);
  assert.equal(pgSql, 'SELECT * FROM trade_history WHERE user_id = $1 AND symbol = $2 ORDER BY timestamp DESC LIMIT $3;');

  // Test PostgreSQL DDL generation
  const ddl = pgAdapter.schemaDDL;
  assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS accounts'));
  assert.ok(ddl.includes('NUMERIC(16, 2)'));
  assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS holdings'));
  assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS trade_history'));
  assert.ok(ddl.includes('BIGSERIAL PRIMARY KEY'));
  assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS user_credentials'));
  assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS user_sessions'));
  assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS api_keys'));
});

test('3. SQLiteAdapter full lifecycle CRUD operations', () => {
  const db = new SQLiteAdapter(':memory:');

  // 1. Save and load account
  const testAccount = {
    id: 'usr_sqlite_test_1',
    name: 'SQLite Test Trader',
    isNpc: false,
    initialCapital: 100000,
    credits: 95000,
    lockedCredits: 5000,
    realizedPnL: 1200,
    tradesCount: 4,
    volumeTraded: 45000,
    marginLoan: 2500,
    leverage: 2,
    holdings: new Map([
      ['AUTO', { quantity: 100, avgPrice: 450, lockedQty: 0, shortQuantity: 0, shortAvgPrice: 0, lockedShortQty: 0 }]
    ])
  };

  db.saveAccount(testAccount);
  const loadedAccounts = db.loadAllAccounts();
  assert.equal(loadedAccounts.length, 1);
  assert.equal(loadedAccounts[0].id, 'usr_sqlite_test_1');
  assert.equal(loadedAccounts[0].credits, 95000);
  assert.equal(loadedAccounts[0].marginLoan, 2500);
  assert.equal(loadedAccounts[0].leverage, 2);
  assert.equal(loadedAccounts[0].holdings.get('AUTO').quantity, 100);

  // 2. Record trade
  db.recordTrade('usr_sqlite_test_1', {
    id: 'tr_101',
    symbol: 'AUTO',
    side: 'BUY',
    role: 'TAKER',
    price: 450,
    quantity: 100,
    totalValue: 45000,
    realizedPnL: null,
    counterparty: 'MarketMaker'
  });

  // 3. Achievements
  db.saveAchievement('usr_sqlite_test_1', 'FIRST_TRADE');
  const achievements = db.loadAchievements('usr_sqlite_test_1');
  assert.deepEqual(achievements, ['FIRST_TRADE']);

  // 4. API Keys
  db.saveApiKey({
    keyId: 'mak_sqlite_key_1',
    secret: 'secret_hash_abc',
    userId: 'usr_sqlite_test_1',
    name: 'Bot Key',
    permissions: ['read', 'trade']
  });

  const keyRecord = db.getApiKey('mak_sqlite_key_1');
  assert.ok(keyRecord);
  assert.equal(keyRecord.name, 'Bot Key');
  assert.deepEqual(keyRecord.permissions, ['read', 'trade']);

  const userKeys = db.getUserApiKeys('usr_sqlite_test_1');
  assert.equal(userKeys.length, 1);

  db.deleteApiKey('mak_sqlite_key_1');
  const activeKeys = db.getUserApiKeys('usr_sqlite_test_1');
  assert.equal(activeKeys.length, 0);

  // 5. User Credentials
  db.saveUserCredentials({
    userId: 'usr_sqlite_test_1',
    username: 'sqlitetrader',
    email: 'sqlitetrader@example.com',
    passwordHash: 'hashedpassword123',
    salt: 'randomsalt123',
    createdAt: Date.now()
  });

  const credByUsername = db.getUserCredentialByUsername('sqlitetrader');
  assert.ok(credByUsername);
  assert.equal(credByUsername.email, 'sqlitetrader@example.com');

  const credByEmail = db.getUserCredentialByEmail('sqlitetrader@example.com');
  assert.ok(credByEmail);
  assert.equal(credByEmail.userId, 'usr_sqlite_test_1');

  // 6. User Sessions
  db.saveSession({
    token: 'masess_sqlite_token_1',
    userId: 'usr_sqlite_test_1',
    csrfToken: 'macsrf_1',
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
    isRevoked: false
  });

  const session = db.getSession('masess_sqlite_token_1');
  assert.ok(session);
  assert.equal(session.userId, 'usr_sqlite_test_1');
  assert.equal(session.isRevoked, false);

  db.revokeSession('masess_sqlite_token_1');
  assert.equal(db.getSession('masess_sqlite_token_1').isRevoked, true);

  db.close();
});

test('4. PostgresAdapter full lifecycle CRUD operations and relational constraints', () => {
  const db = new PostgresAdapter();

  // 1. Save and load account
  const testAccount = {
    id: 'usr_pg_test_1',
    name: 'Postgres Test Trader',
    isNpc: false,
    initialCapital: 100000,
    credits: 92000,
    lockedCredits: 8000,
    realizedPnL: 3400,
    tradesCount: 12,
    volumeTraded: 120000,
    marginLoan: 15000,
    leverage: 3,
    holdings: new Map([
      ['BYTE', { quantity: 50, avgPrice: 1200, lockedQty: 0, shortQuantity: 0, shortAvgPrice: 0, lockedShortQty: 0 }],
      ['SOLR', { quantity: 0, avgPrice: 0, lockedQty: 0, shortQuantity: 100, shortAvgPrice: 280, lockedShortQty: 0 }]
    ])
  };

  db.saveAccount(testAccount);
  const loadedAccounts = db.loadAllAccounts();
  assert.equal(loadedAccounts.length, 1);
  assert.equal(loadedAccounts[0].id, 'usr_pg_test_1');
  assert.equal(loadedAccounts[0].marginLoan, 15000);
  assert.equal(loadedAccounts[0].leverage, 3);
  assert.equal(loadedAccounts[0].holdings.get('BYTE').quantity, 50);
  assert.equal(loadedAccounts[0].holdings.get('SOLR').shortQuantity, 100);

  // 2. Record trade
  db.recordTrade('usr_pg_test_1', {
    id: 'tr_pg_101',
    symbol: 'BYTE',
    side: 'BUY',
    role: 'TAKER',
    price: 1200,
    quantity: 50,
    totalValue: 60000,
    realizedPnL: 500,
    counterparty: 'LiquidityProvider'
  });

  // 3. Achievements
  db.saveAchievement('usr_pg_test_1', 'MARGIN_TRADER');
  assert.deepEqual(db.loadAchievements('usr_pg_test_1'), ['MARGIN_TRADER']);

  // 4. API Keys
  db.saveApiKey({
    keyId: 'mak_pg_key_1',
    secret: 'pg_secret_hash_xyz',
    userId: 'usr_pg_test_1',
    name: 'PG Bot',
    permissions: ['read', 'trade'],
    createdAt: Date.now(),
    active: true
  });

  const key = db.getApiKey('mak_pg_key_1');
  assert.ok(key);
  assert.equal(key.name, 'PG Bot');
  assert.equal(db.getUserApiKeys('usr_pg_test_1').length, 1);

  db.deleteApiKey('mak_pg_key_1');
  assert.equal(db.getUserApiKeys('usr_pg_test_1').length, 0);

  // 5. User Credentials & Unique Constraint Violation
  db.saveUserCredentials({
    userId: 'usr_pg_test_1',
    username: 'pgtrader',
    email: 'pgtrader@marketarena.io',
    passwordHash: 'scrypt_pg_hash',
    salt: 'salt_pg',
    createdAt: Date.now()
  });

  const cred = db.getUserCredentialByUsername('pgtrader');
  assert.ok(cred);
  assert.equal(cred.email, 'pgtrader@marketarena.io');

  // Verify duplicate prevention with PostgreSQL 23505 code
  assert.throws(() => {
    db.saveUserCredentials({
      userId: 'usr_pg_test_2',
      username: 'pgtrader', // Duplicate username
      email: 'other@marketarena.io',
      passwordHash: 'hash',
      salt: 'salt',
      createdAt: Date.now()
    });
  }, (err) => err.code === '23505');

  // 6. User Sessions
  db.saveSession({
    token: 'masess_pg_token_1',
    userId: 'usr_pg_test_1',
    csrfToken: 'macsrf_pg_1',
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
    isRevoked: false
  });

  const sess = db.getSession('masess_pg_token_1');
  assert.ok(sess);
  assert.equal(sess.isRevoked, false);

  const revokedCount = db.revokeAllUserSessions('usr_pg_test_1');
  assert.equal(revokedCount, 1);
  assert.equal(db.getSession('masess_pg_token_1').isRevoked, true);
});

test('5. REST API endpoint /api/v1/database/status', async () => {
  const baseUrl = 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/v1/database/status`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.type === 'sqlite' || data.type === 'postgres');
  assert.equal(data.ready, true);
  assert.equal(typeof data.timestamp, 'number');
});
