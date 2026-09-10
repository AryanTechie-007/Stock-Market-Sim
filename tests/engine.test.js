import assert from 'assert';
import { OrderBook } from '../engine/orderbook.js';
import { AccountManager } from '../engine/accounts.js';
import { MatchingEngine } from '../engine/matching.js';
import { MarketClock } from '../engine/clock.js';
import { MarketManager } from '../engine/market.js';

console.log('🧪 Starting MarketArena Engine Automated Tests...\n');

// Test 1: OrderBook basic limit order placement and sorting
console.log('Test 1: OrderBook sorting & priority');
const ob = new OrderBook('TEST');
ob.processOrder({ id: 'o1', userId: 'u1', userName: 'Alice', symbol: 'TEST', side: 'BUY', type: 'LIMIT', price: 100, quantity: 10 });
ob.processOrder({ id: 'o2', userId: 'u2', userName: 'Bob', symbol: 'TEST', side: 'BUY', type: 'LIMIT', price: 105, quantity: 5 });
ob.processOrder({ id: 'o3', userId: 'u3', userName: 'Charlie', symbol: 'TEST', side: 'BUY', type: 'LIMIT', price: 105, quantity: 8 });

assert.strictEqual(ob.bids.length, 3);
assert.strictEqual(ob.bids[0].price, 105);
assert.strictEqual(ob.bids[0].id, 'o2'); // Bob arrived before Charlie at same price
assert.strictEqual(ob.bids[1].id, 'o3');
assert.strictEqual(ob.bids[2].price, 100);
console.log('✅ OrderBook bids correctly sorted by Price DESC, then Time ASC');

// Test 2: Matching against Limit Order Book
console.log('Test 2: Matching incoming Sell order');
const matchRes = ob.processOrder({ id: 'o4', userId: 'u4', userName: 'Dave', symbol: 'TEST', side: 'SELL', type: 'LIMIT', price: 105, quantity: 7 });
assert.strictEqual(matchRes.trades.length, 2);
assert.strictEqual(matchRes.trades[0].quantity, 5); // Filled Bob's entire 5
assert.strictEqual(matchRes.trades[0].buyerId, 'u2');
assert.strictEqual(matchRes.trades[1].quantity, 2); // Partially filled Charlie (2 of 8)
assert.strictEqual(matchRes.trades[1].buyerId, 'u3');
assert.strictEqual(ob.bids[0].quantity, 6); // Charlie has 6 remaining
console.log('✅ FIFO Price-Time matching executed correctly');

// Test 3: AccountManager balances & locks
console.log('Test 3: AccountManager balances & trade settlement');
const accts = new AccountManager(100000);
const uAlice = accts.getOrCreateUser('alice', 'Alice');
const uBob = accts.getOrCreateUser('bob', 'Bob');

// Seed Bob with 20 shares
uBob.holdings.set('AUTO', { quantity: 20, avgPrice: 450, lockedQty: 0 });

// Lock funds for Alice's limit buy: 10 shares @ 450 = 4,500 credits
accts.lockCredits('alice', 4500);
assert.strictEqual(accts.getUser('alice').lockedCredits, 4500);

// Settle trade: Alice buys 10 shares from Bob at 450 (Alice maker)
const sampleTrade = {
  id: 'tr_test',
  symbol: 'AUTO',
  price: 450,
  quantity: 10,
  buyerId: 'alice',
  buyerName: 'Alice',
  sellerId: 'bob',
  sellerName: 'Bob',
  takerSide: 'SELL'
};
accts.settleTrade(sampleTrade, true, false);

assert.strictEqual(accts.getUser('alice').credits, 95500);
assert.strictEqual(accts.getUser('alice').lockedCredits, 0);
assert.strictEqual(accts.getUser('alice').holdings.get('AUTO').quantity, 10);
assert.strictEqual(accts.getUser('bob').credits, 104500);
assert.strictEqual(accts.getUser('bob').holdings.get('AUTO').quantity, 10);
console.log('✅ Account settlement, margin locks, and holdings verified');

// Test 4: Full MatchingEngine Integration
console.log('Test 4: MatchingEngine coordinator with Clock');
const clock = new MarketClock({ openDurationSec: 60 });
const engine = new MatchingEngine(['AUTO', 'SOLR'], accts, clock);

const buyRes = engine.submitOrder({
  userId: 'alice',
  userName: 'Alice',
  symbol: 'AUTO',
  side: 'BUY',
  type: 'LIMIT',
  price: 460,
  quantity: 5
});
assert.strictEqual(buyRes.success, true);

const sellRes = engine.submitOrder({
  userId: 'bob',
  userName: 'Bob',
  symbol: 'AUTO',
  side: 'SELL',
  type: 'MARKET',
  price: 450,
  quantity: 5
});
assert.strictEqual(sellRes.success, true);
assert.strictEqual(sellRes.trades.length, 1);
assert.strictEqual(sellRes.trades[0].price, 460); // Executed at maker price
console.log('✅ Full MatchingEngine cycle passed');

console.log('\n🎉 ALL CORE ENGINE TESTS PASSED!\n');
