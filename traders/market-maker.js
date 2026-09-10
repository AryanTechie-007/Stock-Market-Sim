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
    this.volatilitySpreads = new Map(); // symbol -> multiplier
  }

  reactToNews(newsItem) {
    if (!newsItem || !newsItem.symbols) return;
    for (const sym of newsItem.symbols) {
      // Widen spread by 2.2x to protect against volatility
      this.volatilitySpreads.set(sym, 2.2);
      this.cancelAllMyOrders(sym);

      // Revert after 15 seconds
      setTimeout(() => {
        const cur = this.volatilitySpreads.get(sym);
        if (cur && cur > 1.0) {
          this.volatilitySpreads.set(sym, Math.max(1.0, cur - 0.6));
        }
      }, 15000);
    }
  }

  act() {
    const companies = this.marketManager.getAllCompanies();
    // Pick one or two companies each turn to refresh quotes
    const target = companies[Math.floor(Math.random() * companies.length)];
    if (!target) return;

    const symbol = target.symbol;
    const lastPrice = target.price;

    // First cancel old quotes for this symbol to refresh ladder
    this.cancelAllMyOrders(symbol);

    const spreadMult = this.volatilitySpreads.get(symbol) || 1.0;
    const effectiveSpread = this.spreadTarget * spreadMult;
    const halfSpread = (lastPrice * effectiveSpread) / 2;

    // Inventory rebalancing skew
    const user = this.accountManager.getUser(this.id);
    const holding = user?.holdings.get(symbol);
    const shares = holding ? holding.quantity : 5000;
    let skew = 0;
    if (shares > 5500) {
      // Too much inventory: skew down to sell off
      skew = -lastPrice * 0.002;
    } else if (shares < 4500) {
      // Low inventory: skew up to buy in
      skew = lastPrice * 0.002;
    }

    const levels = [1, 2, 3];

    for (const lvl of levels) {
      const levelMultiplier = lvl * 0.7;
      const bidPrice = +(lastPrice + skew - halfSpread * levelMultiplier).toFixed(2);
      const askPrice = +(lastPrice + skew + halfSpread * levelMultiplier).toFixed(2);

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
