import { BaseTrader } from './base.js';

/**
 * High-Frequency Scalper (HFT Microstructure Bot)
 * Operates at tight cadences (500-1500ms), evaluates top-of-book microstructure,
 * pennies inside the spread, and rapidly recycles limit orders.
 */
export class ScalperTrader extends BaseTrader {
  constructor(id, name, matchingEngine, marketManager, accountManager, clock, options = {}) {
    super(id, name, 'SCALPER', matchingEngine, marketManager, accountManager, clock, {
      minDelayMs: 500,
      maxDelayMs: 1500,
      ...options
    });
  }

  act() {
    const companies = this.marketManager.getAllCompanies();
    if (companies.length === 0) return;

    // Pick 1-2 symbols to evaluate
    const comp = companies[Math.floor(Math.random() * companies.length)];
    const book = this.matchingEngine.getOrderBook(comp.symbol);
    if (!book) return;

    // Periodically cancel existing orders to prevent stale executions
    if (Math.random() < 0.40) {
      this.cancelAllMyOrders(comp.symbol);
    }

    const spread = book.getSpread();
    const qty = Math.floor(Math.random() * 8 + 3); // Small scalp sizes

    if (spread.bid !== null && spread.ask !== null && spread.ask > spread.bid) {
      const spreadWidth = spread.ask - spread.bid;

      if (spreadWidth >= 0.10) {
        // Penny-jump inside the spread
        const bidPrice = +(spread.bid + 0.05).toFixed(2);
        const askPrice = +(spread.ask - 0.05).toFixed(2);

        if (bidPrice < askPrice) {
          this.submitOrder({
            symbol: comp.symbol,
            side: 'BUY',
            type: 'LIMIT',
            price: bidPrice,
            quantity: qty
          });

          this.submitOrder({
            symbol: comp.symbol,
            side: 'SELL',
            type: 'LIMIT',
            price: askPrice,
            quantity: qty
          });
        }
      } else {
        // Tight spread: provide liquidity at the touch
        this.submitOrder({
          symbol: comp.symbol,
          side: 'BUY',
          type: 'LIMIT',
          price: spread.bid,
          quantity: qty
        });
      }
    } else {
      // Wide or one-sided book: quote around current price
      const centerPrice = comp.price;
      this.submitOrder({
        symbol: comp.symbol,
        side: 'BUY',
        type: 'LIMIT',
        price: +(centerPrice * 0.995).toFixed(2),
        quantity: qty
      });
      this.submitOrder({
        symbol: comp.symbol,
        side: 'SELL',
        type: 'LIMIT',
        price: +(centerPrice * 1.005).toFixed(2),
        quantity: qty
      });
    }
  }
}
