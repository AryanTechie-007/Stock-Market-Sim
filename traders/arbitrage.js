import { BaseTrader } from './base.js';

/**
 * Statistical Arbitrage Trader (Pairs Trading)
 * Identifies pricing inefficiencies and ratio divergences across correlated assets.
 * Executes mean-reverting paired orders when Z-score diverges > 1.8 sigma.
 */
export class StatisticalArbitrageTrader extends BaseTrader {
  constructor(id, name, matchingEngine, marketManager, accountManager, clock, options = {}) {
    super(id, name, 'STAT_ARBITRAGE', matchingEngine, marketManager, accountManager, clock, {
      minDelayMs: 1200,
      maxDelayMs: 3000,
      initialCredits: 1500000,
      initialShares: 3000,
      ...options
    });

    // Monitored pairs
    this.pairs = [
      { symA: 'AUTO', symB: 'SOLR', history: [], activePosition: null },
      { symA: 'BYTE', symB: 'NBNK', history: [], activePosition: null }
    ];

    this.zThreshold = options.zThreshold || 1.8;
    this.exitThreshold = options.exitThreshold || 0.5;
    this.historyWindow = options.historyWindow || 25;
  }

  act() {
    const prices = this.marketManager.getCurrentPrices();

    for (const pair of this.pairs) {
      const pxA = prices[pair.symA];
      const pxB = prices[pair.symB];
      if (!pxA || !pxB || pxB === 0) continue;

      const currentRatio = +(pxA / pxB).toFixed(4);
      pair.history.push(currentRatio);
      if (pair.history.length > this.historyWindow) {
        pair.history.shift();
      }

      // Need minimum history window to calculate meaningful statistics
      if (pair.history.length < 8) continue;

      const stats = this._calculateZScore(pair.history, currentRatio);
      const z = stats.zScore;

      // Check if we need to close existing position (mean-reversion unwinding)
      if (pair.activePosition) {
        if (Math.abs(z) <= this.exitThreshold) {
          this._unwindPairPosition(pair, prices);
        }
        continue;
      }

      // Check for entry triggers
      if (z >= this.zThreshold) {
        // Asset A is rich relative to Asset B -> Sell/Short A, Buy B
        this._enterPairPosition(pair, 'SHORT_A_BUY_B', pxA, pxB, z);
      } else if (z <= -this.zThreshold) {
        // Asset A is cheap relative to Asset B -> Buy A, Sell/Short B
        this._enterPairPosition(pair, 'BUY_A_SHORT_B', pxA, pxB, z);
      }
    }
  }

  _calculateZScore(history, currentRatio) {
    const sum = history.reduce((acc, val) => acc + val, 0);
    const mean = sum / history.length;
    const variance = history.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / history.length;
    const stdDev = Math.sqrt(variance);

    const zScore = stdDev > 0.0001 ? +((currentRatio - mean) / stdDev).toFixed(2) : 0;
    return { mean, stdDev, zScore };
  }

  _enterPairPosition(pair, type, pxA, pxB, zScore) {
    const capitalPerLeg = 25000;
    const qtyA = Math.max(5, Math.floor(capitalPerLeg / pxA));
    const qtyB = Math.max(5, Math.floor(capitalPerLeg / pxB));

    if (type === 'SHORT_A_BUY_B') {
      // Sell A, Buy B
      this.submitOrder({ symbol: pair.symA, side: 'SELL', type: 'MARKET', price: pxA, quantity: qtyA });
      this.submitOrder({ symbol: pair.symB, side: 'BUY', type: 'MARKET', price: pxB, quantity: qtyB });
    } else {
      // Buy A, Sell B
      this.submitOrder({ symbol: pair.symA, side: 'BUY', type: 'MARKET', price: pxA, quantity: qtyA });
      this.submitOrder({ symbol: pair.symB, side: 'SELL', type: 'MARKET', price: pxB, quantity: qtyB });
    }

    pair.activePosition = {
      type,
      entryZ: zScore,
      qtyA,
      qtyB,
      entryTime: Date.now()
    };
  }

  _unwindPairPosition(pair, prices) {
    const pos = pair.activePosition;
    if (!pos) return;

    const pxA = prices[pair.symA];
    const pxB = prices[pair.symB];

    if (pos.type === 'SHORT_A_BUY_B') {
      // Reverse: Buy A back, Sell B
      this.submitOrder({ symbol: pair.symA, side: 'BUY', type: 'MARKET', price: pxA, quantity: pos.qtyA });
      this.submitOrder({ symbol: pair.symB, side: 'SELL', type: 'MARKET', price: pxB, quantity: pos.qtyB });
    } else {
      // Reverse: Sell A, Buy B back
      this.submitOrder({ symbol: pair.symA, side: 'SELL', type: 'MARKET', price: pxA, quantity: pos.qtyA });
      this.submitOrder({ symbol: pair.symB, side: 'BUY', type: 'MARKET', price: pxB, quantity: pos.qtyB });
    }

    pair.activePosition = null;
  }
}
