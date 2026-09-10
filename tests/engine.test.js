import assert from 'assert';
import { OrderBook } from '../engine/orderbook.js';
import { AccountManager } from '../engine/accounts.js';
import { MatchingEngine } from '../engine/matching.js';
import { MarketClock } from '../engine/clock.js';
import { MarketManager } from '../engine/market.js';
import { LocalStorageManager } from '../engine/storage.js';
import { SQLiteStorageManager } from '../engine/sqlite-storage.js';

console.log('[TEST] Starting MarketArena Engine Automated Tests...\n');

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
console.log('[PASS] OrderBook bids correctly sorted by Price DESC, then Time ASC');

// Test 2: Matching against Limit Order Book
console.log('Test 2: Matching incoming Sell order');
const matchRes = ob.processOrder({ id: 'o4', userId: 'u4', userName: 'Dave', symbol: 'TEST', side: 'SELL', type: 'LIMIT', price: 105, quantity: 7 });
assert.strictEqual(matchRes.trades.length, 2);
assert.strictEqual(matchRes.trades[0].quantity, 5); // Filled Bob's entire 5
assert.strictEqual(matchRes.trades[0].buyerId, 'u2');
assert.strictEqual(matchRes.trades[1].quantity, 2); // Partially filled Charlie (2 of 8)
assert.strictEqual(matchRes.trades[1].buyerId, 'u3');
assert.strictEqual(ob.bids[0].quantity, 6); // Charlie has 6 remaining
console.log('[PASS] FIFO Price-Time matching executed correctly');

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
console.log('[PASS] Account settlement, margin locks, and holdings verified');

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
console.log('[PASS] Full MatchingEngine cycle passed');

// Test 5: Trade History Logging
console.log('Test 5: Trade History Logging for Buyer and Seller');
const aliceHistory = accts.getUserTradeHistory('alice');
const bobHistory = accts.getUserTradeHistory('bob');

assert.strictEqual(aliceHistory.length >= 2, true);
assert.strictEqual(bobHistory.length >= 2, true);

// Latest trade for Alice was a BUY (maker)
assert.strictEqual(aliceHistory[0].side, 'BUY');
assert.strictEqual(aliceHistory[0].role, 'MAKER');
assert.strictEqual(aliceHistory[0].quantity, 5);
assert.strictEqual(aliceHistory[0].price, 460);

// Latest trade for Bob was a SELL (taker)
assert.strictEqual(bobHistory[0].side, 'SELL');
assert.strictEqual(bobHistory[0].role, 'TAKER');
assert.strictEqual(bobHistory[0].quantity, 5);
assert.strictEqual(bobHistory[0].price, 460);
console.log('[PASS] Trade history accurately recorded on buyer and seller accounts');

// Test 6: Serialization and State Persistence
console.log('Test 6: Account serialization and state restoration');
const serialized = accts._serializeAccounts();
assert.strictEqual(Array.isArray(serialized.users), true);
assert.strictEqual(serialized.users.some(u => u.id === 'alice'), true);
assert.strictEqual(serialized.users.some(u => u.id === 'bob'), true);

// Create a new AccountManager instance and restore
const mockStorage = {
  loadState: () => serialized,
  scheduleSave: () => {}
};
const restoredAccts = new AccountManager(100000, mockStorage);
const restoredAlice = restoredAccts.getUser('alice');
assert.strictEqual(restoredAlice !== null, true);
assert.strictEqual(restoredAlice.credits, accts.getUser('alice').credits);
assert.strictEqual(restoredAlice.holdings.get('AUTO').quantity, 15);
assert.strictEqual(restoredAlice.tradeHistory.length, aliceHistory.length);
console.log('[PASS] Account state serialized and successfully restored');

// Test 7: Native SQLite DatabaseSync Relational Persistence
console.log('Test 7: Native SQLite relational tables and full roundtrip');
const memorySqlite = new SQLiteStorageManager(':memory:');
const sqliteAccts = new AccountManager(100000, memorySqlite);

const charlie = sqliteAccts.getOrCreateUser('charlie', 'Charlie Quant');
assert.strictEqual(charlie.credits, 100000);

// Record trade
sqliteAccts.settleTrade({
  id: 'tr_sq1',
  symbol: 'BYTE',
  price: 1200,
  quantity: 10,
  buyerId: 'charlie',
  buyerName: 'Charlie Quant',
  sellerId: 'bot_mm_alpha',
  sellerName: 'MM Alpha Securities',
  takerSide: 'BUY'
}, false, false);

assert.strictEqual(charlie.credits, 88000);
assert.strictEqual(charlie.holdings.get('BYTE').quantity, 10);
assert.strictEqual(charlie.tradeHistory.length, 1);

// Test reconstruction from SQLite tables
const recoveredAccounts = memorySqlite.loadAllAccounts();
assert.strictEqual(recoveredAccounts.length, 1);
assert.strictEqual(recoveredAccounts[0].id, 'charlie');
assert.strictEqual(recoveredAccounts[0].credits, 88000);
assert.strictEqual(recoveredAccounts[0].holdings.get('BYTE').quantity, 10);
assert.strictEqual(recoveredAccounts[0].tradeHistory.length, 1);
assert.strictEqual(recoveredAccounts[0].tradeHistory[0].symbol, 'BYTE');
assert.strictEqual(recoveredAccounts[0].tradeHistory[0].price, 1200);

memorySqlite.close();
console.log('[PASS] SQLite relational persistence (accounts, holdings, trade_history) verified');

