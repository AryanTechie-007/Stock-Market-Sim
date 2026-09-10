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

  reactToNews(newsItem) {
    if (!newsItem || !newsItem.symbols || !this.clock.isTradingOpen()) return;

    for (const sym of newsItem.symbols) {
      if (newsItem.sentiment === 'BULLISH') {
        // High conviction breakout buy on bullish news
        const comp = this.marketManager.getCompany(sym);
        if (comp) {
          const qty = Math.floor(Math.random() * 25 + 15);
          this.submitOrder({
            symbol: sym,
            side: 'BUY',
            type: 'MARKET',
            price: comp.price,
            quantity: qty
          });
        }
      } else if (newsItem.sentiment === 'BEARISH') {
        // Immediate defensive dumping on bearish catalyst
        const holding = this.accountManager.getUser(this.id)?.holdings.get(sym);
        if (holding && holding.quantity > 5) {
          const qty = Math.min(holding.quantity, Math.floor(Math.random() * 25 + 10));
          this.submitOrder({
            symbol: sym,
            side: 'SELL',
            type: 'MARKET',
            price: holding.avgPrice,
            quantity: qty
          });
        }
      }
    }
  }

  act() {
    const companies = this.marketManager.getAllCompanies();
    const comp = companies[Math.floor(Math.random() * companies.length)];
    if (!comp) return;

    const candles = this.marketManager.getCandles(comp.symbol);
    if (candles.length < 8) return;

    // Calculate Fast (3-period) vs Slow (8-period) Simple Moving Average
    const fastCandles = candles.slice(-3);
    const slowCandles = candles.slice(-8);

    const fastSMA = fastCandles.reduce((acc, c) => acc + c.close, 0) / fastCandles.length;
    const slowSMA = slowCandles.reduce((acc, c) => acc + c.close, 0) / slowCandles.length;

    const returnPct = (fastSMA - slowSMA) / slowSMA;

    const depth = this.matchingEngine.getDepth(comp.symbol, 3);
    if (!depth) return;

    if (returnPct > 0.003) {
      // Golden velocity trend: Buy aggressively
      const qty = Math.floor(Math.random() * 20 + 8);
      this.submitOrder({
        symbol: comp.symbol,
        side: 'BUY',
        type: 'MARKET',
        price: comp.price,
        quantity: qty
      });
    } else if (returnPct < -0.003) {
      // Downward velocity: Liquidate position or cut losses
      const holding = this.accountManager.getUser(this.id)?.holdings.get(comp.symbol);
      if (holding && holding.quantity > 5) {
        const qty = Math.min(holding.quantity, Math.floor(Math.random() * 20 + 8));
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
