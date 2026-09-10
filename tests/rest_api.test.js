import assert from 'assert';

console.log('[TEST] Starting RESTful API Endpoints Test Suite...\n');

const BASE_URL = 'http://localhost:3000';

async function run() {
  // Test 1: Public Ping and Market Regime
  console.log('Test 1: Public Ping and Market Regime');
  let pingRes = await fetch(`${BASE_URL}/api/v1/ping`).then(r => r.json());
  while (pingRes.clock && (pingRes.clock.phase === 'POST_MARKET' || pingRes.clock.phase === 'CLOSED')) {
    await new Promise(r => setTimeout(r, 1000));
    pingRes = await fetch(`${BASE_URL}/api/v1/ping`).then(r => r.json());
  }
  assert.strictEqual(pingRes.status, 'ok', 'Ping status should be ok');
  assert(pingRes.clock, 'Ping should include market clock');

  const regimeRes = await fetch(`${BASE_URL}/api/v1/regime`).then(r => r.json());
  assert(regimeRes.name, 'Regime must have a name');
  assert(typeof regimeRes.spreadMultiplier === 'number', 'Regime must have spread multiplier');
  console.log(`[PASS] Ping OK. Active Regime: ${regimeRes.name} (${regimeRes.spreadMultiplier}x spread)\n`);

  // Test 2: Order Book and Candlestick Market Data
  console.log('Test 2: L2 Order Book & OHLCV Candlestick Endpoints');
  const book = await fetch(`${BASE_URL}/api/v1/orderbook/BYTE?depth=5`).then(r => r.json());
  assert.strictEqual(book.symbol, 'BYTE');
  assert(Array.isArray(book.bids), 'Book must include bids');
  assert(Array.isArray(book.asks), 'Book must include asks');

  const candles = await fetch(`${BASE_URL}/api/v1/candles/BYTE?timeframe=5s&limit=10`).then(r => r.json());
  assert.strictEqual(candles.symbol, 'BYTE');
  assert.strictEqual(candles.timeframe, '5s');
  assert(Array.isArray(candles.candles), 'Candles response must have candle array');
  console.log(`[PASS] Market data endpoints verified (${book.bids.length} bids, ${candles.candles.length} candles)\n`);

  // Test 3: API Key Generation
  console.log('Test 3: API Key Creation via REST');
  const testUserId = `usr_test_api_${Date.now()}`;
  const keyGen = await fetch(`${BASE_URL}/api/v1/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: testUserId,
      name: 'Automated Bot Key',
      permissions: ['read', 'trade']
    })
  }).then(r => r.json());

  assert(keyGen.success, 'Key generation must succeed');
  const apiKey = keyGen.key.keyId;
  const apiSecret = keyGen.key.secret;
  assert(apiKey.startsWith('mak_'), 'Key should start with mak_');
  assert(apiSecret.startsWith('mas_'), 'Secret should start with mas_');
  console.log(`[PASS] Generated API Key: ${apiKey}\n`);

  // Test 4: Authenticated Account Query
  console.log('Test 4: Authenticated Account Portfolio Query');
  const acctRes = await fetch(`${BASE_URL}/api/v1/account`, {
    headers: {
      'X-API-KEY': apiKey,
      'X-API-SECRET': apiSecret
    }
  }).then(r => r.json());

  assert(acctRes.user, 'Account response must include user');
  assert.strictEqual(acctRes.user.id, testUserId);
  assert(acctRes.portfolio, 'Account response must include portfolio');
  assert.strictEqual(acctRes.portfolio.credits, 100000, 'New user starts with 100,000 CR');
  console.log(`[PASS] Authenticated account fetched. Cash: ${acctRes.portfolio.credits} CR\n`);

  // Test 5: Programmatic Order Placement
  console.log('Test 5: Programmatic Order Placement via REST');
  const orderRes = await fetch(`${BASE_URL}/api/v1/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
      'X-API-SECRET': apiSecret
    },
    body: JSON.stringify({
      symbol: 'BYTE',
      side: 'BUY',
      type: 'LIMIT',
      price: 1000.00, // Passive bid below market
      quantity: 5
    })
  }).then(r => r.json());

  assert(orderRes.success, `Order placement should succeed: ${JSON.stringify(orderRes)}`);
  assert(orderRes.order, 'Should return created order');
  const orderId = orderRes.order.id;
  console.log(`[PASS] Placed limit order #${orderId} for 5 BYTE @ 1000.00 CR\n`);

  // Test 6: Query Open Orders
  console.log('Test 6: Query User Open Orders');
  const openOrdersRes = await fetch(`${BASE_URL}/api/v1/orders`, {
    headers: {
      'X-API-KEY': apiKey,
      'X-API-SECRET': apiSecret
    }
  }).then(r => r.json());

  assert.strictEqual(openOrdersRes.count, 1, 'Should have 1 open order');
  assert.strictEqual(openOrdersRes.orders[0].id, orderId);
  console.log(`[PASS] Verified 1 open order in resting book\n`);

  // Test 7: Programmatic Order Cancellation
  console.log('Test 7: Programmatic Order Cancellation');
  const cancelRes = await fetch(`${BASE_URL}/api/v1/orders/${orderId}?symbol=BYTE`, {
    method: 'DELETE',
    headers: {
      'X-API-KEY': apiKey,
      'X-API-SECRET': apiSecret
    }
  }).then(r => r.json());

  assert(cancelRes.success, 'Cancellation should succeed');

  const afterCancelOrders = await fetch(`${BASE_URL}/api/v1/orders`, {
    headers: {
      'X-API-KEY': apiKey,
      'X-API-SECRET': apiSecret
    }
  }).then(r => r.json());
  assert.strictEqual(afterCancelOrders.count, 0, 'Open orders should now be 0');
  console.log(`[PASS] Order #${orderId} successfully cancelled\n`);

  console.log('[SUCCESS] ALL RESTFUL API ENDPOINT TESTS PASSED!\n');
  setTimeout(() => process.exit(0), 50);
}

run().catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});
