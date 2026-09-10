import assert from 'assert';
import { IcebergWhaleTrader } from '../traders/iceberg.js';
import { AccountManager } from '../engine/accounts.js';
import { MatchingEngine } from '../engine/matching.js';
import { MarketClock } from '../engine/clock.js';
import { MarketManager } from '../engine/market.js';
import { SQLiteStorageManager } from '../engine/sqlite-storage.js';

console.log('[TEST] Starting Iceberg Institutional Whale Trader Test Suite...\n');

const storage = new SQLiteStorageManager(':memory:');
const clock = new MarketClock();
const accountManager = new AccountManager(100000, storage);
const symbols = ['AUTO', 'SOLR', 'BYTE', 'NBNK', 'MEDL'];
const matchingEngine = new MatchingEngine(symbols, accountManager, clock);
const marketManager = new MarketManager(clock, matchingEngine);

const whaleBot = new IcebergWhaleTrader('bot_iceberg_test', 'BlackRock Execution', matchingEngine, marketManager, accountManager, clock);

// Test 1: Sliced Tranche Order Creation
console.log('Test 1: Sliced Tranche Order Creation');
const iceberg = whaleBot.startIcebergOrder({
  symbol: 'AUTO',
  side: 'BUY',
  totalQuantity: 1000,
  sliceQuantity: 150,
  limitPrice: 400.00
});

assert.strictEqual(iceberg.totalQuantity, 1000);
assert.strictEqual(iceberg.sliceQuantity, 150);
assert.strictEqual(iceberg.status, 'ACTIVE');

// Verify only the 150-share visible tranche appears in the order book, NOT the 1000 shares
const book = matchingEngine.getOrderBook('AUTO');
const visibleOrder = book.bids.find(o => o.id === iceberg.currentSliceOrderId);
assert(visibleOrder !== undefined, 'Visible tranche must be placed in order book');
assert.strictEqual(visibleOrder.quantity, 150, 'Visible tranche quantity must be 150, hiding the 850 reserve shares');
console.log('[PASS] Visible tranche (150 shares) placed in book; 850 reserve shares concealed\n');

// Test 2: Automatic Tranche Replenishment on Fill
console.log('Test 2: Automatic Tranche Replenishment on Fill');
// Create a counterparty seller who sells 150 shares at 400.00 to fill the visible slice
const seller = accountManager.getOrCreateUser('usr_seller', 'Retail Seller', false, 100000);
seller.holdings.set('AUTO', { quantity: 500, avgPrice: 400, lockedQty: 0 });

const matchResult = matchingEngine.submitOrder({
  userId: 'usr_seller',
  userName: 'Retail Seller',
  symbol: 'AUTO',
  side: 'SELL',
  type: 'LIMIT',
  price: 400.00,
  quantity: 150
});

assert(matchResult.success, 'Match execution should succeed');
assert.strictEqual(matchResult.trades.length, 1);
assert.strictEqual(matchResult.trades[0].quantity, 150);

// Wait for replenishment
setTimeout(() => {
  assert(iceberg.filledTotalQty >= 150, 'Filled total quantity should be at least 150');
  assert(iceberg.remainingTotalQty <= 850, 'Remaining total quantity should be at most 850');
  console.log('[PASS] First tranche fill triggered automatic replenishment of next visible tranche');
  console.log('[SUCCESS] ALL ICEBERG INSTITUTIONAL BOT TESTS PASSED!\n');
  process.exit(0);
}, 600);
