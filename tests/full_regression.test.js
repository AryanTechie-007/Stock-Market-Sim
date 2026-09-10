import assert from 'assert';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('[TEST] Starting MarketArena Full Platform Regression Test Suite...\n');

const testDir = 'tests';
const testFiles = fs.readdirSync(testDir)
  .filter(f => (f.endsWith('.test.js') || f.endsWith('_simulation.js')) && f !== 'full_regression.test.js' && f !== 'stress_runner.test.js')
  .sort();

console.log(`Running complete platform regression across all ${testFiles.length} foundational test suites...\n`);

let passed = 0;
let failed = 0;
const failures = [];

for (const file of testFiles) {
  const filePath = path.join(testDir, file);
  const start = Date.now();
  try {
    execSync('node ' + filePath, { stdio: 'pipe' });
    const elapsed = Date.now() - start;
    console.log(`[PASS] ${file} (${elapsed}ms)`);
    passed++;
  } catch (err) {
    const elapsed = Date.now() - start;
    const msg = err.stderr?.toString() || err.message;
    console.error(`[FAIL] ${file} (${elapsed}ms): ${msg}`);
    failures.push({ file, error: msg });
    failed++;
  }
}

console.log('\n=======================================================');
console.log(`REGRESSION SUMMARY: ${passed}/${testFiles.length} PASSED (${failed} FAILED)`);
console.log('=======================================================');

if (failed > 0) {
  assert.fail(`Platform regression encountered ${failed} failed test suites: ${failures.map(f => f.file).join(', ')}`);
}

console.log('\n[SUCCESS] ALL FOUNDATIONAL PLATFORM TEST SUITES PASSED!\n');
process.exit(0);
