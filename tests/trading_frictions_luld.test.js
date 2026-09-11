import assert from 'assert';
import { MarketClock } from '../engine/clock.js';
import { MatchingEngine } from '../engine/matching.js';
import { AccountManager } from '../engine/accounts.js';

console.log('[TEST] Starting Release v0.916 Trading Frictions, Exchange Fees & LULD Suite...\n');

async function runTests() {
  // -----------------------------------------------------------------------------------------------
  // Test 1: Exchange Transaction Costs & Maker-Taker Fee Schedule
  // -----------------------------------------------------------------------------------------------
  console.log('Test 1: Maker-Taker Fee Schedule & Regulatory Deductions');
  {
    const accountManager = new AccountManager();
    const clock = new MarketClock();
    const matchingEngine = new MatchingEngine(accountManager, clock);

    const buyer = accountManager.getOrCreateUser('usr_fee_buy', 'Buyer', false);
    const seller = accountManager.getOrCreateUser('usr_fee_sell', 'Seller', false);
    buyer.credits = 100000;
    seller.credits = 100000;
    seller.holdings.set('AUTO', { quantity: 500, avgPrice: 400 });

    // Calculate fee schedule independently
    const notional = 100 * 450; // $45,000
    const expectedTaker = accountManager.calculateTransactionFee({ notional, quantity: 100, isTaker: true });
    // 45,000 * 0.0003 ($13.50) + 100 * 0.005 ($0.50) = $14.00
    assert.strictEqual(expectedTaker, 14.00, `Expected taker fee $14.00, got ${expectedTaker}`);

    const expectedMaker = accountManager.calculateTransactionFee({ notional, quantity: 100, isTaker: false });
    // 45,000 * 0.0001 = $4.50
    assert.strictEqual(expectedMaker, 4.50, `Expected maker fee $4.50, got ${expectedMaker}`);

    // Seller places resting limit sell at 450 (MAKER)
    const sellRes = matchingEngine.submitOrder({
      userId: seller.id,
      userName: seller.name,
      symbol: 'AUTO',
      side: 'SELL',
      type: 'LIMIT',
      price: 450.00,
      quantity: 100
    });
    assert(sellRes.success);

    // Buyer places aggressive market buy (TAKER)
    const buyRes = matchingEngine.submitOrder({
      userId: buyer.id,
      userName: buyer.name,
      symbol: 'AUTO',
      side: 'BUY',
      type: 'MARKET',
      quantity: 100
    });
    assert(buyRes.success);
    assert.strictEqual(buyRes.trades.length, 1);

    // Buyer paid notional ($45,000) + taker fee ($14.00) = $45,014.00
    assert.strictEqual(buyer.credits, +(100000 - 45000 - 14.00).toFixed(2));
    assert.strictEqual(buyer.totalFeesPaid, 14.00);

    // Seller received notional ($45,000) - maker fee ($4.50) = $44,995.50
    assert.strictEqual(seller.credits, +(100000 + 45000 - 4.50).toFixed(2));
    assert.strictEqual(seller.totalFeesPaid, 4.50);

    // Verify trade receipts recorded fees
    assert.strictEqual(buyer.tradeHistory[0].fee, 14.00);
    assert.strictEqual(buyer.tradeHistory[0].role, 'TAKER');
    assert.strictEqual(seller.tradeHistory[0].fee, 4.50);
    assert.strictEqual(seller.tradeHistory[0].role, 'MAKER');

    console.log(`  Notional: $${notional} | Taker Fee: $${expectedTaker} (Buyer) | Maker Fee: $${expectedMaker} (Seller)`);
    console.log('  [PASS] Maker-taker fee schedule and account deductions accurately verified\n');
  }

  // -----------------------------------------------------------------------------------------------
  // Test 2: Tiered Short Stock Borrow Financing Costs (ETB vs. HTB)
  // -----------------------------------------------------------------------------------------------
  console.log('Test 2: Tiered Short Borrow Financing Fees (ETB 1% vs. HTB 12%)');
  {
    const accountManager = new AccountManager();
    assert.strictEqual(accountManager.getBorrowRate('NBNK'), 0.01, 'NBNK must be Easy-To-Borrow (1.0% annual)');
    assert.strictEqual(accountManager.getBorrowRate('AUTO'), 0.01, 'AUTO must be Easy-To-Borrow (1.0% annual)');
    assert.strictEqual(accountManager.getBorrowRate('SOLR'), 0.12, 'SOLR must be Hard-To-Borrow (12.0% annual)');
    assert.strictEqual(accountManager.getBorrowRate('STRM'), 0.12, 'STRM must be Hard-To-Borrow (12.0% annual)');

    const shortTrader = accountManager.getOrCreateUser('usr_short_fee', 'Short Trader', false);
    shortTrader.credits = 50000;

    // Simulate active short positions
    shortTrader.holdings.set('NBNK', { quantity: 0, avgPrice: 0, shortQuantity: 1000, shortAvgPrice: 60.00 }); // $60,000 ETB
    shortTrader.holdings.set('SOLR', { quantity: 0, avgPrice: 0, shortQuantity: 1000, shortAvgPrice: 60.00 }); // $60,000 HTB

    // Accrue 30 days of borrow fees for NBNK (ETB: 1% annual -> 60,000 * 0.01 * 30 / 365 = $49.32)
    const feeETB = accountManager.accrueShortBorrowFee(shortTrader.id, 'NBNK', 60.00, 30);
    assert.strictEqual(feeETB, 49.32);

    // Accrue 30 days of borrow fees for SOLR (HTB: 12% annual -> 60,000 * 0.12 * 30 / 365 = $591.78)
    const feeHTB = accountManager.accrueShortBorrowFee(shortTrader.id, 'SOLR', 60.00, 30);
    assert.strictEqual(feeHTB, 591.78);

    assert.strictEqual(shortTrader.totalBorrowFeesPaid, +(49.32 + 591.78).toFixed(2));
    assert.strictEqual(shortTrader.credits, +(50000 - 49.32 - 591.78).toFixed(2));

    console.log(`  ETB 30-Day Borrow Fee (NBNK 1%): $${feeETB} | HTB 30-Day Borrow Fee (SOLR 12%): $${feeHTB}`);
    console.log('  [PASS] Hard-to-borrow stock loan financing accurately penalizes short liabilities\n');
  }

  // -----------------------------------------------------------------------------------------------
  // Test 3: Limit-Up / Limit-Down (LULD) Bands & Automated Trading Halts
  // -----------------------------------------------------------------------------------------------
  console.log('Test 3: LULD Price Bands (+/- 8%) and Automated 30s Trading Halts');
  {
    const accountManager = new AccountManager();
    const clock = new MarketClock();
    const matchingEngine = new MatchingEngine(accountManager, clock);

    const book = matchingEngine.getOrderBook('BYTE');
    book.setReferencePrice(100.00);

    const bands = book.getLULDBands();
    assert.strictEqual(bands.referencePrice, 100.00);
    assert.strictEqual(bands.upperBand, 108.00, 'Upper band must be +8% ($108.00)');
    assert.strictEqual(bands.lowerBand, 92.00, 'Lower band must be -8% ($92.00)');
    assert.strictEqual(book.isHalted(), false);

    let haltEventReceived = false;
    matchingEngine.once('circuitBreaker:halt', (data) => {
      if (data.symbol === 'BYTE') haltEventReceived = true;
    });

    const buyer = accountManager.getOrCreateUser('usr_luld_buyer', 'LULD Buyer', false);
    buyer.credits = 100000;

    // Submit Limit Buy breaching the Upper Band at $112.00 (> $108.00)
    const res = matchingEngine.submitOrder({
      userId: buyer.id,
      userName: buyer.name,
      symbol: 'BYTE',
      side: 'BUY',
      type: 'LIMIT',
      price: 112.00,
      quantity: 50
    });

    assert(res.success);
    assert.strictEqual(res.isHalted, true);
    assert.strictEqual(res.remainingOrder.price, 112.00);
    assert.strictEqual(book.isHalted(), true, 'Symbol must transition to HALTED state');
    assert.strictEqual(haltEventReceived, true, 'circuitBreaker:halt event must be emitted');

    // Market order during halt must be rejected
    const marketBuyRes = matchingEngine.submitOrder({
      userId: buyer.id,
      userName: buyer.name,
      symbol: 'BYTE',
      side: 'BUY',
      type: 'MARKET',
      quantity: 20
    });
    assert.strictEqual(marketBuyRes.success, false);
    assert(marketBuyRes.error.includes('HALTED'), 'Market order must be rejected during halt');

    // Limit orders during halt accumulate in the book
    const seller = accountManager.getOrCreateUser('usr_luld_seller', 'LULD Seller', false);
    seller.holdings.set('BYTE', { quantity: 200, avgPrice: 100 });
    const limitSellRes = matchingEngine.submitOrder({
      userId: seller.id,
      userName: seller.name,
      symbol: 'BYTE',
      side: 'SELL',
      type: 'LIMIT',
      price: 110.00,
      quantity: 50
    });
    assert(limitSellRes.success);
    assert.strictEqual(limitSellRes.isHalted, true);
    assert.strictEqual(book.asks.length, 1);
    assert.strictEqual(book.bids.length, 1);

    console.log(`  LULD Reference: $100.00 -> Bands: [$${bands.lowerBand} - $${bands.upperBand}] | Breached by $112.00 Buy Order`);
    console.log(`  Halt Status: HALTED (Duration: 30s) | Accumulated Resting Depth: ${book.bids.length} Bid, ${book.asks.length} Ask`);
    console.log('  [PASS] LULD circuit breaker halts trading and rejects aggressive market flow\n');
  }

  // -----------------------------------------------------------------------------------------------
  // Test 4: Reopening Call Auction & Circuit Breaker Resumption
  // -----------------------------------------------------------------------------------------------
  console.log('Test 4: Resumption Call Auction Cross & Trading Resumption');
  {
    const accountManager = new AccountManager();
    const clock = new MarketClock();
    const matchingEngine = new MatchingEngine(accountManager, clock);
    const book = matchingEngine.getOrderBook('BYTE');
    book.setReferencePrice(100.00);

    const buyer = accountManager.getOrCreateUser('usr_reopen_buy', 'Buyer', false);
    const seller = accountManager.getOrCreateUser('usr_reopen_sell', 'Seller', false);
    buyer.credits = 100000;
    seller.holdings.set('BYTE', { quantity: 500, avgPrice: 100 });

    // Force halt
    matchingEngine.triggerSymbolHalt('BYTE', 'LULD_LIMIT_UP', 30);
    assert.strictEqual(book.isHalted(), true);

    // Accumulate crossed orders during halt
    matchingEngine.submitOrder({
      userId: buyer.id,
      userName: buyer.name,
      symbol: 'BYTE',
      side: 'BUY',
      type: 'LIMIT',
      price: 106.00,
      quantity: 100
    });

    matchingEngine.submitOrder({
      userId: seller.id,
      userName: seller.name,
      symbol: 'BYTE',
      side: 'SELL',
      type: 'LIMIT',
      price: 104.00,
      quantity: 100
    });

    let resumeEventReceived = false;
    matchingEngine.once('circuitBreaker:resumed', (data) => {
      if (data.symbol === 'BYTE') resumeEventReceived = true;
    });

    // Execute reopening cross
    const resumeReport = matchingEngine.executeResumptionAuction('BYTE');
    assert(resumeReport);
    assert.strictEqual(resumeReport.symbol, 'BYTE');
    assert.strictEqual(resumeReport.clearingVolume, 100);
    assert.strictEqual(resumeReport.clearingPrice, 104.00);
    assert.strictEqual(book.isHalted(), false, 'Trading status must resume to ACTIVE');
    assert.strictEqual(book.referencePrice, 104.00, 'New LULD reference price must update to clearing price');
    assert.strictEqual(resumeEventReceived, true);

    console.log(`  Resumption Cross: Cleared 100 shares at uniform clearing price $${resumeReport.clearingPrice}`);
    console.log('  [PASS] Halted book resolves via volume-maximizing resumption auction and resets LULD reference\n');
  }

  // -----------------------------------------------------------------------------------------------
  // Test 5: Reg SHO Rule 201 Alternative Uptick Rule Constraints
  // -----------------------------------------------------------------------------------------------
  console.log('Test 5: Reg SHO Rule 201 Alternative Uptick Rule (10% Intraday Drop)');
  {
    const accountManager = new AccountManager();
    const clock = new MarketClock();
    const matchingEngine = new MatchingEngine(accountManager, clock);
    const book = matchingEngine.getOrderBook('STRM');

    const previousClose = 200.00;
    // Price drops by 11% (to $178.00) -> triggers Rule 201
    const triggered = book.checkRegSHO(previousClose, 178.00);
    assert.strictEqual(triggered, true);
    assert.strictEqual(book.regShoTriggered, true);

    // Place resting liquidity to establish National Best Bid (NBB = $177.50)
    const liquidityBuyer = accountManager.getOrCreateUser('usr_liq_b', 'Liq Buyer', false);
    liquidityBuyer.credits = 100000;
    matchingEngine.submitOrder({
      userId: liquidityBuyer.id,
      userName: liquidityBuyer.name,
      symbol: 'STRM',
      side: 'BUY',
      type: 'LIMIT',
      price: 177.50,
      quantity: 50
    });

    const shortSeller = accountManager.getOrCreateUser('usr_short_sho', 'Short Seller', false);
    shortSeller.credits = 100000;

    // Case 5A: Aggressive Market Short Sell -> REJECTED under Reg SHO
    const marketShortRes = matchingEngine.submitOrder({
      userId: shortSeller.id,
      userName: shortSeller.name,
      symbol: 'STRM',
      side: 'SELL',
      type: 'MARKET',
      quantity: 20,
      isShort: true
    });
    assert.strictEqual(marketShortRes.success, false);
    assert(marketShortRes.error.includes('Reg SHO Rule 201'), 'Market short must be rejected');

    // Case 5B: Aggressive Limit Short Sell hitting or below best bid ($177.50) -> REJECTED
    const aggressiveShortRes = matchingEngine.submitOrder({
      userId: shortSeller.id,
      userName: shortSeller.name,
      symbol: 'STRM',
      side: 'SELL',
      type: 'LIMIT',
      price: 177.50, // hitting the bid
      quantity: 20,
      isShort: true
    });
    assert.strictEqual(aggressiveShortRes.success, false);
    assert(aggressiveShortRes.error.includes('Reg SHO Rule 201'), 'Short sale at or below best bid must be rejected');

    // Case 5C: Passive Limit Short Sell strictly ABOVE best bid ($178.00 > $177.50) -> ACCEPTED
    const passiveShortRes = matchingEngine.submitOrder({
      userId: shortSeller.id,
      userName: shortSeller.name,
      symbol: 'STRM',
      side: 'SELL',
      type: 'LIMIT',
      price: 178.00,
      quantity: 20,
      isShort: true
    });
    assert.strictEqual(passiveShortRes.success, true);
    assert.strictEqual(passiveShortRes.order.price, 178.00);

    console.log(`  Best Bid: $177.50 | Short Market: REJECTED | Short @ $177.50: REJECTED | Short @ $178.00: ACCEPTED`);
    console.log('  [PASS] Reg SHO Rule 201 strictly enforces alternative uptick rule upon 10% drawdown\n');
  }

  // -----------------------------------------------------------------------------------------------
  // Test 6: Nonlinear Order Book Sweep Slippage Modeling
  // -----------------------------------------------------------------------------------------------
  console.log('Test 6: Nonlinear Visible Depth Sweep VWAP and Slippage Penalty');
  {
    const accountManager = new AccountManager();
    const clock = new MarketClock();
    const matchingEngine = new MatchingEngine(accountManager, clock);
    const book = matchingEngine.getOrderBook('AERO');

    const seller = accountManager.getOrCreateUser('usr_sweep_seller', 'Seller', false);
    seller.holdings.set('AERO', { quantity: 1000, avgPrice: 100 });

    // Build multi-tier ask ladder:
    // Level 1: 50 sh @ $100.00
    // Level 2: 50 sh @ $101.00
    // Level 3: 50 sh @ $102.00
    book.processOrder({ id: 's1', userId: seller.id, symbol: 'AERO', side: 'SELL', type: 'LIMIT', price: 100.00, quantity: 50 });
    book.processOrder({ id: 's2', userId: seller.id, symbol: 'AERO', side: 'SELL', type: 'LIMIT', price: 101.00, quantity: 50 });
    book.processOrder({ id: 's3', userId: seller.id, symbol: 'AERO', side: 'SELL', type: 'LIMIT', price: 102.00, quantity: 50 });

    // Sweep 100 shares: fills 50 @ 100 + 50 @ 101 -> VWAP = 100.50 (+50 bps slippage)
    const sweep100 = matchingEngine.calculateBookSweepEstimate('AERO', 'BUY', 100);
    assert.strictEqual(sweep100.vwap, 100.50);
    assert.strictEqual(sweep100.slippageBps, 50.0);

    // Sweep 200 shares (exceeds 150 visible depth by 50 shares):
    // 50 @ 100 ($5,000) + 50 @ 101 ($5,050) + 50 @ 102 ($5,100) + 50 @ penalty price ($102 * 1.025 = $104.55) -> higher VWAP
    const sweep200 = matchingEngine.calculateBookSweepEstimate('AERO', 'BUY', 200);
    assert(sweep200.vwap > 101.00, 'Over-sized market order must incur nonlinear market impact slippage');
    assert(sweep200.slippageBps > sweep100.slippageBps, 'Slippage bps must scale nonlinearly with order size relative to depth');

    console.log(`  Sweep 100 sh: VWAP = $${sweep100.vwap} (Slippage: +${sweep100.slippageBps} bps)`);
    console.log(`  Sweep 200 sh (Exceeds depth): VWAP = $${sweep200.vwap} (Slippage: +${sweep200.slippageBps} bps)`);
    console.log('  [PASS] Book sweep accurately models nonlinear market impact and depth depletion\n');
  }

  console.log('=================================================================================');
  console.log('[SUCCESS] ALL 6 TRADING FRICTIONS, FEES, LULD & REG SHO TESTS PASSED (100%)!');
  console.log('=================================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('[FAIL] Trading frictions test suite encountered error:', err);
  process.exit(1);
});
