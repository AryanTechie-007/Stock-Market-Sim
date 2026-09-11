import assert from 'assert';
import { OrderBook } from '../engine/orderbook.js';
import { MatchingEngine } from '../engine/matching.js';
import { AccountManager } from '../engine/accounts.js';
import { MarketManager } from '../engine/market.js';
import { MarketClock } from '../engine/clock.js';

console.log('[TEST] Starting Closing Call Auction & MOC/LOC Order Execution Test Suite (Release v0.910)...\n');

// -------------------------------------------------------------------------------------------------
// Test 1: MOC (Market-On-Close) Order Priority & Volume Maximization
// -------------------------------------------------------------------------------------------------
console.log('Test 1: MOC Order Priority & Volume-Maximizing Clearing Price P*');
{
  const ob = new OrderBook('BYTE');

  // Add resting limit orders in the book
  ob.addPreMarketLimitOrder({ id: 'b_limit1', userId: 'u1', userName: 'Trader 1', side: 'BUY', type: 'LIMIT', price: 100, quantity: 200 });
  ob.addPreMarketLimitOrder({ id: 's_limit1', userId: 'u2', userName: 'Trader 2', side: 'SELL', type: 'LIMIT', price: 98, quantity: 300 });
  ob.addPreMarketLimitOrder({ id: 's_limit2', userId: 'u3', userName: 'Trader 3', side: 'SELL', type: 'LIMIT', price: 100, quantity: 400 });

  // Add MOC Buy order (500 shares)
  ob.addClosingOrder({
    id: 'moc_b1',
    userId: 'u4',
    userName: 'MOC Buyer',
    side: 'BUY',
    type: 'MOC',
    quantity: 500
  });

  // Calculate indicative closing auction price
  // Candidate prices: 98, 100
  // At P = 98:
  //   Buy Vol: MOC (500) + Limit 100 (200) = 700
  //   Sell Vol: Limit 98 (300) = 300 -> Executable = 300
  // At P = 100:
  //   Buy Vol: MOC (500) + Limit 100 (200) = 700
  //   Sell Vol: Limit 98 (300) + Limit 100 (400) = 700 -> Executable = 700 (Max Volume!)
  const indicative = ob.calculateClosingAuctionPrice(100);
  assert.strictEqual(indicative.clearingPrice, 100);
  assert.strictEqual(indicative.clearingVolume, 700);
  assert.strictEqual(indicative.imbalance, 0);

  // Execute closing auction
  const result = ob.executeClosingAuction(100);
  assert.strictEqual(result.clearingPrice, 100);
  assert.strictEqual(result.clearingVolume, 700);
  assert.strictEqual(result.trades.length >= 2, true);

  // Verify MOC order was prioritized and filled completely (500 shares)
  const mocBuyTrades = result.trades.filter(t => t.takerOrderId === 'moc_b1' || t.makerOrderId === 'moc_b1');
  const mocFilledQty = mocBuyTrades.reduce((sum, t) => sum + t.quantity, 0);
  assert.strictEqual(mocFilledQty, 500, 'MOC Buy order must be filled for all 500 shares');

  console.log(`  Clearing Price: $${result.clearingPrice} | Volume: ${result.clearingVolume} shares`);
  console.log('  [PASS] MOC orders receive top execution priority in closing cross\n');
}

