import assert from 'assert';
import { MarketRegimeEngine } from '../engine/regimes.js';

console.log('[TEST] Starting Adaptive Market Regime Engine Test Suite...\n');

// Test 1: Initial Default Regime
console.log('Test 1: Initial Default Regime');
const regimeEngine = new MarketRegimeEngine();
const initial = regimeEngine.getRegime();
assert.strictEqual(initial.name, 'NORMAL');
assert.strictEqual(initial.volatilityMultiplier, 1.0);
assert.strictEqual(initial.spreadMultiplier, 1.0);
console.log('[PASS] Initial regime defaults to NORMAL with 1.0x baseline multipliers\n');

// Test 2: Manual Transition and Multipliers
console.log('Test 2: Manual Transition and Multipliers');
let eventFired = false;
regimeEngine.once('regimeChange', (event) => {
  eventFired = true;
  assert.strictEqual(event.name, 'HIGH_VOLATILITY');
  assert.strictEqual(event.previousRegime, 'NORMAL');
  assert(event.spreadMultiplier >= 2.0);
});

regimeEngine.setRegime('HIGH_VOLATILITY', 30);
const highVol = regimeEngine.getRegime();
assert.strictEqual(highVol.name, 'HIGH_VOLATILITY');
assert.strictEqual(highVol.remainingSec, 30);
assert.strictEqual(eventFired, true);
console.log('[PASS] Regime transition correctly sets multipliers and emits regimeChange event\n');

// Test 3: Tick Decrement and Expiration Transition
console.log('Test 3: Tick Decrement and Expiration Transition');
regimeEngine.setRegime('FLASH_CRASH', 2);
assert.strictEqual(regimeEngine.getRegime().name, 'FLASH_CRASH');

regimeEngine.tick();
assert.strictEqual(regimeEngine.getRegime().remainingSec, 1);

let postCrashEvent = false;
regimeEngine.once('regimeChange', (event) => {
  postCrashEvent = true;
  assert(event.name === 'HIGH_VOLATILITY' || event.name === 'NORMAL', 'Flash crash should recover to HIGH_VOLATILITY or NORMAL');
});

regimeEngine.tick(); // Expires, triggers transition
assert.strictEqual(postCrashEvent, true);
assert.notStrictEqual(regimeEngine.getRegime().name, 'FLASH_CRASH');
console.log('[PASS] Regime timer ticks and transitions upon expiration\n');

console.log('[SUCCESS] ALL ADAPTIVE MARKET REGIME ENGINE TESTS PASSED!\n');
process.exit(0);
