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

// Test 11: Trailing Stop Dynamic Ratcheting & Execution
console.log('\nTest 11: Trailing Stop Dynamic Ratcheting & Execution');
const trailBook = new OrderBook('BYTE');
const trailOrder = trailBook.addStopOrder({
  id: 'ord_trail_1',
  userId: 'trail_trader',
  userName: 'Trail Guy',
  symbol: 'BYTE',
  side: 'SELL',
  type: 'TRAILING_STOP',
  trailingDelta: 5.0,
  currentMarketPrice: 100,
  quantity: 10
});

assert.strictEqual(trailOrder.peakPrice, 100);
assert.strictEqual(trailOrder.stopPrice, 95);

// Price rises to 106 -> peak becomes 106, stop ratchets to 101
let triggered = trailBook.checkStopOrders(106);
assert.strictEqual(triggered.length, 0);
assert.strictEqual(trailOrder.peakPrice, 106);
assert.strictEqual(trailOrder.stopPrice, 101);

// Price rises to 112 -> peak becomes 112, stop ratchets to 107
triggered = trailBook.checkStopOrders(112);
assert.strictEqual(triggered.length, 0);
assert.strictEqual(trailOrder.peakPrice, 112);
assert.strictEqual(trailOrder.stopPrice, 107);

// Price drops to 108 -> no ratchet, no trigger (108 > 107)
triggered = trailBook.checkStopOrders(108);
assert.strictEqual(triggered.length, 0);
assert.strictEqual(trailOrder.stopPrice, 107);

// Price drops to 106.50 (<= 107) -> triggers!
triggered = trailBook.checkStopOrders(106.50);
assert.strictEqual(triggered.length, 1);
assert.strictEqual(triggered[0].id, 'ord_trail_1');
console.log('[PASS] Trailing Stop successfully ratcheted upward and triggered on reversal');

// Test 12: OCO (One-Cancels-the-Other) Bracket Orders
console.log('\nTest 12: OCO Bracket Order Mutual Cancellation');
const ocoClock = new MarketClock();
ocoClock.phase = 'REGULAR_HOURS';
const ocoAccts = new AccountManager(100000);
const ocoEngine = new MatchingEngine(['BYTE'], ocoAccts, ocoClock);

const ocoUser = ocoAccts.getOrCreateUser('oco_trader', 'OCO Trader');
ocoUser.holdings.set('BYTE', { quantity: 20, avgPrice: 100, lockedQty: 0 });

const ocoRes = ocoEngine.submitOcoOrder(
  { userId: 'oco_trader', userName: 'OCO Trader', symbol: 'BYTE', side: 'SELL', type: 'LIMIT', price: 120, quantity: 10 },
  { userId: 'oco_trader', userName: 'OCO Trader', symbol: 'BYTE', side: 'SELL', type: 'STOP_LOSS', stopPrice: 85, quantity: 10 }
);

assert.strictEqual(ocoRes.success, true);
assert.strictEqual(typeof ocoRes.ocoGroupId, 'string');
const ocoBook = ocoEngine.books.get('BYTE');
assert.strictEqual(ocoBook.orders.has(ocoRes.limitOrder.id), true);
assert.strictEqual(ocoBook.stopOrders.has(ocoRes.stopOrder.id), true);

// Execute a buyer against the Take-Profit limit leg at 120
const buyerBot = ocoAccts.getOrCreateUser('bot_buyer', 'Buyer Bot', true);
buyerBot.credits = 100000;
ocoEngine.submitOrder({
  userId: 'bot_buyer',
  userName: 'Buyer Bot',
  symbol: 'BYTE',
  side: 'BUY',
  type: 'MARKET',
  quantity: 10
});

// Limit leg filled, stop leg must be automatically cancelled from the stop queue
assert.strictEqual(ocoBook.stopOrders.has(ocoRes.stopOrder.id), false, 'Counterpart stop order should be cancelled');
console.log('[PASS] OCO mutual cancellation: Limit execution cancelled resting Stop leg');

// Test 13: Short Selling & Buy to Cover
console.log('\nTest 13: Short Selling & Buy to Cover with Realized P&L');
const shortAccts = new AccountManager(100000);
const shortUser = shortAccts.getOrCreateUser('short_seller', 'Bearish Quant');
const buyerUser = shortAccts.getOrCreateUser('bull_buyer', 'Bullish Buyer');

// Settle a short sale: short_seller sells 10 shares of SOLR at 200 with 0 shares owned
const shortTrade = {
  id: 'tr_short_1',
  symbol: 'SOLR',
  price: 200,
  quantity: 10,
  buyerId: 'bull_buyer',
  buyerName: 'Bullish Buyer',
  sellerId: 'short_seller',
  sellerName: 'Bearish Quant',
  takerSide: 'SELL',
  sellerLeverage: 2
};
shortAccts.settleTrade(shortTrade, false, false);

const shortHolding = shortUser.holdings.get('SOLR');
assert.strictEqual(shortHolding.shortQuantity, 10);
assert.strictEqual(shortHolding.shortAvgPrice, 200);
assert.strictEqual(shortUser.credits, 102000); // 100,000 + (200 * 10)

