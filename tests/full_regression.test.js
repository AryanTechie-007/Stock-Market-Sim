import assert from 'assert';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('[TEST] Starting MarketArena Full Platform Regression Test Suite...\n');

let serverProcess = null;
let spawnedOurOwnServer = false;

try {
  const ping = await fetch('http://localhost:3000/api/v1/ping');
  if (ping.ok) {
    console.log('[INIT] Existing MarketArena server detected on port 3000.\n');
  }
} catch (e) {
  console.log('[INIT] No active server detected on port 3000. Spawning test server daemon...');
  serverProcess = spawn('node', ['server.js'], { stdio: 'pipe' });
  spawnedOurOwnServer = true;

  let ready = false;
  for (let attempt = 1; attempt <= 35; attempt++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch('http://localhost:3000/api/v1/ping');
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {}
  }
  if (!ready) {
    console.warn('[WARN] Server did not report ready within 7s, proceeding anyway.');
  } else {
    console.log('[INIT] Test server daemon is ready on port 3000.\n');
  }
}

function cleanupServer() {
  if (spawnedOurOwnServer && serverProcess) {
    try {
      serverProcess.kill('SIGKILL');
    } catch {}
  }
}

process.on('exit', cleanupServer);
process.on('SIGINT', () => { cleanupServer(); process.exit(1); });
process.on('SIGTERM', () => { cleanupServer(); process.exit(1); });

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
