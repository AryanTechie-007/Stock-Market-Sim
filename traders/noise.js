import { BaseTrader } from './base.js';

/**
 * Noise Trader
 * Represents retail sentiment, random order flow, and immediate execution demand.
 */
export class NoiseTrader extends BaseTrader {
  constructor(id, name, matchingEngine, marketManager, accountManager, clock, options = {}) {
    super(id, name, 'NOISE_TRADER', matchingEngine, marketManager, accountManager, clock, {
      minDelayMs: 1200,
      maxDelayMs: 3000,
      initialCredits: 300000,
      initialShares: 1000,
      ...options
    });
  }

  act() {
    const companies = this.marketManager.getAllCompanies();
    const comp = companies[Math.floor(Math.random() * companies.length)];
    if (!comp) return;

    // Influence by company sentiment
    const sentimentBias = comp.sentiment; // -1 to +1
    const buyProbability = 0.5 + (sentimentBias * 0.3);
    const isBuy = Math.random() < buyProbability;

    const qty = Math.floor(Math.random() * 12 + 2);
    const orderType = Math.random() < 0.6 ? 'MARKET' : 'LIMIT';

    if (isBuy) {
      const price = orderType === 'LIMIT' 
        ? +(comp.price * (1 + (Math.random() * 0.008 - 0.004))).toFixed(2)
        : comp.price;

      this.submitOrder({
        symbol: comp.symbol,
        side: 'BUY',
        type: orderType,
        price,
        quantity: qty
      });
    } else {
      const holding = this.accountManager.getUser(this.id)?.holdings.get(comp.symbol);
      if (holding && holding.quantity > 5) {
        const sellQty = Math.min(holding.quantity, qty);
        const price = orderType === 'LIMIT' 
          ? +(comp.price * (1 + (Math.random() * 0.008 - 0.004))).toFixed(2)
          : comp.price;

        this.submitOrder({
          symbol: comp.symbol,
          side: 'SELL',
          type: orderType,
          price,
          quantity: sellQty
        });
      }
    }
  }
}