// -------------------------------------------------------------------------------------------------
// Test 2: LOC (Limit-On-Close) Price Boundary Enforcement
// -------------------------------------------------------------------------------------------------
console.log('Test 2: LOC (Limit-On-Close) Boundary Conditions');
{
  const ob = new OrderBook('SEMI');

  // Resting sellers: 200 shares @ $100
  ob.processOrder({ id: 's1', userId: 'u1', userName: 'Seller 1', side: 'SELL', type: 'LIMIT', price: 100, quantity: 200 });

  // LOC Buy 1: Limit $102 (willing to buy if P* <= 102) -> Should execute!
  ob.addClosingOrder({
    id: 'loc_in_money',
    userId: 'u2',
    userName: 'LOC Winner',
    side: 'BUY',
    type: 'LOC',
    price: 102,
    quantity: 150
  });

  // LOC Buy 2: Limit $95 (willing to buy only if P* <= 95) -> Out of the money!
  ob.addClosingOrder({
    id: 'loc_out_money',
    userId: 'u3',
    userName: 'LOC Out of Money',
    side: 'BUY',
    type: 'LOC',
    price: 95,
    quantity: 100
  });

  const result = ob.executeClosingAuction(100);
  assert.strictEqual(result.clearingPrice, 100);
  assert.strictEqual(result.clearingVolume, 150);

  // In-the-money LOC order filled
  const locWinnerTrade = result.trades.find(t => t.takerOrderId === 'loc_in_money' || t.makerOrderId === 'loc_in_money');
  assert.notStrictEqual(locWinnerTrade, undefined);
  assert.strictEqual(locWinnerTrade.quantity, 150);

  // Out-of-the-money LOC order must NOT execute and be expired
  const locLoserTrade = result.trades.find(t => t.takerOrderId === 'loc_out_money' || t.makerOrderId === 'loc_out_money');
  assert.strictEqual(locLoserTrade, undefined);

  const expiredLoser = result.expiredOrders.find(o => o.id === 'loc_out_money');
  assert.notStrictEqual(expiredLoser, undefined);
  assert.strictEqual(expiredLoser.status, 'EXPIRED');

  console.log(`  In-the-money LOC ($102 lim) filled @ $${result.clearingPrice}`);
  console.log(`  Out-of-the-money LOC ($95 lim) expired without execution`);
  console.log('  [PASS] LOC limit price boundaries strictly enforced\n');
}

// -------------------------------------------------------------------------------------------------
// Test 3: Uniform Single Clearing Price Across All Executed Order Classes
// -------------------------------------------------------------------------------------------------
console.log('Test 3: Single Uniform Clearing Price Execution Across Order Classes');
{
  const ob = new OrderBook('AERO');

  // Mix of MOC, LOC, and standard resting limit orders
  ob.addPreMarketLimitOrder({ id: 'l_bid', userId: 'u1', userName: 'Lim Bid', side: 'BUY', type: 'LIMIT', price: 105, quantity: 100 });
  ob.addClosingOrder({ id: 'moc_bid', userId: 'u2', userName: 'MOC Bid', side: 'BUY', type: 'MOC', quantity: 100 });
  ob.addClosingOrder({ id: 'loc_bid', userId: 'u3', userName: 'LOC Bid', side: 'BUY', type: 'LOC', price: 103, quantity: 100 });

  ob.addPreMarketLimitOrder({ id: 'l_ask', userId: 'u4', userName: 'Lim Ask', side: 'SELL', type: 'LIMIT', price: 101, quantity: 150 });
  ob.addClosingOrder({ id: 'moc_ask', userId: 'u5', userName: 'MOC Ask', side: 'SELL', type: 'MOC', quantity: 150 });

  const result = ob.executeClosingAuction(102);
  assert.strictEqual(result.clearingVolume, 300);
  assert.strictEqual(typeof result.clearingPrice, 'number');

  // Verify that EVERY trade executed at the EXACT same uniform clearing price
  for (const trade of result.trades) {
    assert.strictEqual(trade.price, result.clearingPrice, 'All cross executions must match at uniform clearing price');
    assert.strictEqual(trade.takerSide, 'CLOSING_AUCTION');
    assert.strictEqual(trade.isClosingAuction, true);
  }

  console.log(`  All ${result.trades.length} trades matched at single clearing price: $${result.clearingPrice}`);
  console.log('  [PASS] Uniform clearing price guaranteed across all crossing order types\n');
}

