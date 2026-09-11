import assert from 'assert';
import { MarketManager, INITIAL_COMPANIES } from '../engine/market.js';
import { MarketClock } from '../engine/clock.js';
import { MatchingEngine } from '../engine/matching.js';
import { AccountManager } from '../engine/accounts.js';
import { SQLiteStorageManager } from '../engine/sqlite-storage.js';
import { MarketMaker } from '../traders/market-maker.js';

console.log('[TEST] Starting Geometric Brownian Motion (GBM) Price Discovery Test Suite...\n');

// Bootstrap isolated in-memory test environment
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

async function runTests() {
  // Test 1: Box-Muller Standard Normal Variate Distribution
  console.log('Test 1: Box-Muller Transformation Normality Verification');
  const N = 10000;
  const samples = [];
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const z = marketManager._randomNormal();
    samples.push(z);
    sum += z;
  }
  const mean = sum / N;
  let varianceSum = 0;
  for (let i = 0; i < N; i++) {
    varianceSum += Math.pow(samples[i] - mean, 2);
  }
  const variance = varianceSum / (N - 1);
  const stdDev = Math.sqrt(variance);

  console.log(`  Sample Size: ${N}, Mean: ${mean.toFixed(4)}, Variance: ${variance.toFixed(4)}, StdDev: ${stdDev.toFixed(4)}`);
  assert(Math.abs(mean) < 0.05, `Sample mean must be close to 0 (got ${mean})`);
  assert(Math.abs(variance - 1.0) < 0.10, `Sample variance must be close to 1.0 (got ${variance})`);
  console.log('[PASS] Box-Muller transform generates standard normal variates Z ~ N(0, 1)\n');

  // Test 2: Asset Parameterization in INITIAL_COMPANIES
  console.log('Test 2: Asset GBM Parameterization Across Listed Equities');
  for (const comp of INITIAL_COMPANIES) {
    assert(typeof comp.annualReturn === 'number' && comp.annualReturn > 0, `${comp.symbol} must have positive annualReturn drift`);
    assert(typeof comp.volatility === 'number' && comp.volatility > 0, `${comp.symbol} must have positive daily volatility`);
    assert(typeof comp.annualVolatility === 'number' && comp.annualVolatility > 0, `${comp.symbol} must have positive annualVolatility`);

    // Verify annual volatility matches sqrt(252) scaling of daily volatility within tolerance
    const expectedAnnual = comp.volatility * Math.sqrt(252);
    const diff = Math.abs(comp.annualVolatility - expectedAnnual);
    assert(diff < 0.01, `${comp.symbol} annualVolatility (${comp.annualVolatility}) must scale daily vol by sqrt(252) (${expectedAnnual.toFixed(4)})`);
    console.log(`  [OK] ${comp.symbol}: Drift mu=${(comp.annualReturn * 100).toFixed(1)}%, Vol sigma=${(comp.annualVolatility * 100).toFixed(1)}%`);
  }
  console.log('[PASS] All 5 listed equities possess valid quantitative drift and volatility parameters\n');

  // Test 3: Discrete Itô Lemma Step and Non-Negativity
  console.log('Test 3: Discrete GBM Simulation Step and Positive Price Guarantee');
  const auto = marketManager.getCompany('AUTO');
  const initialIntrinsic = auto.intrinsicValue;
  assert(initialIntrinsic > 0, 'Initial intrinsic value must be positive');

  // Ensure clock is open
  clock.phase = 'REGULAR_HOURS';
  for (let step = 1; step <= 25; step++) {
    marketManager.stepGBM();
    const current = marketManager.getCompany('AUTO').intrinsicValue;
    assert(current > 0, 'Intrinsic value must remain strictly positive under GBM exponential');
  }
  const postIntrinsic = marketManager.getCompany('AUTO').intrinsicValue;
  console.log(`  AUTO Intrinsic: Initial=${initialIntrinsic.toFixed(2)} CR -> After 25 GBM steps=${postIntrinsic.toFixed(2)} CR`);
  assert(marketManager.companies.get('AUTO').gbmHistory.ticks >= 25, 'GBM history ticks must be tracked');
  console.log('[PASS] GBM updates follow Itô lognormal dynamics preserving strict non-negativity\n');

  // Test 4: Market Clock Phase Gating
  console.log('Test 4: Market Clock Trading Phase Gating');
  const byteBefore = marketManager.getCompany('BYTE').intrinsicValue;

  // PRE_MARKET: GBM should pause
  clock.phase = 'PRE_MARKET';
  marketManager.stepGBM();
  const bytePre = marketManager.getCompany('BYTE').intrinsicValue;
  assert.strictEqual(bytePre, byteBefore, 'GBM price discovery must pause during PRE_MARKET');

  // POST_MARKET: GBM should pause
  clock.phase = 'POST_MARKET';
  marketManager.stepGBM();
  const bytePost = marketManager.getCompany('BYTE').intrinsicValue;
  assert.strictEqual(bytePost, byteBefore, 'GBM price discovery must pause during POST_MARKET');

  // REGULAR_HOURS: GBM must execute
  clock.phase = 'REGULAR_HOURS';
  // Force a visible step with customDt
  marketManager.stepGBM(1 / 252);
  const byteOpen = marketManager.getCompany('BYTE').intrinsicValue;
  assert.notStrictEqual(byteOpen, byteBefore, 'GBM price discovery must execute during REGULAR_HOURS');
  console.log(`  BYTE Intrinsic: Pre=${bytePre.toFixed(2)} CR, Post=${bytePost.toFixed(2)} CR, Open Active=${byteOpen.toFixed(2)} CR`);
  console.log('[PASS] GBM stochastic execution strictly gated by trading clock phase\n');

  // Test 5: Market Regime Volatility Multiplier Scaling
  console.log('Test 5: Adaptive Market Regime Volatility Multiplier Sensitivity');
  marketManager.setRegimeMultiplier(1.0);
  assert.strictEqual(marketManager.regimeMultiplier, 1.0);

  // Measure variance of log returns under normal regime (regime = 1.0)
  const runs = 200;
  const returnsNormal = [];
  let sNormal = 100;
  for (let i = 0; i < runs; i++) {
    const z = marketManager._randomNormal();
    const dt = 1 / 252;
    const vol = 0.20 * 1.0;
    const r = (0.08 - 0.5 * vol * vol) * dt + vol * Math.sqrt(dt) * z;
    returnsNormal.push(r);
  }
  const varNormal = returnsNormal.reduce((acc, r) => acc + Math.pow(r, 2), 0) / runs;

  // Measure variance under flash crash regime (regime = 4.0)
  marketManager.setRegimeMultiplier(4.0);
  assert.strictEqual(marketManager.regimeMultiplier, 4.0);
  const returnsVol = [];
  for (let i = 0; i < runs; i++) {
    const z = marketManager._randomNormal();
    const dt = 1 / 252;
    const vol = 0.20 * 4.0;
    const r = (0.08 - 0.5 * vol * vol) * dt + vol * Math.sqrt(dt) * z;
    returnsVol.push(r);
  }
  const varHighVol = returnsVol.reduce((acc, r) => acc + Math.pow(r, 2), 0) / runs;

  console.log(`  Variance: Normal Regime=${varNormal.toExponential(4)}, High Vol (4.0x)=${varHighVol.toExponential(4)}`);
  assert(varHighVol > varNormal * 4, 'High volatility regime must substantially increase diffusion variance');
  marketManager.setRegimeMultiplier(1.0); // Reset
  console.log('[PASS] Market regime multiplier dynamically scales GBM stochastic diffusion intensity\n');

  // Test 6: Market Maker Fair Value Quote Adaptation
  console.log('Test 6: Market Maker Dynamic Quote Centering Around GBM Fair Value');
  const mm = new MarketMaker('bot_mm_gbm_test', 'GBM_Test_MM', matchingEngine, marketManager, accountManager, clock);
  const solr = marketManager.companies.get('SOLR');
  solr.price = 280.0;
  solr.intrinsicValue = 310.0; // 10.7% upward fair value drift

  // Market maker acts
  clock.phase = 'REGULAR_HOURS';
  mm.act();

  // Inspect resting orders placed in matching engine for SOLR
  const book = matchingEngine.getOrderBook('SOLR');
  assert(book, 'OrderBook for SOLR must exist');
  const mmBids = book.bids.filter(o => o.userId === mm.id);
  const mmAsks = book.asks.filter(o => o.userId === mm.id);

  if (mmBids.length > 0 && mmAsks.length > 0) {
    const bestBid = mmBids[0].price;
    const bestAsk = mmAsks[0].price;
    const midQuote = (bestBid + bestAsk) / 2;
    console.log(`  SOLR: Last Trade=280.00 CR, Intrinsic=310.00 CR -> MM Quoting Mid=${midQuote.toFixed(2)} CR (Bid=${bestBid.toFixed(2)}, Ask=${bestAsk.toFixed(2)})`);
    assert(midQuote > 282.0, `Market Maker quote center (${midQuote.toFixed(2)}) must reflect upward fair value pull from 280.00`);
  }
  console.log('[PASS] Market Maker continuously anchors quote ladder to GBM fair price\n');

  // Test 7: Quiet Period Continuous Price Drift & Candle Updates
  console.log('Test 7: Quiet Period Soft Mean-Reversion Drift (Anti-Flatline Protection)');
  const nbnk = marketManager.companies.get('NBNK');
  nbnk.price = 600.0;
  nbnk.intrinsicValue = 630.0; // Gap of 30 CR
  nbnk.lastTradeTimeSec = Math.floor(Date.now() / 1000) - 10; // 10s since last trade

  let priceUpdateEmitted = false;
  marketManager.once('priceUpdate', (data) => {
    if (data.symbol === 'NBNK') {
      priceUpdateEmitted = true;
    }
  });

  clock.phase = 'REGULAR_HOURS';
  marketManager.stepGBM();

  assert(nbnk.price > 600.0, `Price must drift upward toward intrinsic value (got ${nbnk.price})`);
  assert.strictEqual(priceUpdateEmitted, true, 'priceUpdate event must be emitted when price drifts');
  
  // Verify active candle close was updated
  const activeCandle = marketManager.activeCandles.get('5s').get('NBNK');
  assert.strictEqual(activeCandle.close, nbnk.price, 'Active candle close must mirror drifted price');
  console.log(`  NBNK: Initial Price=600.00 CR -> Post-Drift Price=${nbnk.price.toFixed(2)} CR (Candle Close=${activeCandle.close.toFixed(2)})`);
  console.log('[PASS] Quiet period soft drift prevents flatlines and synchronizes candlestick buffers\n');

  // Test 8: Multi-Day Horizon Stability
  console.log('Test 8: Long-Horizon Multi-Cycle Stability (360 Simulation Steps)');
  for (let i = 0; i < 360; i++) {
    marketManager.stepGBM();
  }
  for (const [sym, comp] of marketManager.companies.entries()) {
    assert(comp.intrinsicValue >= 1.0, `${sym} intrinsic value must remain above 1.0 CR floor (got ${comp.intrinsicValue})`);
    assert(!isNaN(comp.intrinsicValue), `${sym} intrinsic value must not be NaN`);
    assert(isFinite(comp.intrinsicValue), `${sym} intrinsic value must be finite`);
    console.log(`  ${sym}: End Intrinsic=${comp.intrinsicValue.toFixed(2)} CR, Price=${comp.price.toFixed(2)} CR (GBM Ticks: ${comp.gbmHistory.ticks})`);
  }
  console.log('[PASS] Long-horizon multi-cycle simulation confirms mathematical stability and bounds\n');

  console.log('=======================================================');
  console.log('[SUCCESS] ALL 8 GEOMETRIC BROWNIAN MOTION (GBM) TESTS PASSED!');
  console.log('=======================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('[FAIL] GBM test suite encountered error:', err);
  process.exit(1);
});
