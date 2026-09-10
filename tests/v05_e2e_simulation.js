import { io } from 'socket.io-client';
import assert from 'assert';
import {
  calculateSMA,
  calculateEMA,
  calculateBollingerBands,
  calculateVWAP,
  calculateRSI,
  calculateMACD
} from '../public/js/indicators.js';

console.log('[E2E TEST] Starting Tier 3 (v0.5) Technical Analysis & Multi-Timeframe live verification...\n');

const client = io('http://localhost:3000');

client.on('connect', async () => {
  console.log('[1/3] Connected to server, requesting multi-timeframe candles...');

  const timeframes = ['1s', '5s', '15s', '1m', '5m'];
  for (const tf of timeframes) {
    await new Promise((resolve) => {
      client.emit('chart:history', { symbol: 'AUTO', timeframe: tf }, (candles) => {
        assert.strictEqual(Array.isArray(candles), true, `Candles for ${tf} must be an array`);
        assert.strictEqual(candles.length > 0, true, `Candles for ${tf} must not be empty`);
        const last = candles[candles.length - 1];
        assert.strictEqual(typeof last.close, 'number');
        assert.strictEqual(typeof last.volume, 'number');
        console.log(`[PASS] Timeframe ${tf}: received ${candles.length} candles (latest close: ${last.close.toFixed(2)} CR)`);
        resolve();
      });
    });
  }

  console.log('[2/3] Verifying technical indicators calculated over live multi-timeframe candles...');
  client.emit('chart:history', { symbol: 'AUTO', timeframe: '5s' }, (candles) => {
    const sma20 = calculateSMA(candles, 20);
    const ema9 = calculateEMA(candles, 9);
    const bb = calculateBollingerBands(candles, 20, 2);
    const vwap = calculateVWAP(candles);
    const rsi = calculateRSI(candles, 14);
    const macd = calculateMACD(candles, 12, 26, 9);

    assert.strictEqual(sma20.length, candles.length);
    assert.strictEqual(ema9.length, candles.length);
    assert.strictEqual(bb.length, candles.length);
    assert.strictEqual(vwap.length, candles.length);
    assert.strictEqual(rsi.length, candles.length);
    assert.strictEqual(macd.length, candles.length);

    console.log(`[PASS] SMA20, EMA9, Bollinger Bands, VWAP, RSI14, MACD calculated over ${candles.length} candles`);
    console.log('[3/3] Live WebSocket Technical Analysis & Multi-Timeframe verification complete!\n');

    client.disconnect();
    process.exit(0);
  });
});
