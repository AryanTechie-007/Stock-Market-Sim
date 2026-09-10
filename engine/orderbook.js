/**
 * Price-Time Priority (FIFO) Limit Order Book
 */
export class OrderBook {
  constructor(symbol) {
    this.symbol = symbol;
    this.bids = []; // Buy orders: sorted price DESC, timestamp ASC
    this.asks = []; // Sell orders: sorted price ASC, timestamp ASC
    this.orders = new Map(); // orderId -> order
    this.stopOrders = new Map(); // orderId -> resting stop order
  }

  /**
   * Add and process an incoming order
   * @param {Object} order
   * @param {string} order.id
   * @param {string} order.userId
   * @param {string} order.userName
   * @param {string} order.symbol
   * @param {'BUY'|'SELL'} order.side
   * @param {'LIMIT'|'MARKET'} order.type
   * @param {number} order.price
   * @param {number} order.quantity
   * @param {number} [order.timestamp]
   * @returns {{ trades: Array, remainingOrder: Object|null }}
   */
  processOrder(order) {
    order.quantity = Math.max(0, Math.floor(order.quantity));
    order.originalQuantity = order.quantity;
    order.filledQuantity = 0;
    order.timestamp = order.timestamp || Date.now();
    order.status = 'PENDING';

    const trades = [];

    if (order.quantity <= 0) {
      return { trades, remainingOrder: null };
    }

    if (order.side === 'BUY') {
      // Match against asks (lowest price first)
      while (this.asks.length > 0 && order.quantity > 0) {
        const bestAsk = this.asks[0];

        // For limit buy, price must be >= best ask
        if (order.type === 'LIMIT' && order.price < bestAsk.price) {
          break;
        }

        // Prevent self-trading
        if (bestAsk.userId === order.userId) {
          break;
        }

        const matchPrice = bestAsk.price; // Trade executes at resting limit price
        const matchQty = Math.min(order.quantity, bestAsk.quantity);

        order.quantity -= matchQty;
        order.filledQuantity += matchQty;
        bestAsk.quantity -= matchQty;
        bestAsk.filledQuantity += matchQty;

        const trade = {
          id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          symbol: this.symbol,
          price: matchPrice,
          quantity: matchQty,
          buyerId: order.userId,
          buyerName: order.userName,
          sellerId: bestAsk.userId,
          sellerName: bestAsk.userName,
          takerSide: 'BUY',
          makerOrderId: bestAsk.id,
          takerOrderId: order.id,
          timestamp: Date.now()
        };
        trades.push(trade);

        if (bestAsk.quantity === 0) {
          bestAsk.status = 'FILLED';
          this.orders.delete(bestAsk.id);
          this.asks.shift();
        } else {
          bestAsk.status = 'PARTIALLY_FILLED';
        }
      }

      // If limit order has remaining quantity, place on order book
      if (order.quantity > 0 && order.type === 'LIMIT') {
        order.status = order.filledQuantity > 0 ? 'PARTIALLY_FILLED' : 'OPEN';
        this._insertBid(order);
        this.orders.set(order.id, order);
        return { trades, remainingOrder: order };
      } else {
        order.status = order.filledQuantity === order.originalQuantity ? 'FILLED' : 'CANCELLED';
        return { trades, remainingOrder: null };
      }

    } else { // SELL
      // Match against bids (highest price first)
      while (this.bids.length > 0 && order.quantity > 0) {
        const bestBid = this.bids[0];

        // For limit sell, price must be <= best bid
        if (order.type === 'LIMIT' && order.price > bestBid.price) {
          break;
        }

        // Prevent self-trading
        if (bestBid.userId === order.userId) {
          break;
        }

        const matchPrice = bestBid.price; // Trade executes at resting limit price
        const matchQty = Math.min(order.quantity, bestBid.quantity);

        order.quantity -= matchQty;
        order.filledQuantity += matchQty;
        bestBid.quantity -= matchQty;
        bestBid.filledQuantity += matchQty;

        const trade = {
          id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          symbol: this.symbol,
          price: matchPrice,
          quantity: matchQty,
          buyerId: bestBid.userId,
          buyerName: bestBid.userName,
          sellerId: order.userId,
          sellerName: order.userName,
          takerSide: 'SELL',
          makerOrderId: bestBid.id,
          takerOrderId: order.id,
          timestamp: Date.now()
        };
        trades.push(trade);

        if (bestBid.quantity === 0) {
          bestBid.status = 'FILLED';
          this.orders.delete(bestBid.id);
          this.bids.shift();
        } else {
          bestBid.status = 'PARTIALLY_FILLED';
        }
      }

      // If limit order has remaining quantity, place on book
      if (order.quantity > 0 && order.type === 'LIMIT') {
        order.status = order.filledQuantity > 0 ? 'PARTIALLY_FILLED' : 'OPEN';
        this._insertAsk(order);
        this.orders.set(order.id, order);
        return { trades, remainingOrder: order };
      } else {
        order.status = order.filledQuantity === order.originalQuantity ? 'FILLED' : 'CANCELLED';
        return { trades, remainingOrder: null };
      }
    }
  }

