import assert from 'assert';
import { io as ioClient } from 'socket.io-client';
import { MarketArenaClient } from '../sdk/js/marketarena.js';

console.log('[TEST] Starting v0.8 Programmatic Bot API & Developer SDK E2E Simulation...\n');

const BASE_URL = 'http://localhost:3000';

async function runSimulation() {
  // 1. Initialize SDK Client and register bot user
  const botUserId = `bot_quant_${Date.now()}`;
  const bootstrapClient = new MarketArenaClient({ baseUrl: BASE_URL });

  console.log('[SIMULATION] Generating cryptographic API key credentials...');
  const keyResponse = await bootstrapClient.createApiKey(botUserId, 'High Frequency Alpha Bot', ['read', 'trade']);
  const apiKey = keyResponse.key.keyId;
  const apiSecret = keyResponse.key.secret;
  assert(apiKey && apiSecret);
  console.log(`[PASS] API Credentials created: ${apiKey} (Secret: ${keyResponse.key.maskedSecret || 'mas_...'})`);

  const botClient = new MarketArenaClient({
    baseUrl: BASE_URL,
    apiKey,
    apiSecret
  });

  // 2. Connect WebSocket client for real-time market event streaming
  console.log('[SIMULATION] Connecting WebSocket feed for market and regime updates...');
  const socket = ioClient(BASE_URL, { reconnection: false });

  let regimeShiftReceived = false;

  await new Promise((resolve, reject) => {
    socket.on('connect', () => {
      console.log('[SOCKET] Connected to simulator stream');
      socket.emit('user:join', { desiredName: 'QuantBot_HFT', existingUserId: botUserId });
    });

    socket.on('init:state', (state) => {
      console.log('[SOCKET] Initial state received. Connected as:', state.user.name);
      resolve();
    });

    socket.on('regime:change', (regime) => {
      console.log(`[SOCKET] Broadcast: Market Regime changed to ${regime.name}`);
      regimeShiftReceived = true;
    });

    setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
  });

  // 3. Query account and live market data over REST
  console.log('[SIMULATION] Querying account portfolio over REST API...');
  const account = await botClient.getAccount();
  assert(account.portfolio.credits >= 100000);
  console.log(`[PASS] Verified bot starting capital: ${account.portfolio.credits} CR`);

  // 4. Query live orderbook depth
  const symbol = 'BYTE';
  const book = await botClient.getOrderbook(symbol, 5);
  assert(book.bids.length > 0 && book.asks.length > 0);
  const bestAsk = book.asks[0].price;
  console.log(`[PASS] Fetched ${symbol} L2 depth | Best Ask: ${bestAsk} CR`);

  // 5. Submit programmatic limit order and market order via SDK
  console.log(`[SIMULATION] Bot executing programmatic aggressive trade on ${symbol}...`);
  const buyRes = await botClient.placeOrder({
    symbol,
    side: 'BUY',
    type: 'LIMIT',
    price: bestAsk + 1.0, // Aggressive cross to fill immediately
    quantity: 5
  });

  assert(buyRes.success, 'Aggressive limit order should fill');
  console.log(`[PASS] Programmatic order executed! Filled ${buyRes.trades?.length || 0} trades`);

  // 6. Verify updated portfolio and inventory
  const updatedAccount = await botClient.getAccount();
  const byteHolding = updatedAccount.portfolio.holdings.find(h => h.symbol === symbol);
  assert(byteHolding, 'Should own inventory in BYTE');
  console.log(`[PASS] Updated holdings verified: ${byteHolding.quantity} ${symbol} @ ${byteHolding.avgPrice.toFixed(2)} CR`);

  // 7. Test passive order placement and cancellation
  const passiveOrderRes = await botClient.placeOrder({
    symbol: 'AUTO',
    side: 'BUY',
    type: 'LIMIT',
    price: 10.0,
    quantity: 2
  });
  assert(passiveOrderRes.success);
  const passiveId = passiveOrderRes.order.id;

  const cancelRes = await botClient.cancelOrder('AUTO', passiveId);
  assert(cancelRes.success);
  console.log(`[PASS] Passive resting order #${passiveId} placed and cancelled cleanly`);

  socket.close();
  console.log('\n[SUCCESS] v0.8 E2E Programmatic Bot API & Developer SDK simulation passed completely!\n');
  setTimeout(() => {
    process.exit(0);
  }, 100);
}

runSimulation().catch(err => {
  console.error('[FAIL] Simulation failed:', err);
  process.exit(1);
});