// Price drops to 160. Bearish Quant buys 10 shares to cover the short!
const coverTrade = {
  id: 'tr_cover_1',
  symbol: 'SOLR',
  price: 160,
  quantity: 10,
  buyerId: 'short_seller',
  buyerName: 'Bearish Quant',
  sellerId: 'bull_buyer',
  sellerName: 'Bullish Buyer',
  takerSide: 'BUY'
};
shortAccts.settleTrade(coverTrade, false, false);

assert.strictEqual(shortHolding.shortQuantity, 0);
// Realized profit: (200 - 160) * 10 = +400 CR
assert.strictEqual(shortUser.realizedPnL, 400);
assert.strictEqual(shortUser.credits, 100400);
console.log('[PASS] Short selling and Buy-to-Cover settled with accurate P&L accounting');

// Test 14: Margin Borrowing, Maintenance Margin, & Liquidation
console.log('\nTest 14: Margin Borrowing, Maintenance Margin, & Liquidation');
const marginClock = new MarketClock();
marginClock.phase = 'REGULAR_HOURS';
const marginAccts = new AccountManager(10000);
const marginEngine = new MatchingEngine(['SOLR'], marginAccts, marginClock);

const mUser = marginAccts.getOrCreateUser('margin_trader', 'Leveraged Trader');
// Buy with 5x leverage: 100 shares @ 200 = 20,000 CR total value
// 5x requires 4,000 CR initial margin, remaining 16,000 is margin loan
const marginTrade = {
  id: 'tr_margin_1',
  symbol: 'SOLR',
  price: 200,
  quantity: 100,
  buyerId: 'margin_trader',
  buyerName: 'Leveraged Trader',
  sellerId: 'bot_seller',
  sellerName: 'Bot Seller',
  takerSide: 'BUY',
  buyerLeverage: 5
};
marginAccts.settleTrade(marginTrade, false, false);

assert.strictEqual(mUser.credits, 6000); // 10,000 - 4,000
assert.strictEqual(mUser.marginLoan, 16000);

// Check equity at initial price: 6,000 cash + 20,000 stock - 16,000 loan = 10,000 equity
const statusInitial = marginAccts.getMarginStatus('margin_trader', { SOLR: 200 });
assert.strictEqual(statusInitial.equity, 10000);
assert.strictEqual(statusInitial.maintenanceMargin, 5000); // 25% of 20,000
assert.strictEqual(statusInitial.isMarginCall, false);

// Price crashes to 150: Stock value = 15,000. Equity = 6,000 + 15,000 - 16,000 = 5,000.
// Maintenance Margin = 25% of 15,000 = 3,750 (still safe).
// Price crashes to 130: Stock value = 13,000. Equity = 6,000 + 13,000 - 16,000 = 3,000.
// Maintenance Margin = 25% of 13,000 = 3,250. Equity (3,000) < Maintenance Margin (3,250) -> MARGIN CALL!
const statusCrash = marginAccts.getMarginStatus('margin_trader', { SOLR: 130 });
assert.strictEqual(statusCrash.isMarginCall, true);

// Seed liquidity for liquidation execution
const liqBook = marginEngine.books.get('SOLR');
liqBook.processOrder({
  id: 'bid_liq',
  userId: 'bot_liquidity',
  userName: 'Liquidity Provider',
  symbol: 'SOLR',
  side: 'BUY',
  type: 'LIMIT',
  price: 130,
  quantity: 200
});

const liqResult = marginEngine.checkAndLiquidate('margin_trader');
assert.strictEqual(Array.isArray(liqResult), true);
assert.strictEqual(liqResult.length > 0, true);
assert.strictEqual(liqResult[0].action, 'LIQUIDATE_LONG');
console.log('[PASS] Margin maintenance breach triggered automated liquidation');

// Test 15: SQLite Persistence of Margin Loans & Short Positions
console.log('\nTest 15: SQLite Persistence of Margin Loans & Short Positions');
const sqliteMargin = new SQLiteStorageManager(':memory:');
const persistAccts = new AccountManager(100000, sqliteMargin);
const pUser = persistAccts.getOrCreateUser('persist_margin', 'Persist Margin Trader');
pUser.marginLoan = 12500;
pUser.leverage = 2;
pUser.holdings.set('AUTO', {
  quantity: 0,
  avgPrice: 0,
  lockedQty: 0,
  shortQuantity: 25,
  shortAvgPrice: 420.50,
  lockedShortQty: 0
});

sqliteMargin.saveAccount(pUser);

// Reconstruct from SQLite
const reloadedAccounts = sqliteMargin.loadAllAccounts();
const reloadedUser = reloadedAccounts.find(a => a.id === 'persist_margin');
assert.strictEqual(Boolean(reloadedUser), true);
assert.strictEqual(reloadedUser.marginLoan, 12500);
assert.strictEqual(reloadedUser.leverage, 2);
const reloadedHolding = reloadedUser.holdings.get('AUTO');
assert.strictEqual(Boolean(reloadedHolding), true);
assert.strictEqual(reloadedHolding.shortQuantity, 25);
assert.strictEqual(reloadedHolding.shortAvgPrice, 420.50);
sqliteMargin.close();
console.log('[PASS] SQLite storage seamlessly persisted and restored margin loans and short positions');

console.log('\n[SUCCESS] ALL 15 CORE ENGINE & TIER 3 (v0.4) TESTS PASSED!\n');

