import assert from 'assert';
import { MarketClock } from '../engine/clock.js';
import { MarketManager } from '../engine/market.js';
import { MatchingEngine } from '../engine/matching.js';
import { AccountManager } from '../engine/accounts.js';
import { MarketMaker } from '../traders/market-maker.js';

console.log('[TEST] Starting Release v0.915 Endogenous Price Discovery, GARCH(1,1) & Merton Jump Suite...\n');

async function runTests() {
  // -----------------------------------------------------------------------------------------------
  // Test 1: Endogenous Price Invariance (No Drift Without Executed Trades)
  // -----------------------------------------------------------------------------------------------
  console.log('Test 1: Endogenous Price Formation — Zero Artificial Price Drift');
  {
    const clock = new MarketClock();
    const accountManager = new AccountManager();
    const matchingEngine = new MatchingEngine(accountManager);
    const marketManager = new MarketManager(clock, matchingEngine);

    assert.strictEqual(marketManager.isEndogenousPricing(), true, 'Endogenous pricing mode must be enabled by default');

    const auto = marketManager.companies.get('AUTO');
    const initialPrice = auto.price;
    auto.intrinsicValue = initialPrice + 45.0; // Large fundamental gap of 45 CR
    auto.lastTradeTimeSec = Math.floor(Date.now() / 1000) - 60; // 60s quiet interval

    clock.phase = 'REGULAR_HOURS';

    // Step GBM 20 times — intrinsic value should evolve, but tradable price must remain strictly unchanged
    for (let i = 0; i < 20; i++) {
      marketManager.stepGBM();
    }

    assert.strictEqual(auto.price, initialPrice, `Traded price must NOT drift without matched trades (expected ${initialPrice}, got ${auto.price})`);
    assert(auto.intrinsicValue !== initialPrice, 'Intrinsic value must evolve stochastically');
    
    const candle5s = marketManager.activeCandles.get('5s').get('AUTO');
    assert.strictEqual(candle5s.close, initialPrice, 'Candlestick close must remain strictly anchored to last traded price');
    console.log(`  AUTO: Traded Price = ${auto.price.toFixed(2)} CR (Invariant) | Intrinsic = ${auto.intrinsicValue.toFixed(2)} CR (Evolved)`);
    console.log('  [PASS] Tradable prices and candles emerge strictly from trades, eliminating artificial oracle drift\n');
  }

  // -----------------------------------------------------------------------------------------------
  // Test 2: Order-Flow Traded Price Formation via Book Matches
  // -----------------------------------------------------------------------------------------------
  console.log('Test 2: Order-Flow Traded Price Discovery via Matching Engine Fills');
  {
    const clock = new MarketClock();
    const accountManager = new AccountManager();
    const matchingEngine = new MatchingEngine(accountManager);
    const marketManager = new MarketManager(clock, matchingEngine);

    const buyer = accountManager.getOrCreateUser('trader_buy', 'Buyer', false);
    const seller = accountManager.getOrCreateUser('trader_sell', 'Seller', false);
    buyer.credits = 500000;
    seller.holdings.set('BYTE', { quantity: 1000, avgPrice: 1200 });

    const initialBytePrice = marketManager.companies.get('BYTE').price;
    const targetExecutionPrice = 1245.50;

    // Resting limit sell at target execution price
    const sellRes = matchingEngine.submitOrder({
      userId: seller.id,
      userName: seller.name,
      symbol: 'BYTE',
      side: 'SELL',
      type: 'LIMIT',
      price: targetExecutionPrice,
      quantity: 50
    });
    assert(sellRes.success, `Sell order submission must succeed: ${sellRes.error}`);

    // Aggressive market buy crossing the spread
    const buyRes = matchingEngine.submitOrder({
      userId: buyer.id,
      userName: buyer.name,
      symbol: 'BYTE',
      side: 'BUY',
      type: 'MARKET',
      quantity: 50
    });
    assert(buyRes.success, `Buy order submission must succeed: ${buyRes.error}`);

    const currentBytePrice = marketManager.companies.get('BYTE').price;
    assert.strictEqual(currentBytePrice, targetExecutionPrice, `Traded price must match executed transaction price (${targetExecutionPrice})`);
    assert.notStrictEqual(currentBytePrice, initialBytePrice, 'Price must update upon match fill');

    const candle = marketManager.activeCandles.get('1s').get('BYTE');
    assert.strictEqual(candle.close, targetExecutionPrice, 'Active candle close must update strictly upon trade fill');
    console.log(`  BYTE Traded Price: Initial=${initialBytePrice.toFixed(2)} CR -> Matched Fill=${currentBytePrice.toFixed(2)} CR`);
    console.log('  [PASS] Order book fills cleanly dictate the tradable price stream\n');
  }

  // -----------------------------------------------------------------------------------------------
  // Test 3: GARCH(1,1) Volatility Clustering Dynamics
  // -----------------------------------------------------------------------------------------------
  console.log('Test 3: GARCH(1,1) Dynamic Volatility Clustering and Persistence');
  {
    const clock = new MarketClock();
    const accountManager = new AccountManager();
    const matchingEngine = new MatchingEngine(accountManager);
    const marketManager = new MarketManager(clock, matchingEngine);

    const comp = marketManager.companies.get('SOLR');
    const initialGarch = marketManager.getGarchVolatility('SOLR');
    assert(initialGarch, 'Company must possess GARCH tracking state');
    assert.strictEqual(initialGarch.alpha, 0.08, 'ARCH parameter alpha must equal 0.08');
    assert.strictEqual(initialGarch.beta, 0.88, 'GARCH parameter beta must equal 0.88');
    assert(initialGarch.alpha + initialGarch.beta < 1.0, 'GARCH process must satisfy stationarity (alpha + beta < 1.0)');

    const baselineVol = initialGarch.currentVol;
    const baselineVariance = initialGarch.variance;

    // Simulate an aggressive trade shock (+6% price leap)
    const shockPrice = +(comp.price * 1.06).toFixed(2);
    marketManager._handleTrade({
      symbol: 'SOLR',
      price: shockPrice,
      quantity: 200,
      timestamp: Date.now()
    });

    const postShockGarch = marketManager.getGarchVolatility('SOLR');
    assert(postShockGarch.variance > baselineVariance, `Shock must elevate GARCH variance (${postShockGarch.variance} > ${baselineVariance})`);
    assert(postShockGarch.currentVol > baselineVol, `Shock must elevate instantaneous volatility (${postShockGarch.currentVol} > ${baselineVol})`);
    console.log(`  SOLR Volatility Shock: Baseline Vol=${(baselineVol * 100).toFixed(2)}% -> Elevated Vol=${(postShockGarch.currentVol * 100).toFixed(2)}%`);

    // Simulate sequence of small returns: variance should persist and slowly decay towards mean
    const elevatedVol = postShockGarch.currentVol;
    let currentVol = elevatedVol;
    let priceCursor = shockPrice;

    for (let step = 0; step < 10; step++) {
      priceCursor = +(priceCursor * (1.0 + (Math.random() - 0.5) * 0.002)).toFixed(2);
      marketManager._handleTrade({
        symbol: 'SOLR',
        price: priceCursor,
        quantity: 50,
        timestamp: Date.now()
      });
    }

    const decayedGarch = marketManager.getGarchVolatility('SOLR');
    assert(decayedGarch.currentVol < elevatedVol, 'Tranquil trading must decay elevated volatility towards unconditional baseline');
    console.log(`  SOLR Volatility Decay: Elevated=${(elevatedVol * 100).toFixed(2)}% -> Decayed=${(decayedGarch.currentVol * 100).toFixed(2)}%`);
    console.log('  [PASS] GARCH(1,1) accurately produces volatility clustering and memory persistence\n');
  }

  // -----------------------------------------------------------------------------------------------
  // Test 4: Merton Jump-Diffusion Compound Poisson Arrivals
  // -----------------------------------------------------------------------------------------------
  console.log('Test 4: Merton Jump-Diffusion Discontinuous Poisson Jump Engine');
  {
    const clock = new MarketClock();
    const accountManager = new AccountManager();
    const matchingEngine = new MatchingEngine(accountManager);
    const marketManager = new MarketManager(clock, matchingEngine);

    const nbnk = marketManager.companies.get('NBNK');
    assert(nbnk.mertonJumps, 'Company must possess Merton Jump parameters');
    assert.strictEqual(nbnk.mertonJumps.lambda, 8.0, 'Expected Poisson jump arrival rate lambda = 8.0/yr');

    const preJumpIntrinsic = nbnk.intrinsicValue;
    const preJumpPrice = nbnk.price;

    // Trigger deterministic Merton jump (-5.0% fundamental jump)
    const jumpResult = marketManager.triggerMertonJump('NBNK', -0.05);
    assert(jumpResult, 'Jump trigger must succeed');
    assert.strictEqual(jumpResult.symbol, 'NBNK');
    assert.strictEqual(jumpResult.magnitude, -0.05);

    const postJumpIntrinsic = marketManager.companies.get('NBNK').intrinsicValue;
    const postJumpPrice = marketManager.companies.get('NBNK').price;

    assert(postJumpIntrinsic < preJumpIntrinsic, 'Fundamental intrinsic value must jump discontinuously downward');
    assert.strictEqual(postJumpPrice, preJumpPrice, 'Traded price must NOT move instantaneously from fundamental jumps (endogenous decoupling)');
    assert(nbnk.mertonJumps.jumpCount >= 1, 'Jump count must increment');
    assert.strictEqual(nbnk.mertonJumps.lastJump.magnitude, -0.05);

    console.log(`  NBNK Jump Event: Intrinsic ${preJumpIntrinsic.toFixed(2)} CR -> ${postJumpIntrinsic.toFixed(2)} CR (Price remained ${postJumpPrice.toFixed(2)} CR)`);
    console.log('  [PASS] Merton jump-diffusion injects heavy-tailed Poisson arrivals into fundamental anchor\n');
  }

  // -----------------------------------------------------------------------------------------------
  // Test 5: Crisis-Driven Dynamic Correlation Breakdown
  // -----------------------------------------------------------------------------------------------
  console.log('Test 5: Crisis-Driven Dynamic Correlation Breakdown and Cholesky Recalculation');
  {
    const clock = new MarketClock();
    const accountManager = new AccountManager();
    const matchingEngine = new MatchingEngine(accountManager);
    const marketManager = new MarketManager(clock, matchingEngine);

    const baselineCorrs = marketManager.getCorrelationMatrix();
    const byteIdx = baselineCorrs.symbols.indexOf('BYTE');
    const nbnkIdx = baselineCorrs.symbols.indexOf('NBNK');
    const baseRho = baselineCorrs.matrix[byteIdx][nbnkIdx];

    console.log(`  Baseline BYTE <-> NBNK Correlation: rho = ${baseRho.toFixed(2)} (Diversified)`);
    assert.strictEqual(marketManager.getSystemicStress(), 0.0);

    // Induce systemic crisis stress (s = 0.90)
    marketManager.setSystemicStress(0.90);
    assert.strictEqual(marketManager.getSystemicStress(), 0.90);

    const stressedCorrs = marketManager.getCorrelationMatrix();
    const stressedRho = stressedCorrs.matrix[byteIdx][nbnkIdx];
    console.log(`  Crisis Stressed BYTE <-> NBNK Correlation: rho = ${stressedRho.toFixed(2)} (Spike toward +1.0)`);

    assert(stressedRho > baseRho, `Stress must increase correlation (${stressedRho} > ${baseRho})`);
    assert(stressedRho > 0.40, 'Crisis correlation must break diversification and surge towards +1.0');

    // Verify Cholesky Factorization L * L^T remains mathematically positive-definite and exact
    const L = marketManager.getCholeskyMatrix().matrix;
    const n = L.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let reconstructed = 0;
        for (let k = 0; k < n; k++) {
          reconstructed += L[i][k] * L[j][k];
        }
        const expected = stressedCorrs.matrix[i][j];
        assert(Math.abs(reconstructed - expected) < 0.001, `Cholesky reconstruction error at [${i},${j}]: ${reconstructed} vs ${expected}`);
      }
    }
    console.log('  [PASS] Crisis stress triggers correlation breakdown and exact Cholesky matrix factor updates\n');
  }

  // -----------------------------------------------------------------------------------------------
  // Test 6: Market Maker Noisy Fair-Value Estimation & Configurable Clock
  // -----------------------------------------------------------------------------------------------
  console.log('Test 6: Market Maker Noisy Fair-Value Estimation & Configurable Session Clock');
  {
    const clock = new MarketClock();
    const accountManager = new AccountManager();
    const matchingEngine = new MatchingEngine(accountManager);
    const marketManager = new MarketManager(clock, matchingEngine);

    const mm = new MarketMaker('mm_realism', 'Virtu MM', matchingEngine, marketManager, accountManager, clock);
    const comp = marketManager.companies.get('AERO');
    comp.price = 700.00;
    comp.intrinsicValue = 750.00;

    // Market maker estimation should NOT be equal to the oracle 65% blend (700 * 0.35 + 750 * 0.65 = 732.50)
    const fairEstimate = mm.estimateFairValue('AERO', comp);
    console.log(`  AERO: Traded Price = 700.00 CR, Intrinsic = 750.00 CR -> MM Estimated Fair = ${fairEstimate.toFixed(2)} CR`);
    assert(fairEstimate > 700.00 && fairEstimate < 750.00, 'Fair estimate should reasonably blend microprice and noisy consensus');
    assert.notStrictEqual(fairEstimate, 732.50, 'Market Maker must not use naive hardcoded oracle blend');

    // Configurable Session Clock Test
    clock.setDurations({ preMarket: 45, regularHours: 600, postMarket: 45 });
    assert.strictEqual(clock.durations.PRE_MARKET, 45);
    assert.strictEqual(clock.durations.REGULAR_HOURS, 600);
    assert.strictEqual(clock.durations.POST_MARKET, 45);
    console.log('  [PASS] Market maker noisy valuation and configurable session clock verified\n');
  }

  console.log('=================================================================================');
  console.log('[SUCCESS] ALL 6 ENDOGENOUS PRICING, GARCH(1,1) & MERTON JUMP TESTS PASSED (100%)!');
  console.log('=================================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('[FAIL] Endogenous Pricing suite encountered error:', err);
  process.exit(1);
});
