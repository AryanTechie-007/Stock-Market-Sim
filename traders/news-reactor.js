import { BaseTrader } from './base.js';

/**
 * News Sentiment Momentum Reactor
 * Listens for breaking news releases, aggressively rides the immediate spike
 * in the first 1-3 seconds, and takes profits / mean-reverts during the decay digestion phase.
 */
export class NewsReactorTrader extends BaseTrader {
  constructor(id, name, matchingEngine, marketManager, accountManager, clock, options = {}) {
    super(id, name, 'NEWS_REACTOR', matchingEngine, marketManager, accountManager, clock, {
      minDelayMs: 1500,
      maxDelayMs: 3500,
      ...options
    });
    this.recentNewsReactions = new Map(); // symbol -> { entryPrice, timestamp, side }
  }

  reactToNews(newsItem) {
    if (!newsItem || !newsItem.impact) return;

    for (const [symbol, factor] of Object.entries(newsItem.impact)) {
      const comp = this.marketManager.getCompany(symbol);
      if (!comp) continue;

      const side = factor > 0 ? 'BUY' : 'SELL';
      const intensity = Math.min(0.15, Math.abs(factor));
      const qty = Math.max(5, Math.floor(intensity * 150));

      // Fast execution to catch initial spike phase
      if (side === 'BUY') {
        const book = this.matchingEngine.getOrderBook(symbol);
        const bestAsk = book?.getBestAsk() || comp.price * 1.02;
        this.submitOrder({
          symbol,
          side: 'BUY',
          type: 'LIMIT',
          price: +(bestAsk * 1.01).toFixed(2), // Aggressive marketable limit
          quantity: qty
        });
      } else {
        const book = this.matchingEngine.getOrderBook(symbol);
        const bestBid = book?.getBestBid() || comp.price * 0.98;
        this.submitOrder({
          symbol,
          side: 'SELL',
          type: 'LIMIT',
          price: +(bestBid * 0.99).toFixed(2),
          quantity: qty
        });
      }

      this.recentNewsReactions.set(symbol, {
        side,
        entryPrice: comp.price,
        timestamp: Date.now()
      });
    }
  }

  act() {
    const now = Date.now();

    // Check recent reactions: after 15-25 seconds (digestion phase), take profit or unwind
    for (const [symbol, info] of this.recentNewsReactions.entries()) {
      const elapsedSec = (now - info.timestamp) / 1000;

      if (elapsedSec > 18) {
        const comp = this.marketManager.getCompany(symbol);
        if (comp) {
          // Unwind position: if bought earlier, sell into digestion; if sold, buy back
          const exitSide = info.side === 'BUY' ? 'SELL' : 'BUY';
          const qty = Math.floor(Math.random() * 8 + 4);

          this.submitOrder({
            symbol,
            side: exitSide,
            type: 'LIMIT',
            price: comp.price,
            quantity: qty
          });
        }
        this.recentNewsReactions.delete(symbol);
      }
    }
  }
}
