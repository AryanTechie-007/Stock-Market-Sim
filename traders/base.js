/**
 * Base NPC Trader
 */
export class BaseTrader {
  constructor(id, name, type, matchingEngine, marketManager, accountManager, clock, options = {}) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.matchingEngine = matchingEngine;
    this.marketManager = marketManager;
    this.accountManager = accountManager;
    this.clock = clock;
    this.options = options;
    this.activeOrders = new Map(); // orderId -> { symbol, orderId }
    this.intervalId = null;

    // Compute initial inventory and total starting capital
    const startingCash = options.initialCredits || 500000;
    const initialShares = options.initialShares || 1500;
    let initialInventoryValue = 0;
    const initialHoldings = new Map();

    for (const comp of this.marketManager.getAllCompanies()) {
      initialInventoryValue += initialShares * comp.basePrice;
      initialHoldings.set(comp.symbol, {
        quantity: initialShares,
        avgPrice: comp.basePrice,
        lockedQty: 0
      });
    }

    const totalBotStartCapital = startingCash + initialInventoryValue;
    const account = this.accountManager.getOrCreateUser(this.id, this.name, true, totalBotStartCapital);
    account.credits = startingCash;
    account.holdings = initialHoldings;
  }

  start() {
    this._scheduleNextAction();
  }

  stop() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }

  destroy() {
    this.stop();
  }

  _scheduleNextAction() {
    const minDelay = this.options.minDelayMs || 1500;
    const maxDelay = this.options.maxDelayMs || 4000;
    const delay = Math.floor(Math.random() * (maxDelay - minDelay) + minDelay);

    this.intervalId = setTimeout(() => {
      if (this.clock.isTradingOpen() || this.clock.phase === 'PRE_MARKET') {
        try {
          this.act();
        } catch (err) {
          // Keep resilient
        }
      }
      this._scheduleNextAction();
    }, delay);
  }

  act() {
    // Abstract method to be overridden
  }

  /**
   * Handle breaking news event broadcast
   * @param {Object} newsItem
   */
  reactToNews(newsItem) {
    // Override in specialized trader sub-classes
  }

  submitOrder({ symbol, side, type, price, quantity }) {
    const res = this.matchingEngine.submitOrder({
      userId: this.id,
      userName: this.name,
      symbol,
      side,
      type,
      price,
      quantity
    });

    if (res.success && res.remainingOrder) {
      this.activeOrders.set(res.remainingOrder.id, {
        symbol,
        orderId: res.remainingOrder.id
      });
    }

    return res;
  }

  cancelAllMyOrders(symbol) {
    for (const [orderId, info] of this.activeOrders.entries()) {
      if (!symbol || info.symbol === symbol) {
        this.matchingEngine.cancelOrder(info.symbol, orderId, this.id);
        this.activeOrders.delete(orderId);
      }
    }
  }
}
