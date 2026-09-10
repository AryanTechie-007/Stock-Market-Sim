import { BaseTrader } from './base.js';

/**
 * Momentum Trader
 * Follows short-term price velocity and breakouts.
 * Buys when candles trend upward; sells when momentum reverses downward.
 */
export class MomentumTrader extends BaseTrader {
  constructor(id, name, matchingEngine, marketManager, accountManager, clock, options = {}) {
    super(id, name, 'MOMENTUM', matchingEngine, marketManager, accountManager, clock, {
      minDelayMs: 2000,
      maxDelayMs: 4500,
      initialCredits: 750000,
      initialShares: 2000,
      ...options
    });
  }

  act() {
    const companies = this.marketManager.getAllCompanies();
    const comp = companies[Math.floor(Math.random() * companies.length)];
    if (!comp) return;

    const candles = this.marketManager.getCandles(comp.symbol);
    if (candles.length < 5) return;

    // Check last 5 candles momentum
    const recent = candles.slice(-5);
    const startPrice = recent[0].open;
    const endPrice = recent[recent.length - 1].close;
    const returnPct = (endPrice - startPrice) / startPrice;

    const depth = this.matchingEngine.getDepth(comp.symbol, 3);
    if (!depth) return;

    if (returnPct > 0.005) {
      // Upward trend: Buy aggressively with Market Order or top Ask
      const qty = Math.floor(Math.random() * 15 + 5);
      this.submitOrder({
        symbol: comp.symbol,
        side: 'BUY',
        type: 'MARKET',
        price: comp.price,
        quantity: qty
      });
    } else if (returnPct < -0.005) {
      // Downward trend: Sell to cut losses or ride downtrend
      const holding = this.accountManager.getUser(this.id)?.holdings.get(comp.symbol);
      if (holding && holding.quantity > 5) {
        const qty = Math.min(holding.quantity, Math.floor(Math.random() * 15 + 5));
        this.submitOrder({
          symbol: comp.symbol,
          side: 'SELL',
          type: 'MARKET',
          price: comp.price,
          quantity: qty
        });
      }
    }
  }
}
