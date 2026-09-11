import assert from 'assert';
import { OrderBook } from '../engine/orderbook.js';
import { MatchingEngine } from '../engine/matching.js';
import { AccountManager } from '../engine/accounts.js';
import { MarketManager } from '../engine/market.js';
import { MarketClock } from '../engine/clock.js';
import { MarketMaker } from '../traders/market-maker.js';

console.log('[TEST] Starting Order Book Imbalance (OBI) & Adverse Selection Test Suite (Release v0.909)...\n');

// -------------------------------------------------------------------------------------------------
// Test 1: Order Book Imbalance (OBI) Mathematical Boundary Conditions [-1.0, +1.0]
// -------------------------------------------------------------------------------------------------
console.log('Test 1: Order Book Imbalance (OBI) Boundary Conditions [-1.0, +1.0]');
{
  const ob = new OrderBook('BYTE');

  // Case 1A: Empty book
  const emptyImbalance = ob.getOrderBookImbalance(5);
  assert.strictEqual(emptyImbalance.obi, 0, 'Empty book OBI must be exactly 0.0');
  assert.strictEqual(emptyImbalance.bidVolume, 0, 'Empty book bid volume must be 0');
  assert.strictEqual(emptyImbalance.askVolume, 0, 'Empty book ask volume must be 0');
  assert.strictEqual(emptyImbalance.totalVolume, 0, 'Empty book total volume must be 0');

  // Case 1B: Pure bids (no asks)
  ob.processOrder({ id: 'b1', userId: 'u1', side: 'BUY', type: 'LIMIT', price: 100, quantity: 400 });
  ob.processOrder({ id: 'b2', userId: 'u1', side: 'BUY', type: 'LIMIT', price: 99, quantity: 200 });
  const pureBidsImbalance = ob.getOrderBookImbalance(5);
  assert.strictEqual(pureBidsImbalance.obi, 1.0, 'Pure bid book must have OBI = +1.0');
  assert.strictEqual(pureBidsImbalance.bidVolume, 600);
  assert.strictEqual(pureBidsImbalance.askVolume, 0);

  // Case 1C: Pure asks (no bids)
  const obAsks = new OrderBook('BYTE');
  obAsks.processOrder({ id: 'a1', userId: 'u2', side: 'SELL', type: 'LIMIT', price: 105, quantity: 350 });
  const pureAsksImbalance = obAsks.getOrderBookImbalance(5);
  assert.strictEqual(pureAsksImbalance.obi, -1.0, 'Pure ask book must have OBI = -1.0');
  assert.strictEqual(pureAsksImbalance.bidVolume, 0);
  assert.strictEqual(pureAsksImbalance.askVolume, 350);

  // Case 1D: Perfectly balanced volume
  const obBalanced = new OrderBook('BYTE');
  obBalanced.processOrder({ id: 'b1', userId: 'u1', side: 'BUY', type: 'LIMIT', price: 100, quantity: 500 });
  obBalanced.processOrder({ id: 'a1', userId: 'u2', side: 'SELL', type: 'LIMIT', price: 102, quantity: 500 });
  const balancedImbalance = obBalanced.getOrderBookImbalance(5);
  assert.strictEqual(balancedImbalance.obi, 0.0, 'Balanced volume must produce OBI = 0.0');

  // Case 1E: Exact proportional skew (75% bids, 25% asks -> OBI = +0.50)
  const obSkewed = new OrderBook('BYTE');
  obSkewed.processOrder({ id: 'b1', userId: 'u1', side: 'BUY', type: 'LIMIT', price: 100, quantity: 750 });
  obSkewed.processOrder({ id: 'a1', userId: 'u2', side: 'SELL', type: 'LIMIT', price: 102, quantity: 250 });
  const skewedImbalance = obSkewed.getOrderBookImbalance(5);
  assert.strictEqual(skewedImbalance.obi, 0.50, '750 vs 250 must produce OBI = +0.50');
  assert.strictEqual(skewedImbalance.totalVolume, 1000);

  console.log('  [PASS] All boundary conditions and proportional OBI values verified strictly\n');
}