// Test 8: Advanced Order Types (Stop-Loss and Stop-Limit)
console.log('Test 8: Advanced Order Types (Stop-Loss & Stop-Limit)');
const stopClock = new MarketClock({ openDurationSec: 120 });
const stopAccts = new AccountManager(100000);
const stopEngine = new MatchingEngine(['AUTO'], stopAccts, stopClock);

const trader1 = stopAccts.getOrCreateUser('t1', 'Trader One');
const trader2 = stopAccts.getOrCreateUser('t2', 'Trader Two');

// Give trader1 10 shares of AUTO
trader1.holdings.set('AUTO', { quantity: 10, avgPrice: 450, lockedQty: 0 });

// Trader 1 sets a Stop-Loss sell order for 10 shares at stop price 440
const slOrderRes = stopEngine.submitOrder({
  userId: 't1',
  userName: 'Trader One',
  symbol: 'AUTO',
  side: 'SELL',
  type: 'STOP_LOSS',
  stopPrice: 440,
  quantity: 10
});
assert.strictEqual(slOrderRes.success, true);
assert.strictEqual(slOrderRes.isStop, true);
// Trader 1's 10 shares should be locked
assert.strictEqual(trader1.holdings.get('AUTO').lockedQty, 10);

// Verify order is in open orders
const openOrdersT1 = stopEngine.getUserOpenOrders('t1');
assert.strictEqual(openOrdersT1.length, 1);
assert.strictEqual(openOrdersT1[0].type, 'STOP_LOSS');
assert.strictEqual(openOrdersT1[0].stopPrice, 440);

// Now Trader 2 places a limit buy at 438, which should not immediately trigger until a trade happens
stopEngine.submitOrder({
  userId: 't2',
  userName: 'Trader Two',
  symbol: 'AUTO',
  side: 'BUY',
  type: 'LIMIT',
  price: 438,
  quantity: 10
});

// A trade occurs at 439 between other participants
const arbBot = stopAccts.getOrCreateUser('bot_arb', 'Arb Bot', true);
arbBot.holdings.set('AUTO', { quantity: 10, avgPrice: 439, lockedQty: 0 });

// Selling 1 share at 439 matches Trader 2's bid at 438 or another trade at 439
// Let's create an order that trades at 439 to trigger the stop
stopEngine.submitOrder({
  userId: 'bot_arb',
  userName: 'Arb Bot',
  symbol: 'AUTO',
  side: 'SELL',
  type: 'LIMIT',
  price: 439,
  quantity: 1
});
stopEngine.submitOrder({
  userId: 't2',
  userName: 'Trader Two',
  symbol: 'AUTO',
  side: 'BUY',
  type: 'LIMIT',
  price: 439,
  quantity: 1
});

// The last trade was at 439, which is <= stopPrice (440).
// This must trigger Trader 1's Stop-Loss sell (converted to MARKET sell) and match remaining bids!
const t1RemainingHolding = trader1.holdings.get('AUTO');
assert.strictEqual(t1RemainingHolding.quantity < 10, true, 'Stop loss order should have executed');
console.log('[PASS] Stop-Loss successfully triggered and executed upon price crossing');

// Test 9: Achievements Engine & SQLite Persistence
console.log('Test 9: Achievements Milestone Detection & Bonus Granting');
const achSqlite = new SQLiteStorageManager(':memory:');
const achAccts = new AccountManager(100000, achSqlite);
const achUser = achAccts.getOrCreateUser('ach_trader', 'Achieve Hunter');

// Simulate first trade
achUser.tradesCount = 1;
const unlocked1 = achAccts.checkAchievements('ach_trader', { AUTO: 450 });
assert.strictEqual(unlocked1.some(a => a.id === 'FIRST_TRADE'), true);
assert.strictEqual(achUser.achievements.has('FIRST_TRADE'), true);
// Reward credits should be granted (250 CR)
assert.strictEqual(achUser.credits, 100250);

// Verify SQLite persistence of achievement
const persistedAchs = achSqlite.loadAchievements('ach_trader');
assert.strictEqual(persistedAchs.includes('FIRST_TRADE'), true);

// Simulate placing a stop order
const unlocked2 = achAccts.checkAchievements('ach_trader', { AUTO: 450 }, 'STOP_ORDER_PLACED');
assert.strictEqual(unlocked2.some(a => a.id === 'RISK_MANAGER'), true);
assert.strictEqual(achUser.achievements.has('RISK_MANAGER'), true);
achSqlite.close();
console.log('[PASS] Achievements milestones correctly evaluated, awarded, and persisted');

// Test 10: Multi-Day Progression and End-of-Day Summary
console.log('Test 10: Multi-Day Progression & End-of-Day Summary');
const dayAccts = new AccountManager(100000);
const dayUser = dayAccts.getOrCreateUser('day_trader', 'Day Trader');
dayUser.credits = 105000; // +5,000 CR profit
dayUser.tradesToday = 4;
dayUser.volumeToday = 20000;

const summary = dayAccts.getDaySummary('day_trader', { AUTO: 450 }, 1);
assert.strictEqual(summary.day, 1);
assert.strictEqual(summary.dayPnL, 5000);
assert.strictEqual(summary.dayPnLPercent, 5);
assert.strictEqual(summary.tradesToday, 4);
assert.strictEqual(summary.volumeToday, 20000);

// Advance to Day 2
dayAccts.onNewDay(2, { AUTO: 450 });
assert.strictEqual(dayUser.tradesToday, 0);
assert.strictEqual(dayUser.volumeToday, 0);
assert.strictEqual(dayUser.dayStartNetWorth, 105000);
console.log('[PASS] Multi-Day recap calculations and clean Day rollover verified');

console.log('\n[SUCCESS] ALL CORE ENGINE & TIER 2 TESTS PASSED!\n');
