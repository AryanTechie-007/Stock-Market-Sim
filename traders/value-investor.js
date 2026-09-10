import { BaseTrader } from './base.js';

/**
 * Value Investor Trader
 * Anchored to company fundamentals and estimated intrinsic value.
 * Buys when market price trades at a discount; sells when price becomes overextended.
 */
export class ValueInvestor extends BaseTrader {
  constructor(id, name, matchingEngine, marketManager, accountManager, clock, options = {}) {
    super(id, name, 'VALUE_INVESTOR', matchingEngine, marketManager, accountManager, clock, {
      minDelayMs: 2500,
      maxDelayMs: 5000,
      initialCredits: 1000000,
      initialShares: 2500,
      ...options
    });
    this.marginOfSafety = options.marginOfSafety || 0.02; // 2% discount threshold
  }

  reactToNews(newsItem) {
    if (!newsItem || !newsItem.symbols || !this.clock.isTradingOpen()) return;

    for (const sym of newsItem.symbols) {
      const comp = this.marketManager.getCompany(sym);
      if (!comp) continue;

      const discount = (comp.intrinsicValue - comp.price) / comp.intrinsicValue;
      if (discount > this.marginOfSafety) {
        const qty = Math.floor(Math.random() * 30 + 15);
        this.submitOrder({
          symbol: sym,
          side: 'BUY',
          type: 'LIMIT',
          price: comp.price,
          quantity: qty
        });
      } else if (discount < -this.marginOfSafety) {
        const holding = this.accountManager.getUser(this.id)?.holdings.get(sym);
        if (holding && holding.quantity > 5) {
          const qty = Math.min(holding.quantity, Math.floor(Math.random() * 25 + 10));
          this.submitOrder({
            symbol: sym,
            side: 'SELL',
            type: 'LIMIT',
            price: comp.price,
            quantity: qty
          });
        }
      }
    }
  }

  act() {
    const companies = this.marketManager.getAllCompanies();
    for (const comp of companies) {
      const discount = (comp.intrinsicValue - comp.price) / comp.intrinsicValue;

      if (discount > this.marginOfSafety) {
        // Undervalued: Accumulate shares
        const qty = Math.floor(Math.random() * 20 + 10);
        // Place limit buy slightly below current price or at current price
        const buyPrice = +(comp.price * (1 - 0.002)).toFixed(2);
        this.submitOrder({
          symbol: comp.symbol,
          side: 'BUY',
          type: 'LIMIT',
          price: buyPrice,
          quantity: qty
        });
      } else if (discount < -this.marginOfSafety) {
        // Overvalued: Sell shares into the strength
        const holding = this.accountManager.getUser(this.id)?.holdings.get(comp.symbol);
        if (holding && holding.quantity > 10) {
          const qty = Math.min(holding.quantity, Math.floor(Math.random() * 20 + 8));
          const sellPrice = +(comp.price * (1 + 0.002)).toFixed(2);
          this.submitOrder({
            symbol: comp.symbol,
            side: 'SELL',
            type: 'LIMIT',
            price: sellPrice,
            quantity: qty
          });
        }
      }
    }
  }
}