// -------------------------------------------------------------------------------------------------
// Test 2: Top-K Depth Windowing
// -------------------------------------------------------------------------------------------------
console.log('Test 2: Top-K Depth Level Aggregation Windowing');
{
  const ob = new OrderBook('SEMI');
  // Add 6 distinct bid levels: 100, 99, 98, 97, 96, 95 (100 shares each = 600 total)
  for (let i = 0; i < 6; i++) {
    ob.processOrder({ id: `b_${i}`, userId: 'u1', side: 'BUY', type: 'LIMIT', price: 100 - i, quantity: 100 });
  }
  // Add 6 distinct ask levels: 102, 103, 104, 105, 106, 107 (50 shares each = 300 total)
  for (let i = 0; i < 6; i++) {
    ob.processOrder({ id: `a_${i}`, userId: 'u2', side: 'SELL', type: 'LIMIT', price: 102 + i, quantity: 50 });
  }

  // Top 3 levels:
  // Bids: 100, 99, 98 -> 300 shares
  // Asks: 102, 103, 104 -> 150 shares
  // OBI_top3 = (300 - 150) / 450 = 150 / 450 = +0.3333
  const top3 = ob.getOrderBookImbalance(3);
  assert.strictEqual(top3.bidVolume, 300);
  assert.strictEqual(top3.askVolume, 150);
  assert.strictEqual(top3.totalVolume, 450);
  assert.strictEqual(top3.obi, 0.3333);

  // Top 5 levels:
  // Bids: 500 shares
  // Asks: 250 shares
  // OBI_top5 = (500 - 250) / 750 = 250 / 750 = +0.3333
  const top5 = ob.getOrderBookImbalance(5);
  assert.strictEqual(top5.bidVolume, 500);
  assert.strictEqual(top5.askVolume, 250);
  assert.strictEqual(top5.totalVolume, 750);
  assert.strictEqual(top5.obi, 0.3333);

  console.log('  [PASS] Top-K windowing accurately isolates leading book depth levels\n');
}

// -------------------------------------------------------------------------------------------------
// Test 3: Microprice (Volume-Weighted Midpoint) Leading Price Dynamics
// -------------------------------------------------------------------------------------------------
console.log('Test 3: Volume-Weighted Microprice Leading Indicator');
{
  const ob = new OrderBook('AUTO');
  const bestBid = 100.00;
  const bestAsk = 102.00;
  const midPrice = 101.00;

  // Heavy Buy Imbalance (3:1): Bid Vol = 300, Ask Vol = 100
  // P_micro = (bestAsk * bidVol + bestBid * askVol) / totalVol = (102*300 + 100*100) / 400 = 40600 / 400 = 101.50
  ob.processOrder({ id: 'b1', userId: 'u1', side: 'BUY', type: 'LIMIT', price: bestBid, quantity: 300 });
  ob.processOrder({ id: 'a1', userId: 'u2', side: 'SELL', type: 'LIMIT', price: bestAsk, quantity: 100 });

  const buyHeavy = ob.getOrderBookImbalance(5);
  assert.strictEqual(buyHeavy.microPrice, 101.50);
  assert(buyHeavy.microPrice > midPrice, 'Microprice must skew toward ask under heavy buy pressure');

  // Heavy Sell Imbalance (1:3): Bid Vol = 100, Ask Vol = 300
  // P_micro = (102*100 + 100*300) / 400 = 40200 / 400 = 100.50
  const ob2 = new OrderBook('AUTO');
  ob2.processOrder({ id: 'b1', userId: 'u1', side: 'BUY', type: 'LIMIT', price: bestBid, quantity: 100 });
  ob2.processOrder({ id: 'a1', userId: 'u2', side: 'SELL', type: 'LIMIT', price: bestAsk, quantity: 300 });

  const sellHeavy = ob2.getOrderBookImbalance(5);
  assert.strictEqual(sellHeavy.microPrice, 100.50);
  assert(sellHeavy.microPrice < midPrice, 'Microprice must skew toward bid under heavy sell pressure');

  console.log(`  Buy pressure microprice: $${buyHeavy.microPrice} (Mid: $${midPrice}) -> Predicts upward move`);
  console.log(`  Sell pressure microprice: $${sellHeavy.microPrice} (Mid: $${midPrice}) -> Predicts downward move`);
  console.log('  [PASS] Volume-weighted microprice correctly signals order book flow direction\n');
}

