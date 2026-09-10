import { EventEmitter } from 'events';
import { OrderBook } from './orderbook.js';

/**
 * Matching Engine Coordinator
 * Routes orders to correct symbol OrderBook, enforces funds/shares checking,
 * coordinates trade settlements with AccountManager.
 */
export class MatchingEngine extends EventEmitter {
  constructor(symbols, accountManager, clock) {
    super();
    this.symbols = symbols;
    this.accountManager = accountManager;
    this.clock = clock;
    this.books = new Map(); // symbol -> OrderBook

    for (const sym of symbols) {
      this.books.set(sym, new OrderBook(sym));
    }
  }

  getOrderBook(symbol) {
    return this.books.get(symbol);
  }

  getDepth(symbol, levels = 10) {
    const book = this.books.get(symbol);
    return book ? book.getDepth(levels) : null;
  }

  getAllDepths(levels = 10) {
    const depths = {};
    for (const [sym, book] of this.books.entries()) {
      depths[sym] = book.getDepth(levels);
    }
    return depths;
  }

  getUserOpenOrders(userId) {
    const openOrders = [];
    for (const book of this.books.values()) {
      openOrders.push(...book.getUserOpenOrders(userId));
    }
    return openOrders;
  }

  /**
   * Submit an order into the market
   * @param {Object} rawOrder
   * @returns {{ success: boolean, order?: Object, trades?: Array, error?: string }}
   */
  submitOrder(rawOrder) {
    const { userId, userName, symbol, side, type, price, quantity } = rawOrder;

    if (!this.clock.isTradingOpen()) {
      // In Pre-market, we could allow limit orders, but let's check market status
      if (this.clock.phase !== 'PRE_MARKET' || type !== 'LIMIT') {
        return {
          success: false,
          error: `Market is currently ${this.clock.phase.replace('_', ' ')}. Trading opens during regular hours.`
        };
      }
    }

    const book = this.books.get(symbol);
    if (!book) {
      return { success: false, error: `Invalid symbol: ${symbol}` };
    }

    const cleanQty = Math.floor(Number(quantity));
    if (isNaN(cleanQty) || cleanQty <= 0) {
      return { success: false, error: 'Quantity must be a positive whole integer' };
    }

    const cleanPrice = +(Number(price).toFixed(2));
    if (type === 'LIMIT' && (isNaN(cleanPrice) || cleanPrice <= 0)) {
      return { success: false, error: 'Valid limit price is required' };
    }

    // Balance and holding validations
    if (side === 'BUY') {
      let estimatedPrice = cleanPrice;
      if (type === 'MARKET') {
        const bestAsk = book.getBestAsk();
        if (!bestAsk) {
          return { success: false, error: 'Cannot execute Market Buy: No sellers in the order book' };
        }
        estimatedPrice = bestAsk * 1.05; // 5% slippage buffer
      }

      if (!this.accountManager.canAffordBuy(userId, estimatedPrice, cleanQty)) {
        return { success: false, error: 'Insufficient credits to place this buy order' };
      }
    } else if (side === 'SELL') {
      if (!this.accountManager.canAffordSell(userId, symbol, cleanQty)) {
        return { success: false, error: `Insufficient available shares of ${symbol} to sell` };
      }
    }

    const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const order = {
      id: orderId,
      userId,
      userName,
      symbol,
      side,
      type,
      price: cleanPrice,
      quantity: cleanQty,
      originalQuantity: cleanQty,
      timestamp: Date.now()
    };

    // Pre-lock funds/shares if limit order
    if (type === 'LIMIT') {
      if (side === 'BUY') {
        this.accountManager.lockCredits(userId, cleanPrice * cleanQty);
      } else {
        this.accountManager.lockShares(userId, symbol, cleanQty);
      }
    }

    // Process matching
    const result = book.processOrder(order);

    // Settle trades
    for (const trade of result.trades) {
      const buyerWasMaker = trade.takerSide === 'SELL';
      const sellerWasMaker = trade.takerSide === 'BUY';
      this.accountManager.settleTrade(trade, buyerWasMaker, sellerWasMaker);

      this.emit('trade', trade);
    }

    // If limit order was filled or cancelled immediately without resting
    if (type === 'LIMIT' && !result.remainingOrder) {
      // Any remaining unfilled portion that got cancelled should be unlocked
      if (order.quantity > 0) {
        if (side === 'BUY') {
          this.accountManager.unlockCredits(userId, cleanPrice * order.quantity);
        } else {
          this.accountManager.unlockShares(userId, symbol, order.quantity);
        }
      }
    }

    this.emit('orderbookChange', {
      symbol,
      depth: book.getDepth(10)
    });

    return {
      success: true,
      order,
      trades: result.trades,
      remainingOrder: result.remainingOrder
    };
  }

  cancelOrder(symbol, orderId, userId) {
    const book = this.books.get(symbol);
    if (!book) return { success: false, error: 'Invalid symbol' };

    const order = book.orders.get(orderId);
    if (!order) return { success: false, error: 'Order not found or already filled' };

    if (order.userId !== userId) {
      return { success: false, error: 'Unauthorized to cancel this order' };
    }

    const cancelled = book.cancelOrder(orderId);
    if (cancelled) {
      // Unlock remaining reserved capital/shares
      if (cancelled.side === 'BUY') {
        this.accountManager.unlockCredits(userId, cancelled.price * cancelled.quantity);
      } else {
        this.accountManager.unlockShares(userId, symbol, cancelled.quantity);
      }

      this.emit('orderbookChange', {
        symbol,
        depth: book.getDepth(10)
      });

      return { success: true, order: cancelled };
    }

    return { success: false, error: 'Failed to cancel order' };
  }
}
