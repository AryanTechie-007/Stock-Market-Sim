import assert from 'assert';
import { MarketManager } from '../engine/market.js';
import { MarketClock } from '../engine/clock.js';
import { MatchingEngine } from '../engine/matching.js';
import { AccountManager } from '../engine/accounts.js';
import { SQLiteStorageManager } from '../engine/sqlite-storage.js';
import { MarketMaker } from '../traders/market-maker.js';

console.log('[TEST] Starting News Impact Decay (Spike-and-Settle) Test Suite...\n');

const storage = new SQLiteStorageManager(':memory:');
const accountManager = new AccountManager(100000, storage);
const clock = new MarketClock({
  openDurationSec: 180,
  postMarketDurationSec: 25,
  preMarketDurationSec: 20
});
const symbols = ['AUTO', 'SOLR', 'BYTE', 'NBNK', 'MEDL'];
const matchingEngine = new MatchingEngine(symbols, accountManager, clock);
const marketManager = new MarketManager(clock, matchingEngine);
// Temporarily disable GBM drift during isolated news tests so we can measure exact deterministic decay curves
marketManager.gbmEnabled = false;

async function runTests() {
  // Test 1: Initial Overreaction Spike on Confirmed Catalyst
  console.log('Test 1: Confirmed News Immediate Overreaction Spike');
  const auto = marketManager.companies.get('AUTO');
  auto.intrinsicValue = 450.0;
  auto.price = 450.0;
  auto.sentiment = 0.0;

  const rawImpact = 0.10; // +10% catalyst
  const event = marketManager.triggerNewsEvent({
    id: 'test_news_bullish_auto',
    headline: 'AutoCorp announces solid-state battery manufacturing partnership',
    symbols: ['AUTO'],
    sentiment: 'BULLISH',
    isRumor: false,
    impact: { AUTO: rawImpact }
  });

  // Expected initial jump: rawImpact * 1.40 = +14.0%
  const expectedSpike = +(450.0 * (1 + 0.14)).toFixed(2); // 513.00
  console.log(`  AUTO Intrinsic: Pre=450.00 CR -> Immediate Spike=${auto.intrinsicValue.toFixed(2)} CR (Expected: ${expectedSpike.toFixed(2)} CR)`);
  assert.strictEqual(auto.intrinsicValue, expectedSpike, 'Initial intrinsic value must reflect 140% overreaction spike');
  assert(auto.sentiment > 0.5, 'Sentiment must experience immediate surge');

  const activeDecays = marketManager.getActiveNewsDecays();
  assert.strictEqual(activeDecays.length, 1, 'Exactly one active news decay must be tracked');
  assert.strictEqual(activeDecays[0].symbol, 'AUTO');
  console.log('[PASS] Immediate 140% overreaction spike applied and active decay registered\n');

  // Test 2: Exponential Digestion Monotonic Decay
  console.log('Test 2: Thirty-Second Exponential Digestion Trajectory');
  let prevVal = auto.intrinsicValue;
  const recordedSteps = [];

  for (let sec = 1; sec <= 30; sec++) {
    marketManager.stepNewsDecay();
    const curVal = auto.intrinsicValue;
    assert(curVal <= prevVal, `Step ${sec}: Intrinsic value must monotonically decline during bullish decay (${curVal} <= ${prevVal})`);
    recordedSteps.push({ sec, val: curVal });
    prevVal = curVal;
  }

  // Verify half-life decay speed: first 10 seconds should account for the majority of the decay
  const totalDecay = 513.00 - recordedSteps[29].val;
  const decayAt10s = 513.00 - recordedSteps[9].val;
  const earlyRatio = decayAt10s / totalDecay;
  console.log(`  Total Decayed Amount: ${totalDecay.toFixed(2)} CR, Decay at 10s: ${decayAt10s.toFixed(2)} CR (${(earlyRatio * 100).toFixed(1)}% of total)`);
  assert(earlyRatio > 0.55, 'Exponential decay curve must exhibit front-loaded half-life digestion');
  console.log('[PASS] Monotonic convex exponential digestion curve verified\n');

  // Test 3: Convergence to Permanent Fundamental Residual
  console.log('Test 3: Convergence to Permanent Fundamental Residual (~55%)');
  // Expected settled value: 450.0 * (1 + 0.10 * 0.55) = 450 * 1.055 = 474.75 CR
  const expectedResidual = +(450.0 * (1 + 0.10 * 0.55)).toFixed(2); // 474.75
  const finalVal = auto.intrinsicValue;
  const error = Math.abs(finalVal - expectedResidual);
  console.log(`  Settled Intrinsic: ${finalVal.toFixed(2)} CR (Theoretical 55% Residual: ${expectedResidual.toFixed(2)} CR, Error: ${error.toFixed(2)} CR)`);
  assert(error < 1.0, `Settled value must converge to permanent residual (got ${finalVal}, expected ${expectedResidual})`);
  assert.strictEqual(marketManager.getActiveNewsDecays().length, 0, 'Active decays must be cleanly pruned upon completion');
  console.log('[PASS] Intrinsic value cleanly converges to permanent 55% residual without lingering overreaction\n');

  // Test 4: Bearish Catalyst Plunge-and-Bounce
  console.log('Test 4: Bearish Catalyst Overshoot Panic and Rebound');
  const solr = marketManager.companies.get('SOLR');
  solr.intrinsicValue = 280.0;
  solr.price = 280.0;
  solr.sentiment = 0.0;

  const rawBearFactor = -0.08; // -8% catalyst
  marketManager.triggerNewsEvent({
    id: 'test_news_bearish_solr',
    headline: 'SolarGen reports regulatory tariff inquiry on overseas polysilicon',
    symbols: ['SOLR'],
    sentiment: 'BEARISH',
    isRumor: false,
    impact: { SOLR: rawBearFactor }
  });

  // Panic drop: -0.08 * 1.40 = -11.2% -> 280 * (1 - 0.112) = 248.64 CR
  const expectedTrough = +(280.0 * (1 - 0.112)).toFixed(2);
  console.log(`  SOLR Pre-News=280.00 CR -> Panic Trough=${solr.intrinsicValue.toFixed(2)} CR (Expected: ${expectedTrough.toFixed(2)} CR)`);
  assert.strictEqual(solr.intrinsicValue, expectedTrough, 'Bearish news must trigger immediate panic overshoot');

  // Step through 30 seconds of market recovery
  for (let sec = 1; sec <= 30; sec++) {
    marketManager.stepNewsDecay();
  }

  // Expected rebound: 280 * (1 - 0.08 * 0.55) = 280 * (1 - 0.044) = 267.68 CR
  const expectedBearResidual = +(280.0 * (1 - 0.08 * 0.55)).toFixed(2);
  const finalBearVal = solr.intrinsicValue;
  console.log(`  SOLR Settled Intrinsic: ${finalBearVal.toFixed(2)} CR (Theoretical 55% Residual: ${expectedBearResidual.toFixed(2)} CR)`);
  assert(Math.abs(finalBearVal - expectedBearResidual) < 1.0, `Bearish rebound must settle near residual (got ${finalBearVal}, expected ${expectedBearResidual})`);
  console.log('[PASS] Bearish panic overshoot and subsequent rebound digestion verified\n');

  // Test 5: Speculative Rumor Amplification & Fade (1.6x Overshoot, 30% Residual)
  console.log('Test 5: Speculative Rumor Amplification and Rapid Fade');
  const byte = marketManager.companies.get('BYTE');
  byte.intrinsicValue = 1200.0;
  byte.price = 1200.0;
  byte.sentiment = 0.0;

  const rumorImpact = 0.06; // +6% takeover rumor
  marketManager.triggerNewsEvent({
    id: 'test_rumor_byte',
    headline: 'RUMOR: Cloud titan rumored to be preparing cash tender offer for ByteWorks',
    symbols: ['BYTE'],
    sentiment: 'BULLISH',
    isRumor: true,
    impact: { BYTE: rumorImpact }
  });

  // Rumor overreaction: 1.6x -> +9.6% -> 1200 * 1.096 = 1315.20 CR
  const expectedRumorSpike = +(1200.0 * (1 + 0.06 * 1.60)).toFixed(2);
  console.log(`  BYTE Rumor Spike=${byte.intrinsicValue.toFixed(2)} CR (Expected: ${expectedRumorSpike.toFixed(2)} CR)`);
  assert.strictEqual(byte.intrinsicValue, expectedRumorSpike, 'Rumor must trigger amplified 160% initial overshoot');

  // Step through 30 seconds of rumor fading
  for (let sec = 1; sec <= 30; sec++) {
    marketManager.stepNewsDecay();
  }

  // Rumor residual: only 30% remains -> +1.8% -> 1200 * 1.018 = 1221.60 CR
  const expectedRumorResidual = +(1200.0 * (1 + 0.06 * 0.30)).toFixed(2);
  console.log(`  BYTE Rumor Settled: ${byte.intrinsicValue.toFixed(2)} CR (Expected 30% Residual: ${expectedRumorResidual.toFixed(2)} CR)`);
  assert(Math.abs(byte.intrinsicValue - expectedRumorResidual) < 1.5, `Rumor must fade sharply leaving only 30% residual (got ${byte.intrinsicValue})`);
  console.log('[PASS] Speculative rumor dynamics (1.6x spike, 70% fade) verified\n');

  // Test 6: Market Maker Fair Quote Response to Spike-and-Settle
  console.log('Test 6: Market Maker Dynamic Quote Adaptation Across Decay Horizon');
  const mm = new MarketMaker('bot_mm_news_test', 'News_Test_MM', matchingEngine, marketManager, accountManager, clock);
  const nbnk = marketManager.companies.get('NBNK');
  nbnk.intrinsicValue = 600.0;
  nbnk.price = 600.0;

  // News hits NBNK: +8%
  marketManager.triggerNewsEvent({
    id: 'test_news_nbnk',
    headline: 'National Bank boosts dividend payout ratio by 25%',
    symbols: ['NBNK'],
    sentiment: 'BULLISH',
    isRumor: false,
    impact: { NBNK: 0.08 }
  });

  // At spike: intrinsic value is 600 * 1.112 = 667.20 CR
  clock.phase = 'REGULAR_HOURS';
  let book = matchingEngine.getOrderBook('NBNK');
  let bids = [];
  let asks = [];
  while (bids.length === 0 || asks.length === 0) {
    mm.act();
    bids = book.bids.filter(o => o.userId === mm.id);
    asks = book.asks.filter(o => o.userId === mm.id);
  }
  let midSpike = (bids[0].price + asks[0].price) / 2;
  console.log(`  NBNK Quoting at News Spike: Mid Quote=${midSpike.toFixed(2)} CR (Price=600.00, Intrinsic=${nbnk.intrinsicValue.toFixed(2)})`);
  assert(midSpike > 630.0, 'Market maker quotes must shift upward immediately upon news spike');

  // Fast forward 30 seconds of news digestion
  for (let s = 1; s <= 30; s++) {
    marketManager.stepNewsDecay();
  }
  mm.cancelAllMyOrders('NBNK');
  bids = [];
  asks = [];
  while (bids.length === 0 || asks.length === 0) {
    mm.act();
    bids = book.bids.filter(o => o.userId === mm.id);
    asks = book.asks.filter(o => o.userId === mm.id);
  }
  let midSettled = (bids[0].price + asks[0].price) / 2;
  console.log(`  NBNK Quoting after 30s Digestion: Mid Quote=${midSettled.toFixed(2)} CR (Intrinsic Settled=${nbnk.intrinsicValue.toFixed(2)})`);
  assert(midSettled < midSpike, `Market maker mid quote must settle lower after digestion (${midSettled} < ${midSpike})`);
  assert(midSettled > 610.0, 'Market maker mid quote must retain permanent upward shift');
  console.log('[PASS] Market maker quotes actively follow the spike-and-settle trajectory\n');

  // Test 7: Concurrent Overlapping News Events on Same Symbol
  console.log('Test 7: Multi-Event Concurrent Decay Resilience');
  const medl = marketManager.companies.get('MEDL');
  medl.intrinsicValue = 800.0;
  medl.price = 800.0;

  // Catalyst 1: +5%
  marketManager.triggerNewsEvent({
    id: 'medl_event_1',
    headline: 'MedLife patent awarded for novel compound',
    symbols: ['MEDL'],
    impact: { MEDL: 0.05 }
  });

  // Advance 10 seconds
  for (let i = 0; i < 10; i++) marketManager.stepNewsDecay();
  assert.strictEqual(marketManager.getActiveNewsDecays().length, 1);

  // Catalyst 2 hits before Catalyst 1 finishes: +4%
  marketManager.triggerNewsEvent({
    id: 'medl_event_2',
    headline: 'MedLife clinical study meets primary endpoint',
    symbols: ['MEDL'],
    impact: { MEDL: 0.04 }
  });
  assert.strictEqual(marketManager.getActiveNewsDecays().length, 2, 'Both decays must track concurrently');

  // Advance 30 more seconds to let both finish
  for (let i = 0; i < 30; i++) marketManager.stepNewsDecay();

  assert.strictEqual(marketManager.getActiveNewsDecays().length, 0, 'Both concurrent decays must cleanly resolve');
  assert(!isNaN(medl.intrinsicValue) && isFinite(medl.intrinsicValue), 'Multi-event intrinsic value must remain valid number');
  console.log(`  MEDL Multi-Event Final Value: ${medl.intrinsicValue.toFixed(2)} CR`);
  console.log('[PASS] Overlapping concurrent news decays resolve cleanly without interference\n');

  console.log('=======================================================');
  console.log('[SUCCESS] ALL 7 NEWS IMPACT DECAY TESTS PASSED!');
  console.log('=======================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('[FAIL] News decay test suite encountered error:', err);
  process.exit(1);
});