// -------------------------------------------------------------------------------------------------
// Test 4: Market Maker Adverse Selection Asymmetric Quoting Under OBI Signals
// -------------------------------------------------------------------------------------------------
console.log('Test 4: Market Maker Adverse Selection Quoting Under Flow Imbalances');
{
  const clock = new MarketClock();
  const accountManager = new AccountManager();
  const matchingEngine = new MatchingEngine(accountManager);
  const marketManager = new MarketManager(clock, matchingEngine);

  // Create market maker
  const mm = new MarketMaker('mm_test', 'Apex MM', matchingEngine, marketManager, accountManager, clock);

  // Setup company with baseline $100 price
  const comp = marketManager.companies.get('BYTE');
  comp.price = 100.00;
  comp.intrinsicValue = 100.00;

  // Case 4A: Baseline neutral book (OBI = 0)
  const neutralParams = mm.calculateReservationAndSpreads('BYTE');
  assert.strictEqual(neutralParams.obi, 0, 'Neutral book OBI should be 0');
  assert.strictEqual(neutralParams.bidSpreadMultiplier, 1.0, 'Neutral bid spread multiplier must be 1.0');
  assert.strictEqual(neutralParams.askSpreadMultiplier, 1.0, 'Neutral ask spread multiplier must be 1.0');
  assert.strictEqual(neutralParams.bidQtyMultiplier, 1.0, 'Neutral bid qty multiplier must be 1.0');
  assert.strictEqual(neutralParams.askQtyMultiplier, 1.0, 'Neutral ask qty multiplier must be 1.0');

  // Case 4B: Heavy buying pressure in book (e.g. OBI = +0.60)
  const book = matchingEngine.getOrderBook('BYTE');
  book.processOrder({ id: 'ext_b1', userId: 'whale1', side: 'BUY', type: 'LIMIT', price: 99.50, quantity: 800 });
  book.processOrder({ id: 'ext_a1', userId: 'retail1', side: 'SELL', type: 'LIMIT', price: 100.50, quantity: 200 });

  const buyFlowImbalance = matchingEngine.getOrderBookImbalance('BYTE', 5);
  assert.strictEqual(buyFlowImbalance.obi, 0.60, 'OBI should be +0.60');

  const buyAdverseParams = mm.calculateReservationAndSpreads('BYTE');
  assert.strictEqual(buyAdverseParams.obi, 0.60);
  assert(buyAdverseParams.obiSkew > 0, 'OBI skew must be positive under buy pressure');
  assert(buyAdverseParams.reservationPrice > neutralParams.reservationPrice, 'Reservation price must adjust upward');
  assert(buyAdverseParams.askSpreadMultiplier > 1.0, 'Ask spread must widen to protect against adverse selection');
  assert(buyAdverseParams.bidSpreadMultiplier < 1.0, 'Bid spread must tighten to capture incoming flow');
  assert(buyAdverseParams.askQtyMultiplier < 1.0, 'Ask quote size must reduce to mitigate adverse fills');
  assert(buyAdverseParams.bidQtyMultiplier > 1.0, 'Bid quote size must increase');

  console.log(`  Buying Flow (OBI = +${buyAdverseParams.obi}):`);
  console.log(`    Reservation Price: $${buyAdverseParams.reservationPrice} (Baseline: $${neutralParams.reservationPrice})`);
  console.log(`    Ask Spread Multiplier: ${buyAdverseParams.askSpreadMultiplier}x (Widened)`);
  console.log(`    Bid Spread Multiplier: ${buyAdverseParams.bidSpreadMultiplier}x (Tightened)`);
  console.log(`    Ask Qty Multiplier: ${buyAdverseParams.askQtyMultiplier}x | Bid Qty Multiplier: ${buyAdverseParams.bidQtyMultiplier}x`);

  // Case 4C: Heavy selling pressure in book (e.g. OBI = -0.60)
  book.cancelOrder('ext_b1');
  book.cancelOrder('ext_a1');
  book.processOrder({ id: 'ext_b2', userId: 'retail1', side: 'BUY', type: 'LIMIT', price: 99.50, quantity: 200 });
  book.processOrder({ id: 'ext_a2', userId: 'whale1', side: 'SELL', type: 'LIMIT', price: 100.50, quantity: 800 });

  const sellFlowImbalance = matchingEngine.getOrderBookImbalance('BYTE', 5);
  assert.strictEqual(sellFlowImbalance.obi, -0.60, 'OBI should be -0.60');

  const sellAdverseParams = mm.calculateReservationAndSpreads('BYTE');
  assert.strictEqual(sellAdverseParams.obi, -0.60);
  assert(sellAdverseParams.obiSkew < 0, 'OBI skew must be negative under sell pressure');
  assert(sellAdverseParams.reservationPrice < neutralParams.reservationPrice, 'Reservation price must adjust downward');
  assert(sellAdverseParams.bidSpreadMultiplier > 1.0, 'Bid spread must widen to protect against falling knife');
  assert(sellAdverseParams.askSpreadMultiplier < 1.0, 'Ask spread must tighten to offload inventory');
  assert(sellAdverseParams.bidQtyMultiplier < 1.0, 'Bid quote size must reduce');
  assert(sellAdverseParams.askQtyMultiplier > 1.0, 'Ask quote size must increase');

  console.log(`  Selling Flow (OBI = ${sellAdverseParams.obi}):`);
  console.log(`    Reservation Price: $${sellAdverseParams.reservationPrice} (Baseline: $${neutralParams.reservationPrice})`);
  console.log(`    Bid Spread Multiplier: ${sellAdverseParams.bidSpreadMultiplier}x (Widened)`);
  console.log(`    Ask Spread Multiplier: ${sellAdverseParams.askSpreadMultiplier}x (Tightened)`);
  console.log(`    Bid Qty Multiplier: ${sellAdverseParams.bidQtyMultiplier}x | Ask Qty Multiplier: ${sellAdverseParams.askQtyMultiplier}x`);

  console.log('  [PASS] Market maker quotes adapt dynamically to protect against adverse selection\n');
}

