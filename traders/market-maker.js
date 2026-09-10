import { BaseTrader } from './base.js';

/**
 * Market Maker Trader
 * Quotes symmetric bids and asks around the mid price, creating liquidity
 * and tightening the bid-ask spread.
 */
export class MarketMaker extends BaseTrader {
  constructor(id, name, matchingEngine, marketManager, accountManager, clock, options = {}) {
    super(id, name, 'MARKET_MAKER', matchingEngine, marketManager, accountManager, clock, {
      minDelayMs: 1000,
      maxDelayMs: 2500,
      initialCredits: 2000000,
      initialShares: 5000,
      ...options
    });
    this.spreadTarget = options.spreadTarget || 0.008; // 0.8% spread
  }

  act() {
    const companies = this.marketManager.getAllCompanies();
    // Pick one or two companies each turn to refresh quotes
    const target = companies[Math.floor(Math.random() * companies.length)];
    if (!target) return;

    const symbol = target.symbol;
    const depth = this.matchingEngine.getDepth(symbol, 5);
    const lastPrice = target.price;

    // First cancel old quotes for this symbol to refresh ladder
    this.cancelAllMyOrders(symbol);

    const halfSpread = (lastPrice * this.spreadTarget) / 2;
    const levels = [1, 2, 3];

    for (const lvl of levels) {
      const spreadMultiplier = lvl * 0.7;
      const bidPrice = +(lastPrice - halfSpread * spreadMultiplier).toFixed(2);
      const askPrice = +(lastPrice + halfSpread * spreadMultiplier).toFixed(2);

      const qty = Math.floor(Math.random() * 25 + 10 * lvl);

      // Place Limit Buy
      if (bidPrice > 0) {
        this.submitOrder({
          symbol,
          side: 'BUY',
          type: 'LIMIT',
          price: bidPrice,
          quantity: qty
        });
      }

      // Place Limit Sell
      if (askPrice > 0) {
        this.submitOrder({
          symbol,
          side: 'SELL',
          type: 'LIMIT',
          price: askPrice,
          quantity: qty
        });
      }
    }
  }
}
