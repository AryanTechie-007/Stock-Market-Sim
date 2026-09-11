import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalCDF,
  normalPDF,
  priceCall,
  pricePut,
  calculateGreeks,
  verifyPutCallParity,
  calculateImpliedVolatility,
  OptionsChainManager
} from '../engine/options.js';

test('Black-Scholes-Merton Derivatives Engine Suite (v0.912)', async (t) => {

  await t.test('1. Standard Normal CDF and PDF mathematical accuracy', () => {
    // PDF symmetry & peak at 0
    const pdf0 = normalPDF(0);
    assert.ok(Math.abs(pdf0 - 0.39894228) < 1e-6, `normalPDF(0) should be ~0.39894, got ${pdf0}`);
    assert.equal(normalPDF(1.5), normalPDF(-1.5), 'normalPDF must be symmetric around zero');

    // CDF midpoint and symmetry: N(0) = 0.5, N(x) + N(-x) = 1.0
    const cdf0 = normalCDF(0);
    assert.ok(Math.abs(cdf0 - 0.5) < 1e-6, `normalCDF(0) should be 0.5, got ${cdf0}`);

    const xVals = [0.5, 1.0, 1.645, 1.96, 2.576, 3.0];
    for (const x of xVals) {
      const sum = normalCDF(x) + normalCDF(-x);
      assert.ok(Math.abs(sum - 1.0) < 1e-6, `N(${x}) + N(-${x}) should equal 1.0, got ${sum}`);
    }

    // Benchmark 95% two-tailed confidence interval at z = 1.96 -> N(1.96) ~ 0.9750
    const cdf196 = normalCDF(1.96);
    assert.ok(Math.abs(cdf196 - 0.975002) < 1e-4, `N(1.96) should be ~0.9750, got ${cdf196}`);
  });

  await t.test('2. Analytical Black-Scholes pricing matches standard quantitative benchmarks', () => {
    // Textbook benchmark: S = 100, K = 100, T = 1.0, r = 0.05, sigma = 0.20
    const S = 100;
    const K = 100;
    const T = 1.0;
    const r = 0.05;
    const sigma = 0.20;

    const callPrice = priceCall(S, K, T, r, sigma);
    const putPrice = pricePut(S, K, T, r, sigma);

    // Standard Black-Scholes values: Call ~ 10.4506, Put ~ 5.5735
    assert.ok(Math.abs(callPrice - 10.4506) < 0.01, `Call price should be ~10.45, got ${callPrice}`);
    assert.ok(Math.abs(putPrice - 5.5735) < 0.01, `Put price should be ~5.57, got ${putPrice}`);

    // Boundary conditions: T = 0 returns intrinsic value
    assert.equal(priceCall(110, 100, 0, r, sigma), 10);
    assert.equal(priceCall(90, 100, 0, r, sigma), 0);
    assert.equal(pricePut(90, 100, 0, r, sigma), 10);
    assert.equal(pricePut(110, 100, 0, r, sigma), 0);
  });

  await t.test('3. Put-Call Parity exact verification: C - P = S - K * exp(-r*T)', () => {
    const testCases = [
      { S: 450, K: 450, T: 30 / 365, r: 0.0525, sigma: 0.28 },
      { S: 1200, K: 1150, T: 60 / 365, r: 0.045, sigma: 0.35 },
      { S: 85, K: 90, T: 14 / 365, r: 0.05, sigma: 0.40 },
      { S: 50, K: 50, T: 1.0, r: 0.06, sigma: 0.22 }
    ];

    for (const { S, K, T, r, sigma } of testCases) {
      const c = priceCall(S, K, T, r, sigma);
      const p = pricePut(S, K, T, r, sigma);
      const parity = verifyPutCallParity(c, p, S, K, T, r);

      assert.ok(parity.isValid, `Put-Call parity must hold for S=${S}, K=${K}. Diff: ${parity.difference}`);
      assert.ok(parity.difference < 1e-3, `Difference must be < 0.001, got ${parity.difference}`);
    }
  });

  await t.test('4. The Greeks analytical properties and relationships', () => {
    const S = 450;
    const K = 450;
    const T = 30 / 365;
    const r = 0.0525;
    const sigma = 0.30;

    const greeks = calculateGreeks(S, K, T, r, sigma);

    // Delta: Call in (0, 1), Put in (-1, 0), Call Delta - Put Delta = 1.0
    assert.ok(greeks.deltaCall > 0.45 && greeks.deltaCall < 0.60, `ATM Call delta should be ~0.50, got ${greeks.deltaCall}`);
    assert.ok(greeks.deltaPut < -0.40 && greeks.deltaPut > -0.55, `ATM Put delta should be ~ -0.50, got ${greeks.deltaPut}`);
    assert.ok(Math.abs((greeks.deltaCall - greeks.deltaPut) - 1.0) < 1e-3, 'Call Delta - Put Delta must equal 1.0');

    // Gamma: Strictly positive
    assert.ok(greeks.gamma > 0, `Gamma must be strictly positive, got ${greeks.gamma}`);

    // Vega: Strictly positive
    assert.ok(greeks.vega > 0, `Vega must be strictly positive, got ${greeks.vega}`);

    // Theta: Negative for long options (time decay)
    assert.ok(greeks.thetaCall < 0, `Call Theta must be negative, got ${greeks.thetaCall}`);
    assert.ok(greeks.thetaPut < 0, `Put Theta must be negative, got ${greeks.thetaPut}`);

    // Rho: Positive for Call, negative for Put
    assert.ok(greeks.rhoCall > 0, `Call Rho must be positive, got ${greeks.rhoCall}`);
    assert.ok(greeks.rhoPut < 0, `Put Rho must be negative, got ${greeks.rhoPut}`);
  });

  await t.test('5. Implied Volatility numerical solver recovers known volatilities', () => {
    const S = 200;
    const K = 205;
    const T = 45 / 365;
    const r = 0.05;
    const trueSigma = 0.32; // 32% target volatility

    // Call IV recovery
    const marketCallPrice = priceCall(S, K, T, r, trueSigma);
    const recoveredCallIV = calculateImpliedVolatility(marketCallPrice, S, K, T, r, true);
    assert.ok(recoveredCallIV !== null, 'Call IV solver must converge');
    assert.ok(Math.abs(recoveredCallIV - trueSigma) < 1e-3, `Expected IV ~0.32, got ${recoveredCallIV}`);

    // Put IV recovery
    const marketPutPrice = pricePut(S, K, T, r, trueSigma);
    const recoveredPutIV = calculateImpliedVolatility(marketPutPrice, S, K, T, r, false);
    assert.ok(recoveredPutIV !== null, 'Put IV solver must converge');
    assert.ok(Math.abs(recoveredPutIV - trueSigma) < 1e-3, `Expected Put IV ~0.32, got ${recoveredPutIV}`);

    // Edge case: Price below intrinsic returns null
    const impossiblePrice = 1.0; // Intrinsic is 20 for S=120, K=100
    const invalidIV = calculateImpliedVolatility(impossiblePrice, 120, 100, T, r, true);
    assert.equal(invalidIV, null, 'Impossible option price below intrinsic must return null');
  });

  await t.test('6. OptionsChainManager generates structured multi-expiration options chains', () => {
    // Mock MarketManager with sample equities
    const mockCompanies = new Map([
      ['AUTO', { symbol: 'AUTO', price: 450.0, annualVolatility: 0.28 }],
      ['BYTE', { symbol: 'BYTE', price: 1250.0, annualVolatility: 0.35 }]
    ]);

    const mockMarket = {
      getCompany: (sym) => mockCompanies.get(sym),
      getAllCompanies: () => Array.from(mockCompanies.values()),
      simulationNews: {
        getWorldState: () => ({ interestRate: 5.25 })
      }
    };

    const manager = new OptionsChainManager(mockMarket);
    const chain = manager.getOptionChain('AUTO');

    assert.equal(chain.symbol, 'AUTO');
    assert.equal(chain.underlyingPrice, 450.0);
    assert.equal(chain.annualVolatility, 0.28);
    assert.equal(chain.riskFreeRate, 5.25);
    assert.ok(Array.isArray(chain.expirations), 'Expirations must be an array');
    assert.equal(chain.expirations.length, 4, 'Must have 4 expiration cycles (7D, 14D, 30D, 60D)');

    const firstExp = chain.expirations[0];
    assert.equal(firstExp.daysToExpiry, 7);
    assert.ok(firstExp.strikes.length >= 7, 'Must have multiple strike rows around spot');

    // Check strike row structure
    const sampleRow = firstExp.strikes[0];
    assert.ok(sampleRow.strike > 0);
    assert.ok(sampleRow.call && sampleRow.put);
    assert.ok(sampleRow.call.bid <= sampleRow.call.ask, 'Call bid must be <= ask');
    assert.ok(sampleRow.put.bid <= sampleRow.put.ask, 'Put bid must be <= ask');
    assert.ok(sampleRow.call.delta !== undefined);
    assert.ok(sampleRow.call.openInterest > 0);

    // Custom option pricing query
    const custom = manager.priceCustomOption({
      spot: 100,
      strike: 100,
      days: 30,
      rate: 5.0,
      volatility: 0.20,
      isCall: true
    });
    assert.equal(custom.type, 'CALL');
    assert.ok(custom.theoreticalPrice > 0);
    assert.ok(custom.greeks.delta > 0);
    assert.ok(custom.parity.isValid);
  });
});