// -------------------------------------------------------------------------------------------------
// Test 5: Avellaneda-Stoikov Inventory Rebalancing Interplay
// -------------------------------------------------------------------------------------------------
console.log('Test 5: Avellaneda-Stoikov Inventory Rebalancing & Reservation Price');
{
  const clock = new MarketClock();
  const accountManager = new AccountManager();
  const matchingEngine = new MatchingEngine(accountManager);
  const marketManager = new MarketManager(clock, matchingEngine);

  const mm = new MarketMaker('mm_inv_test', 'Citadel MM', matchingEngine, marketManager, accountManager, clock);
  const user = accountManager.getOrCreateUser('mm_inv_test', 'Citadel MM', false);
  const comp = marketManager.companies.get('NBNK');
  comp.price = 50.00;
  comp.intrinsicValue = 50.00;

  // Case 5A: Excess inventory (6,000 shares vs 5,000 target)
  user.holdings.set('NBNK', { quantity: 6000, avgCost: 50.00 });
  const excessParams = mm.calculateReservationAndSpreads('NBNK');
  assert(excessParams.inventorySkew < 0, 'Excess inventory must produce negative inventory skew');
  assert(excessParams.reservationPrice < 50.00, 'Reservation price must skew below fair price to attract buyers');

  // Case 5B: Inventory deficit (4,000 shares vs 5,000 target)
  user.holdings.set('NBNK', { quantity: 4000, avgCost: 50.00 });
  const deficitParams = mm.calculateReservationAndSpreads('NBNK');
  assert(deficitParams.inventorySkew > 0, 'Deficit inventory must produce positive inventory skew');
  assert(deficitParams.reservationPrice > 50.00, 'Reservation price must skew above fair price to attract sellers');

  console.log(`  Excess Inventory (6,000 sh): Reservation Price = $${excessParams.reservationPrice} (Skew: $${excessParams.inventorySkew})`);
  console.log(`  Deficit Inventory (4,000 sh): Reservation Price = $${deficitParams.reservationPrice} (Skew: +$${deficitParams.inventorySkew})`);
  console.log('  [PASS] Inventory rebalancing dynamics correctly penalize holding risks\n');
}

console.log('=================================================================================');
console.log('[SUCCESS] ALL 5 ORDER BOOK IMBALANCE & ADVERSE SELECTION TESTS PASSED (100%)!');
console.log('=================================================================================\n');
process.exit(0);
