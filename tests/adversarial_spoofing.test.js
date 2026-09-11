import assert from 'assert';
import { MatchingEngine } from '../engine/matching.js';
import { AccountManager } from '../engine/accounts.js';
import { MarketManager } from '../engine/market.js';
import { MarketClock } from '../engine/clock.js';
import { MarketSurveillance } from '../engine/surveillance.js';
import { SpoofingTrader } from '../traders/spoofer.js';
import { MarketMaker } from '../traders/market-maker.js';

console.log('[TEST] Starting Release v0.917 Adversarial Spoofing, Surveillance & Execution Queue Suite...\n');

async function runTests() {
  // -----------------------------------------------------------------------------------------------
  // Test 1: Spoofing Artificial OBI Skew
  // -----------------------------------------------------------------------------------------------
  console.log('Test 1: Spoofing order submission generates artificial Order Book Imbalance (OBI) skew');
  {
    const accounts = new AccountManager(5000000);
    const clock = new MarketClock();
    clock.phase = 'REGULAR_HOURS';
    const matching = new MatchingEngine(['BYTE'], accounts, clock);
    const market = new MarketManager(clock, matching);

    // Setup baseline resting depth: 100 shares bid @ $100.00, 100 shares ask @ $101.00
    accounts.getOrCreateUser('seed_b', 'Seed Buyer');
    const seller = accounts.getOrCreateUser('seed_a', 'Seed Seller');
    seller.holdings.set('BYTE', { quantity: 500, avgPrice: 100, lockedQty: 0 });

    matching.submitOrder({ userId: 'seed_b', userName: 'Seed Buyer', symbol: 'BYTE', side: 'BUY', type: 'LIMIT', price: 100.00, quantity: 100 });
    matching.submitOrder({ userId: 'seed_a', userName: 'Seed Seller', symbol: 'BYTE', side: 'SELL', type: 'LIMIT', price: 101.00, quantity: 100 });

    const baselineObi = matching.getOrderBookImbalance('BYTE', 5);
    assert.strictEqual(baselineObi.obi, 0, 'Baseline balanced book must have OBI = 0');

    const spoofer = new SpoofingTrader('bot_spoofer', 'Predatory Spoofer', matching, market, accounts, clock, {
      phantomSize: 1500,
      cancelDelayMs: 100,
      realTradeSize: 10
    });

    const cycle = await spoofer.executeSpoofCycle('BYTE', 'BUY');
    assert.strictEqual(cycle.success, true);
    assert.strictEqual(cycle.phantomSize, 1500);
    assert.ok(cycle.manipulatedObi >= 0.80, `Manipulated OBI must exceed +0.80, got ${cycle.manipulatedObi}`);
    console.log(`  Baseline OBI: ${cycle.baselineObi} -> Manipulated OBI: +${cycle.manipulatedObi} (Massive buy pressure spoofed)`);

    const cancelRes = await cycle.cancelPromise;
    assert.strictEqual(cancelRes.success, true, 'Phantom order must be successfully cancelled');

    const postCancelObi = matching.getOrderBookImbalance('BYTE', 5);
    assert.ok(postCancelObi.obi < 0.20, 'OBI must normalize back towards 0 after phantom cancellation');
    spoofer.destroy();
    console.log(`  [PASS] Spoofing artificially skewed OBI from 0.00 to +${cycle.manipulatedObi} before rapid cancellation\n`);
  }

  // -----------------------------------------------------------------------------------------------
  // Test 2: Phantom Depth Cancellation & Capital Unlock
  // -----------------------------------------------------------------------------------------------
  console.log('Test 2: Rapid cancellation of phantom depth prevents execution and unlocks capital');
  {
    const accounts = new AccountManager(5000000);
    const clock = new MarketClock();
    clock.phase = 'REGULAR_HOURS';
    const matching = new MatchingEngine(['AUTO'], accounts, clock);
    const market = new MarketManager(clock, matching);

    const spoofer = new SpoofingTrader('bot_spoofer_2', 'Predatory Spoofer 2', matching, market, accounts, clock, {
      phantomSize: 2000,
      cancelDelayMs: 40
    });

    const user = accounts.getUser('bot_spoofer_2');
    const cycle = await spoofer.executeSpoofCycle('AUTO', 'BUY');
    assert.strictEqual(cycle.success, true);
    assert.ok(user.lockedCredits > 0, 'Credits must be temporarily reserved while phantom order is resting');

    await cycle.cancelPromise;
    assert.strictEqual(user.lockedCredits, 0, 'Locked credits must return to 0 after cancellation');
    spoofer.destroy();
    console.log(`  [PASS] 2,000 share phantom order safely cancelled within 40ms with 100% capital unlock\n`);
  }

  // -----------------------------------------------------------------------------------------------
  // Test 3: MarketSurveillance Automated Abuse Detection
  // -----------------------------------------------------------------------------------------------
  console.log('Test 3: MarketSurveillance detects phantom cancellations and high cancel-to-fill ratio (CFR)');
  {
    const accounts = new AccountManager(5000000);
    const clock = new MarketClock();
    clock.phase = 'REGULAR_HOURS';
    const matching = new MatchingEngine(['SOLR'], accounts, clock);
    const surveillance = new MarketSurveillance(matching, accounts, {
      cfrThreshold: 5.0,
      minCancelsForAlert: 3,
      phantomSizeThreshold: 500,
      phantomLifespanMs: 800,
      autoSanction: true,
      fineAmount: 300
    });

    const alertsCaught = [];
    surveillance.on('surveillance:alert', (alert) => {
      alertsCaught.push(alert);
    });

    // Participant submits 1 large order (800 shares) and cancels immediately (30ms later)
    accounts.getOrCreateUser('abuser_1', 'Bad Actor 1');
    const ord1 = matching.submitOrder({
      userId: 'abuser_1',
      userName: 'Bad Actor 1',
      symbol: 'SOLR',
      side: 'BUY',
      type: 'LIMIT',
      price: 150.00,
      quantity: 800
    });
    assert.strictEqual(ord1.success, true);

    await new Promise(r => setTimeout(r, 30));
    matching.cancelOrder('SOLR', ord1.order.id, 'abuser_1');

    assert.ok(alertsCaught.length >= 1, 'Surveillance must trigger alert on phantom order cancellation');
    const phantomAlert = alertsCaught.find(a => a.type === 'SPOOFING_PHANTOM_ORDER_ABUSE');
    assert.ok(phantomAlert, 'Alert type must be SPOOFING_PHANTOM_ORDER_ABUSE');
    assert.strictEqual(phantomAlert.userId, 'abuser_1');
    assert.strictEqual(phantomAlert.severity, 'CRITICAL');
    console.log(`  Caught Alert: ${phantomAlert.type} (Severity: ${phantomAlert.severity}) on ${phantomAlert.userName}`);

    // Now submit and cancel 4 small orders with 0 fills -> triggers HIGH_CANCEL_TO_FILL_RATIO
    for (let i = 0; i < 4; i++) {
      const o = matching.submitOrder({
        userId: 'abuser_1',
        userName: 'Bad Actor 1',
        symbol: 'SOLR',
        side: 'BUY',
        type: 'LIMIT',
        price: 140.00 - i,
        quantity: 10
      });
      matching.cancelOrder('SOLR', o.order.id, 'abuser_1');
    }

    const cfrAlert = alertsCaught.find(a => a.type === 'HIGH_CANCEL_TO_FILL_RATIO');
    assert.ok(cfrAlert, 'Surveillance must trigger HIGH_CANCEL_TO_FILL_RATIO alert');
    assert.ok(cfrAlert.details.cancelToFillRatio >= 5.0);
    console.log(`  Caught Alert: ${cfrAlert.type} (CFR: ${cfrAlert.details.cancelToFillRatio}x)`);
    console.log(`  [PASS] Market surveillance reliably detects phantom order patterns and high CFR\n`);
  }

  // -----------------------------------------------------------------------------------------------
  // Test 4: Regulatory Sanctions & Disciplinary Enforcement
  // -----------------------------------------------------------------------------------------------
  console.log('Test 4: Regulatory sanctions assess fines and order submission throttling');
  {
    const accounts = new AccountManager(100000);
    const matching = new MatchingEngine(['STRM'], accounts);
    const surveillance = new MarketSurveillance(matching, accounts, {
      autoSanction: true,
      fineAmount: 500,
      throttleDurationSec: 10
    });

    const user = accounts.getOrCreateUser('sanctioned_trader', 'Sanctioned Trader');
    const startingCredits = user.credits;

    surveillance.raiseAlert({
      userId: 'sanctioned_trader',
      userName: 'Sanctioned Trader',
      symbol: 'STRM',
      type: 'SPOOFING_PHANTOM_ORDER_ABUSE',
      severity: 'CRITICAL',
      details: { reason: 'Intentional book manipulation' }
    });

    assert.strictEqual(user.credits, startingCredits - 500, 'Regulatory fine of $500 must be deducted from account');
    assert.strictEqual(user.totalRegulatoryFinesPaid, 500);
    assert.strictEqual(surveillance.isThrottled('sanctioned_trader'), true, 'User must be under active order throttle');

    const summary = surveillance.getSummary();
    assert.strictEqual(summary.totalAlerts, 1);
    assert.strictEqual(summary.flaggedUsers, 1);
    assert.strictEqual(summary.totalFinesLevied, 500);
    console.log(`  Sanction Summary: $${summary.totalFinesLevied} fines levied | Throttled users: ${summary.activeThrottledUsers}`);
    console.log(`  [PASS] Automated regulatory fines and order throttling executed strictly\n`);
  }

  // -----------------------------------------------------------------------------------------------
  // Test 5: Order Queue Depth Position & Priority Inspection
  // -----------------------------------------------------------------------------------------------
  console.log('Test 5: Order queue depth position and FIFO queue priority inspection');
  {
    const accounts = new AccountManager(100000);
    const matching = new MatchingEngine(['SEMI'], accounts);

    accounts.getOrCreateUser('trader_a', 'Trader A');
    accounts.getOrCreateUser('trader_b', 'Trader B');
    accounts.getOrCreateUser('trader_c', 'Trader C');

    // Trader A bids 100 shares @ $200.00 (First in queue)
    const oA = matching.submitOrder({ userId: 'trader_a', userName: 'Trader A', symbol: 'SEMI', side: 'BUY', type: 'LIMIT', price: 200.00, quantity: 100 });
    // Trader B bids 50 shares @ $200.00 (Second in queue at same price)
    const oB = matching.submitOrder({ userId: 'trader_b', userName: 'Trader B', symbol: 'SEMI', side: 'BUY', type: 'LIMIT', price: 200.00, quantity: 50 });
    // Trader C bids 25 shares @ $200.50 (Ahead of both due to higher price)
    const oC = matching.submitOrder({ userId: 'trader_c', userName: 'Trader C', symbol: 'SEMI', side: 'BUY', type: 'LIMIT', price: 200.50, quantity: 25 });

    const posC = matching.getOrderQueuePosition('SEMI', oC.order.id);
    assert.strictEqual(posC.queuePosition, 1, 'Trader C must be #1 in line due to highest bid price');
    assert.strictEqual(posC.sharesAhead, 0, 'Trader C has 0 shares ahead');

    const posA = matching.getOrderQueuePosition('SEMI', oA.order.id);
    assert.strictEqual(posA.queuePosition, 2, 'Trader A must be #2 in line');
    assert.strictEqual(posA.sharesAhead, 25, 'Trader A has 25 shares ahead (Trader C)');

    const posB = matching.getOrderQueuePosition('SEMI', oB.order.id);
    assert.strictEqual(posB.queuePosition, 3, 'Trader B must be #3 in line');
    assert.strictEqual(posB.sharesAhead, 125, 'Trader B has 125 shares ahead (Trader C 25 + Trader A 100)');

    console.log(`  Queue Priority: Trader C (pos ${posC.queuePosition}, ${posC.sharesAhead} sh ahead) -> Trader A (pos ${posA.queuePosition}, ${posA.sharesAhead} sh ahead) -> Trader B (pos ${posB.queuePosition}, ${posB.sharesAhead} sh ahead)`);
    console.log(`  [PASS] Execution queue position and depth priority verified with textbook FIFO accuracy\n`);
  }

  // -----------------------------------------------------------------------------------------------
  // Test 6: Regime-Dependent Liquidity Contraction (FLASH_CRASH)
  // -----------------------------------------------------------------------------------------------
  console.log('Test 6: Bot liquidity withdrawal and spread blowout under FLASH_CRASH regime');
  {
    const accounts = new AccountManager(2000000);
    const clock = new MarketClock();
    clock.phase = 'REGULAR_HOURS';
    const matching = new MatchingEngine(['BYTE'], accounts, clock);
    const market = new MarketManager(clock, matching);

    const mm = new MarketMaker('bot_mm_test', 'Test MM', matching, market, accounts, clock, {
      spreadTarget: 0.010
    });

    mm.setRegimeMultiplier(1.0);
    const normalParams = mm.calculateReservationAndSpreads('BYTE');

    mm.setRegimeMultiplier(4.0);
    const crashParams = mm.calculateReservationAndSpreads('BYTE');

    assert.strictEqual(crashParams.halfSpread, normalParams.halfSpread * 4.0, 'Half spread must expand by 4.0x during FLASH_CRASH');
    console.log(`  Normal Half-Spread: $${normalParams.halfSpread.toFixed(2)} -> FLASH_CRASH Half-Spread: $${crashParams.halfSpread.toFixed(2)} (4.0x blowout)`);

    mm.quoteForSymbol('BYTE');
    const book = matching.getOrderBook('BYTE');
    const bids = book.bids;
    const asks = book.asks;
    assert.ok(bids.length > 0 && asks.length > 0, 'MM quotes must exist');
    for (const b of bids) {
      assert.ok(b.quantity <= 15, `Bid quantity in FLASH_CRASH must be contracted, got ${b.quantity}`);
    }

    console.log(`  Resting Quote Size in FLASH_CRASH: ${bids[0].quantity} shares (Severe liquidity contraction)`);
    mm.destroy();
    console.log(`  [PASS] Market maker liquidity realistically withdraws and spreads blowout under stress\n`);
  }

  console.log('=================================================================================');
  console.log('[SUCCESS] ALL 6 ADVERSARIAL SPOOFING, SURVEILLANCE & QUEUE TESTS PASSED (100%)!');
  console.log('=================================================================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('[FAIL] Test suite failed:', err);
  process.exit(1);
});
