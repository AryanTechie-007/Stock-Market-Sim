import assert from 'assert';
import { OrderBook } from '../engine/orderbook.js';
import { MatchingEngine } from '../engine/matching.js';
import { MarketManager, INITIAL_COMPANIES } from '../engine/market.js';
import { AccountManager } from '../engine/accounts.js';
import { MarketClock } from '../engine/clock.js';

console.log('[TEST] Starting Opening Auction Mechanism & Call Market Test Suite (Release v0.907)...\n');

async function run() {
  const clock = new MarketClock();
  const accountManager = new AccountManager(500000);
  const symbols = INITIAL_COMPANIES.map(c => c.symbol);
  const matchingEngine = new MatchingEngine(symbols, accountManager, clock);
  const marketManager = new MarketManager(clock, matchingEngine);

  // -------------------------------------------------------------
  // Test 1: Pre-Market Limit Order Accumulation Without Premature Matching
  // -------------------------------------------------------------
  console.log('Test 1: Pre-Market Limit Order Accumulation (No Continuous FIFO Matching)');
  clock.phase = 'PRE_MARKET';
  const bookAuto = matchingEngine.getOrderBook('AUTO');

  // Register users in AccountManager
  accountManager.getOrCreateUser('trader_alice', 'Alice');
  const bob = accountManager.getOrCreateUser('trader_bob', 'Bob');
  bob.holdings.set('AUTO', { quantity: 100, avgPrice: 450, lockedQty: 0 });

  // Submit overlapping buy and sell orders in PRE_MARKET
  // Buyer willing to buy up to 460 CR; Seller willing to sell at 450 CR
  const buyRes = matchingEngine.submitOrder({
    userId: 'trader_alice',
    userName: 'Alice',
    symbol: 'AUTO',
    side: 'BUY',
    type: 'LIMIT',
    price: 460,
    quantity: 50
  });
  assert(buyRes.success, `Pre-market buy limit order must succeed: ${buyRes.error}`);
  assert(buyRes.isPreMarket, 'Order must be flagged as isPreMarket');

  const sellRes = matchingEngine.submitOrder({
    userId: 'trader_bob',
    userName: 'Bob',
    symbol: 'AUTO',
    side: 'SELL',
    type: 'LIMIT',
    price: 450,
    quantity: 50
  });
  assert(sellRes.success, `Pre-market sell limit order must succeed: ${sellRes.error}`);
  assert(sellRes.isPreMarket, 'Order must be flagged as isPreMarket');

  // Verify that despite overlapping prices (Bid 460 >= Ask 450), no continuous trade occurred
  assert.strictEqual(bookAuto.bids.length, 1, 'Bid must rest on the pre-market book');
  assert.strictEqual(bookAuto.asks.length, 1, 'Ask must rest on the pre-market book');
  assert.strictEqual(bookAuto.bids[0].quantity, 50, 'Bid quantity must remain unexecuted');
  assert.strictEqual(bookAuto.asks[0].quantity, 50, 'Ask quantity must remain unexecuted');
  console.log('  [PASS] Overlapping orders successfully accumulated on the book without premature matching\n');

  // -------------------------------------------------------------
  // Test 2: Indicative Equilibrium Price (IEP) & Volume (IEV) Calculation
  // -------------------------------------------------------------
  console.log('Test 2: Indicative Clearing Price (IEP) & Volume (IEV) Computation');
  const indicativeAuto = bookAuto.calculateIndicativeClearingPrice(455);
  console.log(`  AUTO Indicative: Clearing Price = ${indicativeAuto.clearingPrice} CR, Volume = ${indicativeAuto.clearingVolume}, Imbalance = ${indicativeAuto.imbalance} (${indicativeAuto.imbalanceSide})`);
  assert(indicativeAuto.clearingPrice !== null, 'Indicative clearing price must exist for crossed book');
  assert.strictEqual(indicativeAuto.clearingVolume, 50, 'Clearing volume must equal 50 shares');
  assert.strictEqual(indicativeAuto.imbalance, 0, 'Volume imbalance must be 0 for balanced orders');
  console.log('  [PASS] Indicative equilibrium correctly calculated\n');

  // -------------------------------------------------------------
  // Test 3: Mathematical Volume-Maximization & Tie-Breaking
  // -------------------------------------------------------------
  console.log('Test 3: Volume Maximization Algorithm with Multi-Tier Tie-Breaking');
  const testBook = new OrderBook('TEST');
  // Demand schedule (Bids):
  // 100 shares @ 105, 50 shares @ 103, 75 shares @ 101
  testBook.addPreMarketLimitOrder({ id: 'b1', userId: 'u1', userName: 'U1', symbol: 'TEST', side: 'BUY', type: 'LIMIT', price: 105, quantity: 100 });
  testBook.addPreMarketLimitOrder({ id: 'b2', userId: 'u2', userName: 'U2', symbol: 'TEST', side: 'BUY', type: 'LIMIT', price: 103, quantity: 50 });
  testBook.addPreMarketLimitOrder({ id: 'b3', userId: 'u3', userName: 'U3', symbol: 'TEST', side: 'BUY', type: 'LIMIT', price: 101, quantity: 75 });

  // Supply schedule (Asks):
  // 60 shares @ 99, 80 shares @ 102, 60 shares @ 104
  testBook.addPreMarketLimitOrder({ id: 'a1', userId: 'u4', userName: 'U4', symbol: 'TEST', side: 'SELL', type: 'LIMIT', price: 99, quantity: 60 });
  testBook.addPreMarketLimitOrder({ id: 'a2', userId: 'u5', userName: 'U5', symbol: 'TEST', side: 'SELL', type: 'LIMIT', price: 102, quantity: 80 });
  testBook.addPreMarketLimitOrder({ id: 'a3', userId: 'u6', userName: 'U6', symbol: 'TEST', side: 'SELL', type: 'LIMIT', price: 104, quantity: 60 });

  // Evaluation at price levels:
  // At P = 102:
  //   Buy Vol (price >= 102) = 100 (at 105) + 50 (at 103) = 150 shares
  //   Sell Vol (price <= 102) = 60 (at 99) + 80 (at 102) = 140 shares
  //   Executable Vol = min(150, 140) = 140 shares
  //   Imbalance = 150 - 140 = 10 shares (BUY side)
  // At P = 103:
  //   Buy Vol (price >= 103) = 150 shares
  //   Sell Vol (price <= 103) = 140 shares
  //   Executable Vol = 140 shares, Imbalance = 10 shares
  // At reference price 102.20, algorithm breaks tie cleanly
  const testAuction = testBook.calculateIndicativeClearingPrice(102.20);
  console.log(`  TEST Book Auction Result: Clearing Price = ${testAuction.clearingPrice} CR, Volume = ${testAuction.clearingVolume} shares, Imbalance = ${testAuction.imbalance}`);
  assert.strictEqual(testAuction.clearingVolume, 140, 'Clearing volume must be 140 shares');
  assert(testAuction.clearingPrice >= 102 && testAuction.clearingPrice <= 103, 'Clearing price must be in optimal volume range [102, 103]');
  console.log('  [PASS] Volume maximization algorithm correctly evaluated multi-order demand/supply schedule\n');

  // -------------------------------------------------------------
  // Test 4: Single Uniform Clearing Price Execution (P*)
  // -------------------------------------------------------------
  console.log('Test 4: Single Uniform Clearing Price Execution Across All Crossing Trades');
  const uncrossResult = testBook.executeAuctionUncrossing(102.20);
  assert(uncrossResult.trades.length > 0, 'Auction must produce executed trades');
  const P_star = uncrossResult.clearingPrice;
  console.log(`  Clearing Price P* = ${P_star} CR across ${uncrossResult.trades.length} matched trades`);

  let totalAuctionMatched = 0;
  for (const trade of uncrossResult.trades) {
    assert.strictEqual(trade.price, P_star, `Trade ${trade.id} must execute at single uniform clearing price P* (${P_star})`);
    assert.strictEqual(trade.isAuction, true, 'Trade must be flagged as isAuction');
    totalAuctionMatched += trade.quantity;
  }
  assert.strictEqual(totalAuctionMatched, 140, 'Total auctioned shares must match clearing volume (140)');
  console.log('  [PASS] All executed trades executed at exactly the uniform clearing price P*\n');

  // -------------------------------------------------------------
  // Test 5: Resting Residual Orders Maintained in Order Book
  // -------------------------------------------------------------
  console.log('Test 5: Residual Unmatched Orders Retained in Book for Continuous Trading');
  // From earlier: Buy volume at P* was 150, matched was 140 -> 10 shares of buyer b2 should remain
  // Ask volume at P* was 140, matched was 140 -> all asks <= P* filled, ask a3 (60 @ 104) remains
  assert(testBook.bids.length > 0, 'Residual bids must remain in the book');
  assert(testBook.asks.length > 0, 'Residual asks must remain in the book');
  assert.strictEqual(testBook.getBestBid() < testBook.getBestAsk(), true, 'After auction uncrossing, book spread must be uncrossed (bestBid < bestAsk)');
  console.log(`  Uncrossed Book Spread: Best Bid = ${testBook.getBestBid()} CR, Best Ask = ${testBook.getBestAsk()} CR`);
  console.log('  [PASS] Residual orders cleanly preserved with regular bid-ask spread\n');

  // -------------------------------------------------------------
  // Test 6: Automated Multi-Symbol Uncrossing on Opening Bell Transition
  // -------------------------------------------------------------
  console.log('Test 6: Automated Opening Bell Trigger Sets Official Open Price');
  // Transition clock to REGULAR_HOURS (fires OPENING_BELL)
  clock.phase = 'PRE_MARKET';
  const autoCompBefore = marketManager.getCompany('AUTO');
  const initialOpenPrice = autoCompBefore.openPrice;

  // Add crossing orders in AUTO book
  accountManager.getOrCreateUser('auc_buyer_1', 'Auction Buyer');
  const aucSeller = accountManager.getOrCreateUser('auc_seller_1', 'Auction Seller');
  aucSeller.holdings.set('AUTO', { quantity: 50, avgPrice: 450, lockedQty: 0 });

  const bRes = matchingEngine.submitOrder({
    userId: 'auc_buyer_1',
    userName: 'Auction Buyer',
    symbol: 'AUTO',
    side: 'BUY',
    type: 'LIMIT',
    price: 458,
    quantity: 20
  });
  assert(bRes.success, `Buyer order must succeed: ${bRes.error}`);

  const sRes = matchingEngine.submitOrder({
    userId: 'auc_seller_1',
    userName: 'Auction Seller',
    symbol: 'AUTO',
    side: 'SELL',
    type: 'LIMIT',
    price: 452,
    quantity: 20
  });
  assert(sRes.success, `Seller order must succeed: ${sRes.error}`);

  // Ring the opening bell
  clock.phase = 'REGULAR_HOURS';
  clock.emit('bellRing', { bell: 'OPENING_BELL', day: 1 });

  const autoCompAfter = marketManager.getCompany('AUTO');
  console.log(`  AUTO Open Price: Before = ${initialOpenPrice} CR -> After Auction = ${autoCompAfter.openPrice} CR, Volume = ${autoCompAfter.volume}`);
  assert(autoCompAfter.openPrice >= 450 && autoCompAfter.openPrice <= 460, 'Official openPrice must reflect auction clearing price');
  console.log('  [PASS] Opening bell transition successfully executed auction and established official openPrice\n');

  // -------------------------------------------------------------
  // Test 7: REST API Indicative Endpoint Functionality
  // -------------------------------------------------------------
  console.log('Test 7: Indicative Opening API Queries Across Listed Equities');
  const allOpenings = matchingEngine.getAllIndicativeOpenings();
  assert(typeof allOpenings === 'object', 'getAllIndicativeOpenings must return dictionary of symbols');
  for (const sym of ['AUTO', 'SOLR', 'BYTE', 'NBNK', 'MEDL', 'AERO', 'SEMI', 'RETL', 'CYBR', 'STRM']) {
    assert(sym in allOpenings, `Symbol ${sym} must be present in indicative openings`);
    assert(typeof allOpenings[sym].clearingVolume === 'number', `${sym} must have clearingVolume number`);
  }
  console.log('  [PASS] All 10 listed symbols provide real-time indicative call auction metrics\n');

  console.log('===============================================================');
  console.log('[SUCCESS] ALL 7 OPENING AUCTION MECHANISM TESTS PASSED (100%)!');
  console.log('===============================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('[FAIL] Opening Auction Test Suite Encountered Error:', err);
  process.exit(1);
});
