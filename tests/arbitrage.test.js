import assert from 'assert';
import { StatisticalArbitrageTrader } from '../traders/arbitrage.js';
import { AccountManager } from '../engine/accounts.js';
import { MatchingEngine } from '../engine/matching.js';
import { MarketClock } from '../engine/clock.js';
import { MarketManager } from '../engine/market.js';
import { SQLiteStorageManager } from '../engine/sqlite-storage.js';

console.log('[TEST] Starting Statistical Arbitrage Trader Test Suite...\n');

const storage = new SQLiteStorageManager(':memory:');
const clock = new MarketClock();
const accountManager = new AccountManager(100000, storage);
const symbols = ['AUTO', 'SOLR', 'BYTE', 'NBNK', 'MEDL'];
const matchingEngine = new MatchingEngine(symbols, accountManager, clock);
const marketManager = new MarketManager(clock, matchingEngine);

const arbBot = new StatisticalArbitrageTrader('bot_arb_test', 'Citadel StatArb', matchingEngine, marketManager, accountManager, clock);

// Test 1: Z-Score Statistical Math
console.log('Test 1: Z-Score Statistical Math');
const sampleHistory = [1.00, 1.01, 0.99, 1.00, 1.02, 0.98, 1.00, 1.01];
const statsNormal = arbBot._calculateZScore(sampleHistory, 1.00);
assert(Math.abs(statsNormal.zScore) < 0.5, 'Mean ratio should have low Z-score');

// Outlier high ratio
const statsHigh = arbBot._calculateZScore(sampleHistory, 1.08);
assert(statsHigh.zScore > 2.0, 'Substantially higher ratio should have Z-score > 2.0');
console.log('[PASS] Z-Score calculation accurately reflects statistical standard deviation bands\n');

// Test 2: Pairs Entry Trigger on High Divergence
console.log('Test 2: Pairs Entry Trigger on High Divergence');
const pair = arbBot.pairs[0]; // AUTO vs SOLR
// Feed history where ratio is stable around 1.0
for (let i = 0; i < 15; i++) {
  pair.history.push(1.00 + (Math.sin(i) * 0.01));
}

// Emulate price divergence: AUTO spikes to 550, SOLR stays at 400 (Ratio = 1.375)
const pricesDivergent = { AUTO: 550, SOLR: 400, BYTE: 300, NBNK: 200, MEDL: 150 };
arbBot.act();

// The bot should have entered a pairs trade: SHORT_A_BUY_B
assert(pair.activePosition !== null, 'Bot should have entered a pairs position');
assert.strictEqual(pair.activePosition.type, 'SHORT_A_BUY_B');
console.log('[PASS] Pairs trade entered on statistical divergence (Z-score:', pair.activePosition.entryZ, ')\n');

// Test 3: Mean Reversion Unwind
console.log('Test 3: Mean Reversion Unwind');
// Ratios revert back to mean
for (let i = 0; i < 15; i++) {
  pair.history.push(1.01);
}
// Current prices reflect mean ratio: AUTO: 404, SOLR: 400 -> Ratio 1.01
const pricesReverted = { AUTO: 404, SOLR: 400, BYTE: 300, NBNK: 200, MEDL: 150 };
marketManager.getCurrentPrices = () => pricesReverted;

arbBot.act();
assert.strictEqual(pair.activePosition, null, 'Active pair position should be unwound upon mean reversion');
console.log('[PASS] Pairs position successfully unwound to lock in arbitrage profit\n');

console.log('[SUCCESS] ALL STATISTICAL ARBITRAGE TRADER TESTS PASSED!\n');
process.exit(0);