// -------------------------------------------------------------------------------------------------
// Test 4: Automatic Expiration & Collateral Unlock for Unfilled Closing Orders
// -------------------------------------------------------------------------------------------------
console.log('Test 4: Automatic Expiration and Collateral Refund for Unfilled MOC/LOC Orders');
{
  const clock = new MarketClock();
  const accountManager = new AccountManager();
  const matchingEngine = new MatchingEngine(accountManager, clock);

  // Setup user with 100,000 CR
  const user = accountManager.getOrCreateUser('u_trader', 'Alice', false, 100000);
  const initialCredits = user.credits;

  // Submit MOC Buy for 500 shares of AUTO
  // Current mid = 100, est = 105 -> pre-locks 105 * 500 = 52,500 CR
  const submitRes = matchingEngine.submitOrder({
    userId: 'u_trader',
    userName: 'Alice',
    symbol: 'AUTO',
    side: 'BUY',
    type: 'MOC',
    quantity: 500
  });
  assert.strictEqual(submitRes.success, true);
  assert.strictEqual(user.lockedCredits > 0, true, 'Capital must be locked for active MOC buy order');

  // There are NO sellers in the book, so auction clears 0 volume
  const closeResult = matchingEngine.executeClosingAuction('AUTO', 100.00);
  assert.strictEqual(closeResult.clearingVolume, 0);
  assert.strictEqual(closeResult.expiredCount, 1);

  // Verify user's locked credits are fully returned
  assert.strictEqual(user.lockedCredits, 0, 'Locked credits must return to 0 after order expiration');
  assert.strictEqual(user.credits, initialCredits, 'Total available credits restored to initial balance');

  console.log(`  Initial Credits: $${initialCredits} -> Locked: $52,500 -> Restored: $${user.credits}`);
  console.log('  [PASS] Unfilled closing orders expired cleanly with zero capital leakage\n');
}

// -------------------------------------------------------------------------------------------------
// Test 5: Full Market Cycle Integration & Official closePrice Establishment
// -------------------------------------------------------------------------------------------------
console.log('Test 5: Market Clock CLOSING_BELL Integration & closePrice Establishment');
{
  const clock = new MarketClock();
  const accountManager = new AccountManager();
  const matchingEngine = new MatchingEngine(accountManager, clock);
  const marketManager = new MarketManager(clock, matchingEngine);

  // Create two traders
  accountManager.getOrCreateUser('buyer_close', 'Buyer Close', false, 200000);
  accountManager.getOrCreateUser('seller_close', 'Seller Close', false, 200000);
  const seller = accountManager.getUser('seller_close');
  seller.holdings.set('MEDL', { quantity: 1000, avgPrice: 80.00, lockedQty: 0, shortQuantity: 0, shortAvgPrice: 0, lockedShortQty: 0 });

  // Place crossing MOC orders
  matchingEngine.submitOrder({
    userId: 'buyer_close',
    userName: 'Buyer Close',
    symbol: 'MEDL',
    side: 'BUY',
    type: 'MOC',
    quantity: 300
  });

  matchingEngine.submitOrder({
    userId: 'seller_close',
    userName: 'Seller Close',
    symbol: 'MEDL',
    side: 'SELL',
    type: 'LOC',
    price: 85.00,
    quantity: 300
  });

  const medlComp = marketManager.companies.get('MEDL');
  medlComp.price = 85.00;

  // Trigger Closing Bell
  clock.emit('bellRing', { bell: 'CLOSING_BELL', day: 1 });

  // Verify company closePrice was set
  assert.strictEqual(medlComp.closePrice, 85.00, 'Company closePrice must be established by closing auction');
  assert.strictEqual(medlComp.price, 85.00);

  // Trigger New Day
  clock.emit('newDay', { day: 2 });
  assert.strictEqual(medlComp.previousClose, 85.00, 'New day previousClose must inherit official closing auction price');

  console.log(`  Closing Auction Clearing Price: $${medlComp.closePrice}`);
  console.log(`  Day 2 Opening Reference (previousClose): $${medlComp.previousClose}`);
  console.log('  [PASS] Full closing bell lifecycle successfully establishes official market close\n');
}

console.log('=================================================================================');
console.log('[SUCCESS] ALL 5 CLOSING CALL AUCTION & MOC/LOC TESTS PASSED (100%)!');
console.log('=================================================================================\n');
process.exit(0);
