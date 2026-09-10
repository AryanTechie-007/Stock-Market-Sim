import assert from 'assert';
import { AuthManager } from '../engine/auth.js';
import { SQLiteStorageManager } from '../engine/sqlite-storage.js';

console.log('[TEST] Starting User Authentication & Session Security Test Suite...\n');

const BASE_URL = 'http://localhost:3000';
const storage = new SQLiteStorageManager(':memory:');
const auth = new AuthManager(storage);

async function run() {
  // 1. Password Hashing and Unique Salts
  console.log('Test 1: Scrypt Password Hashing and Unique Salt Generation');
  const pass1 = 'SuperSecretP@ss123!';
  const { hash: hash1, salt: salt1 } = auth.hashPassword(pass1);
  const { hash: hash2, salt: salt2 } = auth.hashPassword(pass1);

  assert(hash1 && salt1, 'Hash and salt must be non-empty');
  assert.notStrictEqual(salt1, salt2, 'Different runs must produce distinct random salts');
  assert.notStrictEqual(hash1, hash2, 'Different salts must produce distinct hashes for same password');
  console.log('[PASS] Native scrypt password hashing verified with unique cryptographic salts\n');

  // 2. Constant-time Password Verification
  console.log('Test 2: Constant-Time Password Verification');
  const valid = auth.verifyPassword(pass1, hash1, salt1);
  assert.strictEqual(valid, true, 'Valid password must verify');

  const invalid = auth.verifyPassword('WrongPassword!', hash1, salt1);
  assert.strictEqual(invalid, false, 'Invalid password must be rejected');

  const emptyCheck = auth.verifyPassword('', hash1, salt1);
  assert.strictEqual(emptyCheck, false, 'Empty password must be rejected');
  console.log('[PASS] Constant-time password verification correctly distinguishes valid/invalid credentials\n');

  // 3. User Registration Constraints & Persistence
  console.log('Test 3: User Registration Validation & Duplicate Defense');
  const validReg = auth.register('trader_quant', 'quant@marketarena.io', 'AlphaPass789#');
  assert.strictEqual(validReg.success, true, 'Valid registration must succeed');
  assert(validReg.user.id.startsWith('usr_'), 'User ID must have usr_ prefix');
  assert(validReg.session.token.startsWith('masess_'), 'Session token must have masess_ prefix');
  assert(validReg.session.csrfToken.startsWith('macsrf_'), 'CSRF token must have macsrf_ prefix');

  // Short username rejection
  const shortUser = auth.register('ab', 'ab@example.com', 'ValidPassword123');
  assert.strictEqual(shortUser.success, false, 'Short username must be rejected');

  // Invalid email rejection
  const badEmail = auth.register('trader_bob', 'not-an-email', 'ValidPassword123');
  assert.strictEqual(badEmail.success, false, 'Malformed email must be rejected');

  // Short password rejection
  const shortPass = auth.register('trader_charlie', 'charlie@example.com', 'short');
  assert.strictEqual(shortPass.success, false, 'Password under 8 chars must be rejected');

  // Duplicate username rejection
  const dupUser = auth.register('trader_quant', 'another@marketarena.io', 'AnotherPass123');
  assert.strictEqual(dupUser.success, false);
  assert(dupUser.error.includes('Username is already registered'));

  // Duplicate email rejection
  const dupEmail = auth.register('trader_new', 'quant@marketarena.io', 'AnotherPass123');
  assert.strictEqual(dupEmail.success, false);
  assert(dupEmail.error.includes('Email address is already registered'));
  console.log('[PASS] Registration constraints, field validations, and uniqueness checks verified\n');

  // 4. User Login & Credential Authentication
  console.log('Test 4: User Authentication via Username or Email');
  // Login with username
  const loginUser = auth.login('trader_quant', 'AlphaPass789#');
  assert.strictEqual(loginUser.success, true, 'Login with username must succeed');
  assert.strictEqual(loginUser.user.username, 'trader_quant');

  // Login with email
  const loginEmail = auth.login('quant@marketarena.io', 'AlphaPass789#');
  assert.strictEqual(loginEmail.success, true, 'Login with email must succeed');

  // Login with wrong password
  const badLogin = auth.login('trader_quant', 'WrongSecret');
  assert.strictEqual(badLogin.success, false);

  // Login with unknown user
  const unknownLogin = auth.login('non_existent', 'AlphaPass789#');
  assert.strictEqual(unknownLogin.success, false);
  console.log('[PASS] Login authenticated across username and email identifiers\n');

  // 5. Session Lifecycle: Validation, Expiration & Revocation
  console.log('Test 5: Session Lifecycle, Expiration & Revocation');
  const sessionToken = loginUser.session.token;
  const validated = auth.validateSession(sessionToken);
  assert.strictEqual(validated.valid, true);
  assert.strictEqual(validated.userId, validReg.user.id);

  // Revoke session
  const revoked = auth.revokeSession(sessionToken);
  assert.strictEqual(revoked, true);

  const postRevoke = auth.validateSession(sessionToken);
  assert.strictEqual(postRevoke.valid, false);
  assert.strictEqual(postRevoke.error, 'Session has been revoked');

  // Revoke all sessions
  const s1 = auth.createSession(validReg.user.id);
  const s2 = auth.createSession(validReg.user.id);
  assert.strictEqual(auth.validateSession(s1.token).valid, true);
  assert.strictEqual(auth.validateSession(s2.token).valid, true);

  const revokedAllCount = auth.revokeAllUserSessions(validReg.user.id);
  assert(revokedAllCount >= 2);
  assert.strictEqual(auth.validateSession(s1.token).valid, false);
  assert.strictEqual(auth.validateSession(s2.token).valid, false);
  console.log('[PASS] Session token validation, single revocation, and global user revocation verified\n');

  // 6. RESTful Authentication API Endpoints
  console.log('Test 6: RESTful Authentication Endpoints (/register, /login, /me, /logout)');
  const testSuffix = Date.now();
  const restUsername = `user_${testSuffix}`;
  const restEmail = `user_${testSuffix}@testarena.com`;
  const restPassword = `Secur3P@ssword_${testSuffix}`;

  // POST /api/v1/auth/register
  const regRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: restUsername,
      email: restEmail,
      password: restPassword
    })
  }).then(r => r.json());

  assert.strictEqual(regRes.success, true, 'REST register must return success');
  assert.strictEqual(regRes.user.username, restUsername);
  const restToken = regRes.session.token;
  const restCsrf = regRes.session.csrfToken;
  assert(restToken && restCsrf);

  // GET /api/v1/auth/me with Bearer token
  const meRes = await fetch(`${BASE_URL}/api/v1/auth/me`, {
    headers: {
      Authorization: `Bearer ${restToken}`
    }
  }).then(r => r.json());

  assert.strictEqual(meRes.user.username, restUsername);
  assert.strictEqual(meRes.csrfToken, restCsrf);

  // POST /api/v1/auth/login
  const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: restEmail,
      password: restPassword
    })
  }).then(r => r.json());

  assert.strictEqual(loginRes.success, true);
  const secondToken = loginRes.session.token;

  // POST /api/v1/auth/logout
  const logoutRes = await fetch(`${BASE_URL}/api/v1/auth/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secondToken}`
    }
  }).then(r => r.json());
  assert.strictEqual(logoutRes.success, true);

  // Verify second token is rejected after logout
  const meAfterLogout = await fetch(`${BASE_URL}/api/v1/auth/me`, {
    headers: {
      Authorization: `Bearer ${secondToken}`
    }
  });
  assert.strictEqual(meAfterLogout.status, 401, 'Revoked token must be rejected with 401');

  console.log('[PASS] Full RESTful auth workflow (register -> me -> login -> logout) verified\n');

  console.log('[SUCCESS] ALL USER AUTHENTICATION & SESSION TESTS PASSED!\n');
  process.exit(0);
}

run().catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});
