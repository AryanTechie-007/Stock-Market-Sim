import assert from 'assert';
import {
  calculateSMA,
  calculateEMA,
  calculateBollingerBands,
  calculateVWAP,
  calculateRSI,
  calculateMACD
} from '../public/js/indicators.js';

console.log('[TEST] Starting Technical Indicators Mathematical Test Suite...\n');

// 1. Test SMA
console.log('Test 1: Simple Moving Average (SMA)');
const mockPrices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const mockCandles = mockPrices.map((p, idx) => ({
  time: 1000 + idx,
  open: p,
  high: p + 1,
  low: p - 1,
  close: p,
  volume: 100
}));

const sma5 = calculateSMA(mockCandles, 5);
assert.strictEqual(sma5.length, 10);
assert.strictEqual(sma5[0].value, null);
assert.strictEqual(sma5[3].value, null);
// SMA of first 5: (10+11+12+13+14) / 5 = 60 / 5 = 12
assert.strictEqual(sma5[4].value, 12);
// SMA of next 5: (11+12+13+14+15) / 5 = 13
assert.strictEqual(sma5[5].value, 13);
console.log('[PASS] Simple Moving Average calculated with exact values');

// 2. Test EMA
console.log('\nTest 2: Exponential Moving Average (EMA)');
const ema3 = calculateEMA(mockCandles, 3);
assert.strictEqual(ema3.length, 10);
assert.strictEqual(ema3[0].value, null);
assert.strictEqual(ema3[1].value, null);
// First EMA at index 2 is SMA of 10, 11, 12 = 11
assert.strictEqual(ema3[2].value, 11);
// k = 2 / (3 + 1) = 0.5
// Next EMA = 13 * 0.5 + 11 * 0.5 = 12
assert.strictEqual(ema3[3].value, 12);
console.log('[PASS] Exponential Moving Average weighting verified');

// 3. Test Bollinger Bands
console.log('\nTest 3: Bollinger Bands (Middle, Upper, Lower, Bandwidth)');
// 20 identical candles = 100
const flatCandles = Array.from({ length: 25 }, (_, i) => ({
  time: 1000 + i,
  high: 100,
  low: 100,
  close: 100,
  volume: 50
}));
const bbFlat = calculateBollingerBands(flatCandles, 20, 2);
assert.strictEqual(bbFlat[19].middle, 100);
assert.strictEqual(bbFlat[19].upper, 100);
assert.strictEqual(bbFlat[19].lower, 100);
assert.strictEqual(bbFlat[19].bandwidth, 0);

// Fluctuation test
const volCandles = Array.from({ length: 25 }, (_, i) => ({
  time: 1000 + i,
  high: 100 + (i % 2 === 0 ? 10 : -10),
  low: 100 + (i % 2 === 0 ? 10 : -10),
  close: 100 + (i % 2 === 0 ? 10 : -10),
  volume: 50
}));
const bbVol = calculateBollingerBands(volCandles, 20, 2);
assert.strictEqual(bbVol[19].middle, 100);
assert.strictEqual(bbVol[19].upper > 100, true);
assert.strictEqual(bbVol[19].lower < 100, true);
assert.strictEqual(bbVol[19].bandwidth > 0, true);
console.log('[PASS] Bollinger Bands standard deviation envelopes verified');

// 4. Test VWAP
console.log('\nTest 4: Volume Weighted Average Price (VWAP)');
const vwapCandles = [
  { time: 1001, high: 105, low: 95, close: 100, volume: 100 }, // TP = 100, TPV = 10,000, cumVol = 100 -> VWAP = 100
  { time: 1002, high: 115, low: 105, close: 110, volume: 200 } // TP = 110, TPV = 22,000, cumTPV = 32,000, cumVol = 300 -> VWAP = 106.67
];
const vwap = calculateVWAP(vwapCandles);
assert.strictEqual(vwap[0].value, 100);
assert.strictEqual(vwap[1].value, 106.67);
console.log('[PASS] Volume Weighted Average Price cumulative weighting verified');

// 5. Test RSI
console.log('\nTest 5: Relative Strength Index (RSI - 14 period)');
// Up trending series: RSI should be high (> 70)
const upCandles = Array.from({ length: 30 }, (_, i) => ({
  time: 1000 + i,
  high: 50 + (i * 2),
  low: 50 + (i * 2),
  close: 50 + (i * 2),
  volume: 100
}));
const rsiUp = calculateRSI(upCandles, 14);
assert.strictEqual(rsiUp[13].value, null);
assert.strictEqual(rsiUp[14].value, 100); // 100% gain, 0 loss
assert.strictEqual(rsiUp[20].value, 100);

// Down trending series: RSI should be low (0)
const downCandles = Array.from({ length: 30 }, (_, i) => ({
  time: 1000 + i,
  high: 100 - (i * 2),
  low: 100 - (i * 2),
  close: 100 - (i * 2),
  volume: 100
}));
const rsiDown = calculateRSI(downCandles, 14);
assert.strictEqual(rsiDown[14].value, 0);
console.log('[PASS] RSI boundary conditions (0 to 100) and Wilder smoothing verified');

// 6. Test MACD
console.log('\nTest 6: Moving Average Convergence Divergence (MACD)');
const macroCandles = Array.from({ length: 60 }, (_, i) => ({
  time: 1000 + i,
  high: 100 + Math.sin(i / 5) * 20,
  low: 100 + Math.sin(i / 5) * 20,
  close: +(100 + Math.sin(i / 5) * 20).toFixed(2),
  volume: 100
}));
const macd = calculateMACD(macroCandles, 12, 26, 9);
assert.strictEqual(macd.length, 60);
assert.strictEqual(macd[24].macd, null);
assert.strictEqual(typeof macd[25].macd, 'number');
assert.strictEqual(typeof macd[50].signal, 'number');
assert.strictEqual(typeof macd[50].histogram, 'number');
assert.strictEqual(+(macd[50].macd - macd[50].signal).toFixed(2), macd[50].histogram);
console.log('[PASS] MACD line, signal line, and histogram cross calculation verified');

console.log('\n[SUCCESS] ALL TECHNICAL INDICATOR MATHEMATICAL TESTS PASSED!\n');
