import assert from 'assert';
import { MarketManager, INITIAL_COMPANIES, ASSET_CORRELATION_SYMBOLS, ASSET_CORRELATION_MATRIX } from '../engine/market.js';
import { MatchingEngine } from '../engine/matching.js';
import { AccountManager } from '../engine/accounts.js';
import { MarketClock } from '../engine/clock.js';

console.log('[TEST] Starting Multi-Asset Cholesky Decomposition Correlation Test Suite (Release v0.908)...\n');

async function run() {
  const clock = new MarketClock();
  const accountManager = new AccountManager(500000);
  const symbols = INITIAL_COMPANIES.map(c => c.symbol);
  const matchingEngine = new MatchingEngine(symbols, accountManager, clock);
  const marketManager = new MarketManager(clock, matchingEngine);

  // -------------------------------------------------------------
  // Test 1: Correlation Matrix Structure & Symmetry Verification
  // -------------------------------------------------------------
  console.log('Test 1: 10x10 Correlation Matrix Symmetry & Diagonal Normalization');
  const corrData = marketManager.getCorrelationMatrix();
  const { symbols: corrSyms, matrix: C } = corrData;

  assert.strictEqual(corrSyms.length, 10, 'Correlation symbols must contain 10 assets');
  assert.strictEqual(C.length, 10, 'Correlation matrix must be 10 rows');

  for (let i = 0; i < 10; i++) {
    assert.strictEqual(C[i].length, 10, `Row ${i} must have 10 columns`);
    assert.strictEqual(C[i][i], 1.0, `Diagonal entry [${i}, ${i}] must be exactly 1.0`);
    for (let j = 0; j < 10; j++) {
      assert(C[i][j] >= -1.0 && C[i][j] <= 1.0, `Correlation [${i}, ${j}] must be in [-1, 1]`);
      const diff = Math.abs(C[i][j] - C[j][i]);
      assert(diff < 1e-9, `Matrix must be symmetric: C[${i}][${j}] (${C[i][j]}) !== C[${j}][${i}] (${C[j][i]})`);
    }
  }
  console.log('  [PASS] Correlation matrix is strictly symmetric with 1.0 main diagonals\n');

  // -------------------------------------------------------------
  // Test 2: Cholesky Factorization Mathematical Reconstruction: L * L^T = Sigma
  // -------------------------------------------------------------
  console.log('Test 2: Analytical Cholesky Factorization Exact Reconstruction (L * L^T = Sigma)');
  const choleskyData = marketManager.getCholeskyMatrix();
  const L = choleskyData.matrix;

  // Verify L is lower-triangular
  for (let i = 0; i < 10; i++) {
    for (let j = i + 1; j < 10; j++) {
      assert.strictEqual(L[i][j], 0, `Upper triangular entry [${i}, ${j}] must be strictly 0`);
    }
    assert(L[i][i] > 0, `Cholesky diagonal L[${i}, ${i}] must be strictly positive (got ${L[i][i]})`);
  }

  // Multiply L by L^T and compare with original C
  let maxError = 0;
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      let sum = 0;
      for (let k = 0; k < 10; k++) {
        sum += L[i][k] * L[j][k]; // L[j][k] is L^T[k][j]
      }
      const error = Math.abs(sum - C[i][j]);
      if (error > maxError) maxError = error;
    }
  }

  console.log(`  Max reconstruction error ||L * L^T - Sigma||: ${maxError.toExponential(4)}`);
  assert(maxError < 1e-6, `Cholesky factor reconstruction error must be < 1e-6 (got ${maxError})`);
  console.log('  [PASS] Cholesky decomposition reconstructs the exact asset correlation matrix\n');

  // -------------------------------------------------------------
  // Test 3: Monte Carlo Empirical Correlation Verification (N = 10,000 Draws)
  // -------------------------------------------------------------
  console.log('Test 3: Monte Carlo Empirical Covariance & Correlation Convergence (N = 10,000)');
  const N = 10000;
  const sampleHistory = Array.from({ length: 10 }, () => new Array(N));

  for (let t = 0; t < N; t++) {
    const shocks = marketManager.getCorrelatedShocks();
    for (let i = 0; i < 10; i++) {
      sampleHistory[i][t] = shocks[corrSyms[i]];
    }
  }

  // Calculate empirical means and variances
  const means = sampleHistory.map(series => series.reduce((a, b) => a + b, 0) / N);
  const stdDevs = sampleHistory.map((series, i) => {
    const variance = series.reduce((acc, val) => acc + Math.pow(val - means[i], 2), 0) / (N - 1);
    return Math.sqrt(variance);
  });

  for (let i = 0; i < 10; i++) {
    assert(Math.abs(means[i]) < 0.05, `Shock mean for ${corrSyms[i]} must be ~0 (got ${means[i].toFixed(4)})`);
    assert(Math.abs(stdDevs[i] - 1.0) < 0.05, `Shock stdDev for ${corrSyms[i]} must be ~1.0 (got ${stdDevs[i].toFixed(4)})`);
  }

  // Test target key correlation pairs:
  // BYTE (idx 2) and SEMI (idx 6): target +0.70
  // AUTO (idx 0) and SOLR (idx 1): target +0.58
  // NBNK (idx 3) and BYTE (idx 2): target -0.15
  function computeEmpiricalCorr(idx1, idx2) {
    let cov = 0;
    for (let t = 0; t < N; t++) {
      cov += (sampleHistory[idx1][t] - means[idx1]) * (sampleHistory[idx2][t] - means[idx2]);
    }
    cov /= (N - 1);
    return cov / (stdDevs[idx1] * stdDevs[idx2]);
  }

  const corrByteSemi = computeEmpiricalCorr(2, 6);
  const corrAutoSolr = computeEmpiricalCorr(0, 1);
  const corrNbnkByte = computeEmpiricalCorr(3, 2);

  console.log(`  BYTE <-> SEMI: Target = +0.70 | Empirical = ${corrByteSemi.toFixed(4)} (diff: ${Math.abs(corrByteSemi - 0.70).toFixed(4)})`);
  console.log(`  AUTO <-> SOLR: Target = +0.58 | Empirical = ${corrAutoSolr.toFixed(4)} (diff: ${Math.abs(corrAutoSolr - 0.58).toFixed(4)})`);
  console.log(`  NBNK <-> BYTE: Target = -0.15 | Empirical = ${corrNbnkByte.toFixed(4)} (diff: ${Math.abs(corrNbnkByte - (-0.15)).toFixed(4)})`);

  assert(Math.abs(corrByteSemi - 0.70) < 0.05, 'Empirical BYTE-SEMI correlation must match target +0.70 within 0.05');
  assert(Math.abs(corrAutoSolr - 0.58) < 0.05, 'Empirical AUTO-SOLR correlation must match target +0.58 within 0.05');
  assert(Math.abs(corrNbnkByte - (-0.15)) < 0.05, 'Empirical NBNK-BYTE correlation must match target -0.15 within 0.05');
  console.log('  [PASS] Monte Carlo empirical correlations converge to analytical targets\n');

  // -------------------------------------------------------------
  // Test 4: Correlated Multi-Asset Price Trajectory Coherence
  // -------------------------------------------------------------
  console.log('Test 4: Stochastic Price Discovery with Correlated Brownian Motion');
  clock.phase = 'REGULAR_HOURS';

  const byteBefore = marketManager.getCompany('BYTE').intrinsicValue;
  const semiBefore = marketManager.getCompany('SEMI').intrinsicValue;

  // Execute 50 correlated simulation ticks
  let sameDirectionCount = 0;
  for (let s = 0; s < 50; s++) {
    const pByteOld = marketManager.getCompany('BYTE').intrinsicValue;
    const pSemiOld = marketManager.getCompany('SEMI').intrinsicValue;

    marketManager.stepGBM();

    const dByte = marketManager.getCompany('BYTE').intrinsicValue - pByteOld;
    const dSemi = marketManager.getCompany('SEMI').intrinsicValue - pSemiOld;

    if ((dByte >= 0 && dSemi >= 0) || (dByte <= 0 && dSemi <= 0)) {
      sameDirectionCount++;
    }
  }

  const coMovementRatio = sameDirectionCount / 50;
  console.log(`  BYTE & SEMI Co-movement Frequency: ${(coMovementRatio * 100).toFixed(1)}% (Random independent would be ~50%, High Corr > 70%)`);
  assert(coMovementRatio >= 0.65, `High correlation pair BYTE-SEMI must co-move >= 65% of steps (got ${(coMovementRatio * 100).toFixed(1)}%)`);
  console.log('  [PASS] High-correlation sector pairs exhibit authentic synchronized price discovery\n');

  // -------------------------------------------------------------
  // Test 5: Long-Horizon Multi-Cycle Stability (500 Steps)
  // -------------------------------------------------------------
  console.log('Test 5: Long-Horizon Multi-Asset Stability Under Correlated Diffusion (500 Steps)');
  for (let s = 0; s < 500; s++) {
    marketManager.stepGBM();
  }

  for (const comp of marketManager.getAllCompanies()) {
    assert(!isNaN(comp.intrinsicValue), `${comp.symbol} intrinsic value must not be NaN`);
    assert(comp.intrinsicValue >= 1.0, `${comp.symbol} intrinsic value must remain strictly positive (got ${comp.intrinsicValue})`);
    assert(isFinite(comp.intrinsicValue), `${comp.symbol} intrinsic value must be finite`);
  }
  console.log('  [PASS] All 10 correlated asset trajectories stable over 500 consecutive simulation steps\n');

  console.log('=================================================================================');
  console.log('[SUCCESS] ALL 5 MULTI-ASSET CHOLESKY CORRELATION TESTS PASSED (100%)!');
  console.log('=================================================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('[FAIL] Cholesky Correlation Test Suite Encountered Error:', err);
  process.exit(1);
});
