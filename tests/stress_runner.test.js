import assert from 'assert';
import { execSync } from 'child_process';

console.log('[TEST] Starting MarketArena Multi-Round Platform Stress Runner...\n');

const suites = [
  { name: 'v0.8 API Security & Rate Limiting', cmd: 'node tests/api_security.test.js' },
  { name: 'v0.8 RESTful API Endpoints', cmd: 'node tests/rest_api.test.js' },
  { name: 'v0.8 Developer SDKs (JS & Python)', cmd: 'node tests/sdk_client.test.js' },
  { name: 'v0.8 E2E Programmatic Bot Simulation', cmd: 'node tests/v08_e2e_simulation.js' },
  { name: 'v0.9 Frontend Modernization Suite', cmd: 'node tests/v09_frontend_modernization.test.js' },
  { name: 'v0.904 User Authentication & Session Security', cmd: 'node tests/auth.test.js' }
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
