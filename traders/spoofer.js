import { BaseTrader } from './base.js';

/**
 * Adversarial Spoofing & Layering Bot
 * Simulates predatory algorithmic trading by placing large phantom limit orders
 * to manipulate Order Book Imbalance (OBI) and microprice signals, while seeking
 * execution on the opposite side, rapidly cancelling the phantom orders before fill.
 */
export class SpoofingTrader extends BaseTrader {
  /**
   * @param {string} id
   * @param {string} name
   * @param {Object} matchingEngine
   * @param {Object} marketManager
   * @param {Object} accountManager
   * @param {Object} clock
   * @param {Object} [options]
   */
  constructor(id, name, matchingEngine, marketManager, accountManager, clock, options = {}) {
    super(id, name, 'SPOOFER', matchingEngine, marketManager, accountManager, clock, {
      minDelayMs: 2000,
      maxDelayMs: 4000,
      initialCredits: 3000000,
      initialShares: 2000,
      ...options
    });

    this.phantomSize = options.phantomSize || 1200; // Large phantom order size
    this.cancelDelayMs = options.cancelDelayMs || 150; // Milliseconds before cancelling phantom
    this.realTradeSize = options.realTradeSize || 20; // Small real order size
    this.activeSpoofs = new Map(); // orderId -> timeoutHandle
  }

  /**
   * Executes a single structured spoofing manipulation cycle.
   * Useful for both autonomous trading and deterministic automated testing.
   * @param {string} symbol
   * @param {'BUY'|'SELL'} spoofSide - side of the phantom bait order
   * @returns {Promise<Object>}
   */
  async executeSpoofCycle(symbol, spoofSide = 'BUY') {
    const book = this.matchingEngine.getOrderBook(symbol);
    if (!book) return { success: false, error: 'Order book not found' };

    const spread = book.getSpread();
    const bestBid = spread.bid || 100;
    const bestAsk = spread.ask || 101;

    // Record baseline OBI before spoofing
    const baselineObi = this.matchingEngine.getOrderBookImbalance(symbol, 5);

    let phantomPrice;
    let realSide;
    let realPrice;

    if (spoofSide === 'BUY') {
      // Bait on BUY side: Place massive bid just under the touch
      phantomPrice = +(bestBid - 0.05).toFixed(2);
      realSide = 'SELL';
      realPrice = +(bestAsk).toFixed(2);
    } else {
      // Bait on SELL side: Place massive ask just above the touch
      phantomPrice = +(bestAsk + 0.05).toFixed(2);
      realSide = 'BUY';
      realPrice = +(bestBid).toFixed(2);
    }

    // 1. Submit large phantom bait order
    const phantomRes = this.submitOrder({
      symbol,
      side: spoofSide,
      type: 'LIMIT',
      price: phantomPrice,
      quantity: this.phantomSize
    });

    if (!phantomRes.success) {
      return { success: false, error: phantomRes.error };
    }

    const phantomOrderId = phantomRes.order.id;

    // Measure manipulated OBI after phantom order is resting
    const manipulatedObi = this.matchingEngine.getOrderBookImbalance(symbol, 5);

    // 2. Submit real order on the opposite side
    const realRes = this.submitOrder({
      symbol,
      side: realSide,
      type: 'LIMIT',
      price: realPrice,
      quantity: this.realTradeSize
    });

    // 3. Schedule rapid cancellation of the phantom order
    const cancelPromise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        const cancelRes = this.matchingEngine.cancelOrder(symbol, phantomOrderId, this.id);
        this.activeSpoofs.delete(phantomOrderId);
        resolve(cancelRes);
      }, this.cancelDelayMs);

      this.activeSpoofs.set(phantomOrderId, timer);
    });

    return {
      success: true,
      symbol,
      spoofSide,
      phantomOrderId,
      realOrderId: realRes.success ? realRes.order?.id : null,
      phantomPrice,
      realPrice,
      phantomSize: this.phantomSize,
      realTradeSize: this.realTradeSize,
      baselineObi: baselineObi?.obi || 0,
      manipulatedObi: manipulatedObi?.obi || 0,
      cancelPromise
    };
  }

  act() {
    const companies = this.marketManager.getAllCompanies();
    if (companies.length === 0) return;

    const comp = companies[Math.floor(Math.random() * companies.length)];
    const spoofSide = Math.random() < 0.5 ? 'BUY' : 'SELL';

    this.executeSpoofCycle(comp.symbol, spoofSide).catch(() => {});
  }

  stop() {
    for (const timer of this.activeSpoofs.values()) {
      clearTimeout(timer);
    }
    this.activeSpoofs.clear();
    super.stop();
  }

  destroy() {
    this.stop();
  }
}