  _insertBid(order) {
    // Bids sorted DESC by price, ASC by timestamp
    let idx = 0;
    while (idx < this.bids.length) {
      const current = this.bids[idx];
      if (order.price > current.price) {
        break;
      }
      if (order.price === current.price && order.timestamp < current.timestamp) {
        break;
      }
      idx++;
    }
    this.bids.splice(idx, 0, order);
  }

  _insertAsk(order) {
    // Asks sorted ASC by price, ASC by timestamp
    let idx = 0;
    while (idx < this.asks.length) {
      const current = this.asks[idx];
      if (order.price < current.price) {
        break;
      }
      if (order.price === current.price && order.timestamp < current.timestamp) {
        break;
      }
      idx++;
    }
    this.asks.splice(idx, 0, order);
  }

  /**
   * Add a resting stop-loss or stop-limit order outside the active matching queue
   * @param {Object} order
   */
  addStopOrder(order) {
    order.quantity = Math.max(0, Math.floor(order.quantity));
    order.originalQuantity = order.quantity;
    order.filledQuantity = 0;
    order.timestamp = order.timestamp || Date.now();
    order.status = 'STOP_RESTING';

    this.stopOrders.set(order.id, order);
    this.orders.set(order.id, order);
    return order;
  }

  /**
   * Evaluate resting stop orders against the latest trade execution price
   * @param {number} lastTradedPrice
   * @returns {Array<Object>} list of triggered stop orders
   */
  checkStopOrders(lastTradedPrice) {
    const triggered = [];
    if (!lastTradedPrice || this.stopOrders.size === 0) return triggered;

    for (const [orderId, order] of this.stopOrders.entries()) {
      let shouldTrigger = false;

      if (order.side === 'BUY') {
        // Buy stop triggers when market price rises to or above stopPrice (e.g. breakout / cover)
        if (lastTradedPrice >= order.stopPrice) {
          shouldTrigger = true;
        }
      } else if (order.side === 'SELL') {
        // Sell stop triggers when market price falls to or below stopPrice (e.g. stop-loss)
        if (lastTradedPrice <= order.stopPrice) {
          shouldTrigger = true;
        }
      }

      if (shouldTrigger) {
        this.stopOrders.delete(orderId);
        order.triggeredAtPrice = lastTradedPrice;
        order.triggeredAt = Date.now();
        triggered.push(order);
      }
    }

    return triggered;
  }

  cancelOrder(orderId) {
    const order = this.orders.get(orderId);
    if (!order) return null;

    if (this.stopOrders.has(orderId)) {
      this.stopOrders.delete(orderId);
    } else if (order.side === 'BUY') {
      const idx = this.bids.findIndex(o => o.id === orderId);
      if (idx !== -1) this.bids.splice(idx, 1);
    } else {
      const idx = this.asks.findIndex(o => o.id === orderId);
      if (idx !== -1) this.asks.splice(idx, 1);
    }

    this.orders.delete(orderId);
    order.status = 'CANCELLED';
    return order;
  }

  getBestBid() {
    return this.bids.length > 0 ? this.bids[0].price : null;
  }

  getBestAsk() {
    return this.asks.length > 0 ? this.asks[0].price : null;
  }

  getSpread() {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    if (bestBid !== null && bestAsk !== null) {
      return {
        bid: bestBid,
        ask: bestAsk,
        spread: +(bestAsk - bestBid).toFixed(2),
        mid: +((bestAsk + bestBid) / 2).toFixed(2)
      };
    }
    return {
      bid: bestBid,
      ask: bestAsk,
      spread: null,
      mid: bestBid || bestAsk || null
    };
  }

  getDepth(maxLevels = 10) {
    // Group bids by price
    const bidMap = new Map();
    for (const b of this.bids) {
      const p = b.price;
      bidMap.set(p, (bidMap.get(p) || 0) + b.quantity);
    }
    const bidsAgg = [];
    let cumBidQty = 0;
    for (const [price, qty] of bidMap.entries()) {
      cumBidQty += qty;
      bidsAgg.push({ price, quantity: qty, total: cumBidQty });
      if (bidsAgg.length >= maxLevels) break;
    }

    // Group asks by price
    const askMap = new Map();
    for (const a of this.asks) {
      const p = a.price;
      askMap.set(p, (askMap.get(p) || 0) + a.quantity);
    }
    const asksAgg = [];
    let cumAskQty = 0;
    for (const [price, qty] of askMap.entries()) {
      cumAskQty += qty;
      asksAgg.push({ price, quantity: qty, total: cumAskQty });
      if (asksAgg.length >= maxLevels) break;
    }

    return {
      symbol: this.symbol,
      bids: bidsAgg,
      asks: asksAgg,
      spread: this.getSpread()
    };
  }

  getUserOpenOrders(userId) {
    const list = [];
    for (const order of this.orders.values()) {
      if (order.userId === userId) {
        list.push({ ...order });
      }
    }
    return list;
  }
}
