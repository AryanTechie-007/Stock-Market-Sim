import assert from 'assert';
import { APIKeyManager } from '../engine/api-keys.js';
import { TokenBucketRateLimiter } from '../engine/rate-limiter.js';
import { SQLiteStorageManager } from '../engine/sqlite-storage.js';

console.log('[TEST] Starting API Security & Rate Limiting Test Suite...\n');

const storage = new SQLiteStorageManager(':memory:');
const keyManager = new APIKeyManager(storage);

// Test 1: API Key Generation and Persistence
console.log('Test 1: Key Generation and SQLite Persistence');
const key1 = keyManager.createKey('usr_dev_1', 'Quant Bot Alpha', ['read', 'trade']);
assert(key1.keyId.startsWith('mak_'), 'Key ID should have mak_ prefix');
assert(key1.secret.startsWith('mas_'), 'Secret should have mas_ prefix');
assert.strictEqual(key1.userId, 'usr_dev_1');
assert.deepStrictEqual(key1.permissions, ['read', 'trade']);

const retrieved = keyManager.getKey(key1.keyId);
assert(retrieved, 'Should retrieve key from manager');
assert.strictEqual(retrieved.secret, key1.secret);

// SQLite reload test
const freshManager = new APIKeyManager(storage);
const fromDb = freshManager.getKey(key1.keyId);
assert(fromDb, 'Should load persisted API key from SQLite');
assert.strictEqual(fromDb.userId, 'usr_dev_1');
console.log('[PASS] API Key generated, signed, and persisted into SQLite relational tables\n');

// Test 2: HMAC-SHA256 Request Verification
console.log('Test 2: HMAC-SHA256 Request Signature Verification');
const now = Date.now();
const method = 'POST';
const path = '/api/v1/orders';
const body = { symbol: 'BYTE', side: 'BUY', quantity: 10, price: 50.0 };

const signature = keyManager.sign(key1.secret, now, method, path, body);

// Mock valid request
const mockReq = {
  method,
  originalUrl: path,
  headers: {
    'x-api-key': key1.keyId,
    'x-api-timestamp': now.toString(),
    'x-api-signature': signature
  },
  body
};

const authResult = keyManager.verifyRequest(mockReq);
assert(authResult.authenticated, `Should authenticate valid request. Error: ${authResult.error}`);
assert.strictEqual(authResult.userId, 'usr_dev_1');
console.log('[PASS] Valid HMAC-SHA256 signature authenticated successfully\n');

// Test 3: Tampering & Replay Protection
console.log('Test 3: Signature Tampering & Replay Attack Defense');
// Tamper with body
const tamperedReq = {
  method,
  originalUrl: path,
  headers: {
    'x-api-key': key1.keyId,
    'x-api-timestamp': now.toString(),
    'x-api-signature': signature
  },
  body: { ...body, quantity: 100 } // Tampered!
};
const tamperedResult = keyManager.verifyRequest(tamperedReq);
assert(!tamperedResult.authenticated, 'Tampered body must fail verification');

// Replay attack with expired timestamp (outside 60s)
const expiredReq = {
  method,
  originalUrl: path,
  headers: {
    'x-api-key': key1.keyId,
    'x-api-timestamp': (now - 70000).toString(),
    'x-api-signature': signature
  },
  body
};
const expiredResult = keyManager.verifyRequest(expiredReq);
assert(!expiredResult.authenticated, 'Expired timestamp must be rejected');
console.log('[PASS] Tampered payloads and expired timestamps rejected securely\n');

// Test 4: Permissions Enforcement
console.log('Test 4: Granular Permissions (Read-Only vs. Trading)');
const readOnlyKey = keyManager.createKey('usr_analyst_1', 'Analyst Key', ['read']);
const readReq = {
  method: 'GET',
  originalUrl: '/api/v1/account',
  headers: {
    'x-api-key': readOnlyKey.keyId,
    'x-api-secret': readOnlyKey.secret
  }
};
const readAuth = keyManager.verifyRequest(readReq);
assert(readAuth.authenticated, 'Read-only key should authenticate');
assert(readAuth.permissions.includes('read'), 'Should have read permission');
assert(!readAuth.permissions.includes('trade'), 'Should NOT have trade permission');
console.log('[PASS] Permission scopes accurately partitioned\n');

// Test 5: Token Bucket Rate Limiting
console.log('Test 5: Token Bucket Rate Limiting');
const limiter = new TokenBucketRateLimiter({ capacity: 5, refillRate: 2 });
const clientId = 'client_test_ip';

// Consume all 5 tokens
for (let i = 0; i < 5; i++) {
  const res = limiter.consume(clientId);
  assert(res.allowed, `Request ${i + 1} should be allowed`);
}

// 6th request should be rate-limited (HTTP 429)
const blocked = limiter.consume(clientId);
assert(!blocked.allowed, '6th request must be blocked');
assert.strictEqual(blocked.remaining, 0);
assert(blocked.retryAfter > 0, 'Retry-after must be positive');
console.log('[PASS] Token bucket rate limiter enforced burst limits and 429 exhaustion\n');

console.log('[SUCCESS] ALL API SECURITY & RATE LIMITING TESTS PASSED!\n');
process.exit(0);
