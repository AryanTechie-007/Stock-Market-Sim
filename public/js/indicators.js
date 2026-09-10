/**
 * Institutional Technical Analysis Indicator Mathematics Library
 * MarketArena Terminal - Zero-dependency OHLCV computational engine
 */

/**
 * Calculate Simple Moving Average (SMA)
 * @param {Array<{time: number, close: number}>} candles
 * @param {number} period
 * @returns {Array<{time: number, value: number|null}>}
 */
export function calculateSMA(candles, period = 20) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const result = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push({ time: candles[i].time, value: null });
      continue;
    }

    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += candles[i - j].close;
    }
    result.push({
      time: candles[i].time,
      value: +(sum / period).toFixed(2)
    });
  }

  return result;
}

/**
 * Calculate Exponential Moving Average (EMA)
 * @param {Array<{time: number, close: number}>} candles
 * @param {number} period
 * @returns {Array<{time: number, value: number|null}>}
 */
export function calculateEMA(candles, period = 9) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const result = [];
  const k = 2 / (period + 1);

  let prevEma = null;
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push({ time: candles[i].time, value: null });
      continue;
    }

    if (prevEma === null) {
      // First EMA is the SMA of the initial period
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += candles[i - j].close;
      }
      prevEma = sum / period;
    } else {
      prevEma = (candles[i].close * k) + (prevEma * (1 - k));
    }

    result.push({
      time: candles[i].time,
      value: +prevEma.toFixed(2)
    });
  }

  return result;
}

/**
 * Calculate Bollinger Bands (Middle SMA, Upper Band, Lower Band)
 * @param {Array<{time: number, close: number}>} candles
 * @param {number} period (default 20)
 * @param {number} stdDevMultiplier (default 2)
 * @returns {Array<{time: number, middle: number|null, upper: number|null, lower: number|null, bandwidth: number|null}>}
 */
export function calculateBollingerBands(candles, period = 20, stdDevMultiplier = 2) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const result = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push({ time: candles[i].time, middle: null, upper: null, lower: null, bandwidth: null });
      continue;
    }

    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += candles[i - j].close;
    }
    const mean = sum / period;

    let varianceSum = 0;
    for (let j = 0; j < period; j++) {
      const diff = candles[i - j].close - mean;
      varianceSum += diff * diff;
    }
    const stdDev = Math.sqrt(varianceSum / period);

    const upper = +(mean + (stdDevMultiplier * stdDev)).toFixed(2);
    const lower = +(mean - (stdDevMultiplier * stdDev)).toFixed(2);
    const middle = +mean.toFixed(2);
    const bandwidth = middle > 0 ? +(((upper - lower) / middle) * 100).toFixed(2) : 0;

    result.push({
      time: candles[i].time,
      middle,
      upper,
      lower,
      bandwidth
    });
  }

  return result;
}

/**
 * Calculate Volume Weighted Average Price (VWAP)
 * @param {Array<{time: number, high: number, low: number, close: number, volume: number}>} candles
 * @returns {Array<{time: number, value: number}>}
 */
export function calculateVWAP(candles) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const result = [];

  let cumTypicalPriceVol = 0;
  let cumVolume = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 0;

    cumTypicalPriceVol += typicalPrice * vol;
    cumVolume += vol;

    const vwapVal = cumVolume > 0 ? cumTypicalPriceVol / cumVolume : c.close;
    result.push({
      time: c.time,
      value: +vwapVal.toFixed(2)
    });
  }

  return result;
}

/**
 * Calculate Relative Strength Index (RSI - Wilder's Smoothed)
 * @param {Array<{time: number, close: number}>} candles
 * @param {number} period (default 14)
 * @returns {Array<{time: number, value: number|null}>}
 */
export function calculateRSI(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const result = [];

  let prevAvgGain = null;
  let prevAvgLoss = null;

  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      result.push({ time: candles[i].time, value: null });
      if (i === period - 1) {
        // Compute initial average gain and loss
        let sumGain = 0;
        let sumLoss = 0;
        for (let j = 1; j <= period; j++) {
          const diff = candles[j].close - candles[j - 1].close;
          if (diff > 0) sumGain += diff;
          else sumLoss += Math.abs(diff);
        }
        prevAvgGain = sumGain / period;
        prevAvgLoss = sumLoss / period;
      }
      continue;
    }

    const change = candles[i].close - candles[i - 1].close;
    const currentGain = change > 0 ? change : 0;
    const currentLoss = change < 0 ? Math.abs(change) : 0;

    // Wilder's Smoothing
    prevAvgGain = (prevAvgGain * (period - 1) + currentGain) / period;
    prevAvgLoss = (prevAvgLoss * (period - 1) + currentLoss) / period;

    let rsi;
    if (prevAvgLoss === 0) {
      rsi = 100;
    } else if (prevAvgGain === 0) {
      rsi = 0;
    } else {
      const rs = prevAvgGain / prevAvgLoss;
      rsi = 100 - (100 / (1 + rs));
    }

    result.push({
      time: candles[i].time,
      value: +rsi.toFixed(2)
    });
  }

  return result;
}

/**
 * Calculate Moving Average Convergence Divergence (MACD)
 * @param {Array<{time: number, close: number}>} candles
 * @param {number} fastPeriod (default 12)
 * @param {number} slowPeriod (default 26)
 * @param {number} signalPeriod (default 9)
 * @returns {Array<{time: number, macd: number|null, signal: number|null, histogram: number|null}>}
 */
export function calculateMACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const fastEma = calculateEMA(candles, fastPeriod);
  const slowEma = calculateEMA(candles, slowPeriod);

  // MACD Line = Fast EMA - Slow EMA
  const macdLine = [];
  for (let i = 0; i < candles.length; i++) {
    if (fastEma[i].value !== null && slowEma[i].value !== null) {
      macdLine.push({
        time: candles[i].time,
        close: +(fastEma[i].value - slowEma[i].value).toFixed(2)
      });
    } else {
      macdLine.push({
        time: candles[i].time,
        close: 0
      });
    }
  }

  // Signal Line = EMA of MACD Line
  const validMacdStartIndex = slowPeriod - 1;
  const validMacdCandles = macdLine.slice(validMacdStartIndex);
  const signalEma = calculateEMA(validMacdCandles, signalPeriod);

  const result = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < validMacdStartIndex) {
      result.push({ time: candles[i].time, macd: null, signal: null, histogram: null });
      continue;
    }

    const macdVal = macdLine[i].close;
    const signalIdx = i - validMacdStartIndex;
    const signalVal = signalEma[signalIdx] ? signalEma[signalIdx].value : null;
    const histogram = signalVal !== null ? +(macdVal - signalVal).toFixed(2) : null;

    result.push({
      time: candles[i].time,
      macd: macdVal,
      signal: signalVal,
      histogram
    });
  }

  return result;
}

// Attach to global window if running in browser
if (typeof window !== 'undefined') {
  window.Indicators = {
    calculateSMA,
    calculateEMA,
    calculateBollingerBands,
    calculateVWAP,
    calculateRSI,
    calculateMACD
  };
}
