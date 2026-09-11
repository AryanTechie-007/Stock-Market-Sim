import assert from 'assert';
import { execSync } from 'child_process';

console.log('[TEST] Starting MarketArena Multi-Round Platform Stress Runner...\n');

const suites = [
  { name: 'v0.8 API Security & Rate Limiting', cmd: 'node tests/api_security.test.js' },
  { name: 'v0.8 RESTful API Endpoints', cmd: 'node tests/rest_api.test.js' },
  { name: 'v0.8 Developer SDKs (JS & Python)', cmd: 'node tests/sdk_client.test.js' },
  { name: 'v0.8 E2E Programmatic Bot Simulation', cmd: 'node tests/v08_e2e_simulation.js' },
  { name: 'v0.9 Frontend Modernization Suite', cmd: 'node tests/v09_frontend_modernization.test.js' },
  { name: 'v0.904 User Authentication & Session Security', cmd: 'node tests/auth.test.js' },
  { name: 'v0.905 Geometric Brownian Motion (GBM) Price Discovery', cmd: 'node tests/gbm.test.js' },
  { name: 'v0.906 News Impact Decay & Spike-and-Settle Engine', cmd: 'node tests/news_decay.test.js' },
  { name: 'v0.907 Opening Auction Mechanism & Call Market', cmd: 'node tests/opening_auction.test.js' },
  { name: 'v0.907 Simulation World, Multi-Asset & NPC Fleet', cmd: 'node tests/simulation_world.test.js' },
  { name: 'v0.908 Multi-Asset Correlation via Cholesky Factorization', cmd: 'node tests/cholesky_correlation.test.js' },
  { name: 'v0.909 Order Book Imbalance (OBI) & Adverse Selection Quoting', cmd: 'node tests/obi_signals.test.js' },
  { name: 'v0.910 Closing Call Auction & MOC/LOC Orders', cmd: 'node tests/closing_auction.test.js' },
  { name: 'v0.911 Indicative Auction Call HUD & Macro Bar', cmd: 'node tests/terminal_auction_macro.test.js' },
  { name: 'v0.912 Options Chains & Black-Scholes Derivatives', cmd: 'node tests/options_derivatives.test.js' },
  { name: 'v0.913 Dark Pool & ATS Midpoint Cross', cmd: 'node tests/darkpool_ats.test.js' },
  { name: 'v0.914 Pluggable Database & PostgreSQL Adapter', cmd: 'node tests/database_adapter.test.js' }
];

const ROUNDS = parseInt(process.env.STRESS_ROUNDS || '5', 10);
const metrics = [];

console.log(`Executing ${ROUNDS} consecutive rounds across ${suites.length} target suites (${ROUNDS * suites.length} executions total)...\n`);

for (let round = 1; round <= ROUNDS; round++) {
  console.log(`=======================================================`);
  console.log(`>>> ITERATION ROUND ${round} OF ${ROUNDS}`);
  console.log(`=======================================================`);

  for (const s of suites) {
    const start = Date.now();
    try {
      execSync(s.cmd, { stdio: 'pipe' });
      const elapsed = Date.now() - start;
      console.log(`[PASS] Round ${round} | ${s.name} (${elapsed}ms)`);
      metrics.push({ round, suite: s.name, passed: true, elapsed });
    } catch (err) {
      const elapsed = Date.now() - start;
      console.error(`[FAIL] Round ${round} | ${s.name} (${elapsed}ms):`, err.stderr?.toString() || err.message);
      metrics.push({ round, suite: s.name, passed: false, elapsed });
      assert.fail(`Stress verification failed on round ${round} in suite ${s.name}`);
    }
  }
  console.log('');
}

const totalPassed = metrics.filter(m => m.passed).length;
const totalRuns = metrics.length;
const avgTime = (metrics.reduce((acc, m) => acc + m.elapsed, 0) / totalRuns).toFixed(1);

console.log('=======================================================');
console.log(`STRESS RESULTS: ${totalPassed}/${totalRuns} PASSED (Average: ${avgTime}ms/suite)`);
console.log('=======================================================');

assert.strictEqual(totalPassed, totalRuns, 'All stress test iterations must pass');
console.log('\n[SUCCESS] MULTI-ROUND STRESS TEST COMPLETED WITH 100% RELIABILITY!\n');
process.exit(0);
