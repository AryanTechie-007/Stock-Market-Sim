import assert from 'assert';
import { execSync } from 'child_process';
import { MarketArenaClient } from '../sdk/js/marketarena.js';

console.log('[TEST] Starting Developer SDK Client Test Suite (JS & Python)...\n');

const BASE_URL = 'http://localhost:3000';

async function run() {
  // 1. Generate an API Key
  const bootstrapClient = new MarketArenaClient({ baseUrl: BASE_URL });
  const userId = `usr_sdk_test_${Date.now()}`;
  const keyData = await bootstrapClient.createApiKey(userId, 'SDK Test Bot', ['read', 'trade']);

  const apiKey = keyData.key.keyId;
  const apiSecret = keyData.key.secret;

  // 2. Initialize Authenticated SDK Client
  console.log('Test 1: JavaScript SDK Full HMAC-SHA256 Authentication');
  const client = new MarketArenaClient({
    baseUrl: BASE_URL,
    apiKey,
    apiSecret
  });

  const ping = await client.ping();
  assert.strictEqual(ping.status, 'ok');

  const regime = await client.getRegime();
  assert(regime.name, 'Regime must be present');

  const book = await client.getOrderbook('SOLR', 5);
  assert(book.bids.length > 0, 'Should return bids');
  console.log(`[PASS] JS SDK connected via HMAC-SHA256 signature. Phase: ${ping.clock.phase}, Regime: ${regime.name}\n`);

  console.log('Test 2: JS SDK Account Portfolio & Order Execution');
  const account = await client.getAccount();
  assert.strictEqual(account.user.id, userId);
  assert.strictEqual(account.portfolio.credits, 100000);

  const orderRes = await client.placeOrder({
    symbol: 'SOLR',
    side: 'BUY',
    type: 'LIMIT',
    price: 50.00, // Passive bid well below current price so it rests in book
    quantity: 10
  });
  assert(orderRes.success);
  const orderId = orderRes.order.id;

  const openOrders = await client.getOpenOrders();
  assert(openOrders.orders.some(o => o.id === orderId));

  const cancelRes = await client.cancelOrder('SOLR', orderId);
  assert(cancelRes.success);
  console.log(`[PASS] JS SDK placed limit order #${orderId} and cancelled successfully\n`);

  // 3. Python SDK Verification
  console.log('Test 3: Python 3 Client SDK Verification');
  try {
    const pyOutput = execSync(
      `python sdk/python/example_bot.py`,
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          MARKETARENA_API_KEY: apiKey,
          MARKETARENA_API_SECRET: apiSecret
        }
      }
    ).toString();

    assert(pyOutput.includes('[PYTHON BOT] Connected!'), 'Python bot must connect');
    assert(pyOutput.includes('Macro Regime:'), 'Python bot must fetch regime');
    assert(pyOutput.includes('BYTE Book | Top Bid:'), 'Python bot must fetch orderbook');
    console.log('[PASS] Python 3 SDK script executed cleanly and queried market state\n');
  } catch (err) {
    console.error('[FAIL] Python SDK execution failed:', err.stdout?.toString() || err.message);
    process.exit(1);
  }

  console.log('[SUCCESS] ALL DEVELOPER SDK CLIENT TESTS PASSED!\n');
  process.exit(0);
}

run().catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});
