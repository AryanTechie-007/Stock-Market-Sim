import assert from 'assert';
import { PerformanceAnalytics } from '../engine/analytics.js';

console.log('[TEST] Starting Quantitative Performance Analytics Test Suite...\n');

// Test 1: Win Rate and Profit Factor
console.log('Test 1: Win Rate & Profit Factor calculation');
const mockTrades = [
  { id: 't1', price: 100, quantity: 10, realizedPnL: 500 },  // Win +500
  { id: 't2', price: 100, quantity: 10, realizedPnL: -200 }, // Loss -200
  { id: 't3', price: 100, quantity: 10, realizedPnL: 300 },  // Win +300
  { id: 't4', price: 100, quantity: 10, realizedPnL: -100 }  // Loss -100
];

const metrics = PerformanceAnalytics.calculateMetrics({
  tradeHistory: mockTrades,
  startingNetWorth: 100000,
  currentNetWorth: 100500
});

assert.strictEqual(metrics.totalClosedTrades, 4);
assert.strictEqual(metrics.winCount, 2);
assert.strictEqual(metrics.lossCount, 2);
assert.strictEqual(metrics.winRate, 50); // 50%
assert.strictEqual(metrics.winLossRatio, 1.0); // 2 / 2 = 1.0
assert.strictEqual(metrics.grossProfit, 800); // 500 + 300
assert.strictEqual(metrics.grossLoss, 300);   // 200 + 100
assert.strictEqual(metrics.profitFactor, 2.67); // 800 / 300 = 2.67
assert.strictEqual(metrics.avgWin, 400); // 800 / 2
assert.strictEqual(metrics.avgLoss, 150); // 300 / 2
console.log('[PASS] Win rate, profit factor, and trade averages accurately computed');

// Test 2: Maximum Drawdown (MDD)
console.log('\nTest 2: Maximum Drawdown (MDD) Peak-to-Trough Calculation');
// Sequence: Starts 100k -> climbs to 120k -> crashes to 90k -> recovers to 110k
// Peak = 120k, Trough = 90k. MDD = (120k - 90k) / 120k = 30k / 120k = 25.00%
const mockEquityCurve = [
  { time: 1000, equity: 100000 },
  { time: 1001, equity: 110000 },
  { time: 1002, equity: 120000 }, // Peak
  { time: 1003, equity: 95000 },
  { time: 1004, equity: 90000 },  // Trough
  { time: 1005, equity: 110000 }
];

const mddMetrics = PerformanceAnalytics.calculateMetrics({
  tradeHistory: [],
  equityCurve: mockEquityCurve,
  startingNetWorth: 100000,
  currentNetWorth: 110000
});

assert.strictEqual(mddMetrics.peakNetWorth, 120000);
assert.strictEqual(mddMetrics.maxDrawdownValue, 30000);
assert.strictEqual(mddMetrics.maxDrawdownPercent, 25);
console.log('[PASS] Maximum drawdown correctly tracks historical peak-to-trough drops');

// Test 3: Sharpe Ratio Calculation
console.log('\nTest 3: Sharpe Ratio Risk-Adjusted Return');
// Consistently profitable returns with low variance should yield a positive Sharpe ratio
const steadyTrades = [
  { id: 't1', price: 100, quantity: 10, realizedPnL: 200 },
  { id: 't2', price: 100, quantity: 10, realizedPnL: 220 },
  { id: 't3', price: 100, quantity: 10, realizedPnL: 190 },
  { id: 't4', price: 100, quantity: 10, realizedPnL: 210 }
];
const steadyMetrics = PerformanceAnalytics.calculateMetrics({
  tradeHistory: steadyTrades,
  startingNetWorth: 100000,
  currentNetWorth: 100820
});
assert.strictEqual(steadyMetrics.sharpeRatio > 0, true);
assert.strictEqual(steadyMetrics.profitFactor, 99.99); // Zero loss benchmark cap
console.log('[PASS] Sharpe ratio positive for consistent risk-adjusted alpha generation');

console.log('\n[SUCCESS] ALL QUANTITATIVE PERFORMANCE ANALYTICS TESTS PASSED!\n');
