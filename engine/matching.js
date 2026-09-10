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
  /**
   * Submit an order into the market
   * @param {Object} rawOrder
   * @returns {{ success: boolean, order?: Object, trades?: Array, error?: string, isStop?: boolean }}
   */
  submitOrder(rawOrder) {
    const { userId, userName, symbol, side, type, price, quantity, stopPrice } = rawOrder;

    if (!this.clock.isTradingOpen()) {
      // In Pre-market, allow limit orders and resting stop orders
      if (this.clock.phase !== 'PRE_MARKET' || (type !== 'LIMIT' && type !== 'STOP_LOSS' && type !== 'STOP_LIMIT')) {
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

    const cleanPrice = price !== undefined && price !== null ? +(Number(price).toFixed(2)) : 0;
    const cleanStopPrice = stopPrice !== undefined && stopPrice !== null ? +(Number(stopPrice).toFixed(2)) : 0;

    if ((type === 'LIMIT' || type === 'STOP_LIMIT') && (isNaN(cleanPrice) || cleanPrice <= 0)) {
      return { success: false, error: 'Valid limit price is required' };
    }

    if ((type === 'STOP_LOSS' || type === 'STOP_LIMIT') && (isNaN(cleanStopPrice) || cleanStopPrice <= 0)) {
      return { success: false, error: 'Valid stop trigger price is required' };
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
      } else if (type === 'STOP_LOSS') {
        estimatedPrice = cleanStopPrice * 1.05;
      } else if (type === 'STOP_LIMIT') {
        estimatedPrice = cleanPrice;
      }

      if (!this.accountManager.canAffordBuy(userId, estimatedPrice, cleanQty)) {
        return { success: false, error: 'Insufficient credits to place this buy order' };
      }
    } else if (side === 'SELL') {
      if (type === 'MARKET') {
        const bestBid = book.getBestBid();
        if (!bestBid) {
          return { success: false, error: 'Cannot execute Market Sell: No buyers in the order book' };
        }
      }

      const sellCheck = this.accountManager.getSellAvailability(userId, symbol);
      if (!sellCheck.hasHolding) {
        return { success: false, error: `You do not own any shares of ${symbol}` };
      }
      if (sellCheck.availableShares < cleanQty) {
        return {
          success: false,
          error: `Insufficient shares: you have ${sellCheck.availableShares} available of ${symbol} (${sellCheck.lockedShares} locked in open orders), but tried to sell ${cleanQty}`
        };
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
      stopPrice: cleanStopPrice,
      quantity: cleanQty,
      originalQuantity: cleanQty,
      timestamp: Date.now()
    };

    // Pre-lock funds/shares if limit or stop order
    if (type === 'LIMIT') {
      if (side === 'BUY') {
        this.accountManager.lockCredits(userId, cleanPrice * cleanQty);
      } else {
        this.accountManager.lockShares(userId, symbol, cleanQty);
      }
    } else if (type === 'STOP_LIMIT') {
      if (side === 'BUY') {
        this.accountManager.lockCredits(userId, cleanPrice * cleanQty);
      } else {
        this.accountManager.lockShares(userId, symbol, cleanQty);
      }
      book.addStopOrder(order);
      this.emit('stopOrderPlaced', order);
      this.emit('orderbookChange', { symbol, depth: book.getDepth(10) });
      return { success: true, order, isStop: true };
    } else if (type === 'STOP_LOSS') {
      if (side === 'BUY') {
        this.accountManager.lockCredits(userId, cleanStopPrice * 1.05 * cleanQty);
      } else {
        this.accountManager.lockShares(userId, symbol, cleanQty);
      }
      book.addStopOrder(order);
      this.emit('stopOrderPlaced', order);
      this.emit('orderbookChange', { symbol, depth: book.getDepth(10) });
      return { success: true, order, isStop: true };
    }

    // Process matching for standard LIMIT or MARKET order
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

    // Evaluate stop triggers if trades occurred
    if (result.trades.length > 0) {
      const lastPrice = result.trades[result.trades.length - 1].price;
      this._checkStopTriggers(symbol, lastPrice);
    }

    return {
      success: true,
      order,
      trades: result.trades,
      remainingOrder: result.remainingOrder
    };
  }

  /**
   * Check and execute resting stop orders triggered by a price movement
   * @param {string} symbol
   * @param {number} lastPrice
   */
  _checkStopTriggers(symbol, lastPrice) {
    const book = this.books.get(symbol);
    if (!book) return;

    let triggeredOrders = book.checkStopOrders(lastPrice);
    while (triggeredOrders.length > 0) {
      for (const stopOrder of triggeredOrders) {
        this.emit('stopOrderTriggered', stopOrder);

        if (stopOrder.type === 'STOP_LOSS') {
          // Convert to MARKET order
          stopOrder.type = 'MARKET';
          if (stopOrder.side === 'BUY') {
            const lockedAmount = +(stopOrder.stopPrice * 1.05 * stopOrder.quantity).toFixed(2);
            this.accountManager.unlockCredits(stopOrder.userId, lockedAmount);
          } else {
            this.accountManager.unlockShares(stopOrder.userId, stopOrder.symbol, stopOrder.quantity);
          }

          const res = book.processOrder(stopOrder);
          for (const trade of res.trades) {
            const buyerWasMaker = trade.takerSide === 'SELL';
            const sellerWasMaker = trade.takerSide === 'BUY';
            this.accountManager.settleTrade(trade, buyerWasMaker, sellerWasMaker);
            this.emit('trade', trade);
          }
        } else if (stopOrder.type === 'STOP_LIMIT') {
          // Convert to LIMIT order (funds or shares are already locked)
          stopOrder.type = 'LIMIT';
          const res = book.processOrder(stopOrder);
          for (const trade of res.trades) {
            const buyerWasMaker = trade.takerSide === 'SELL';
            const sellerWasMaker = trade.takerSide === 'BUY';
            this.accountManager.settleTrade(trade, buyerWasMaker, sellerWasMaker);
            this.emit('trade', trade);
          }
          if (!res.remainingOrder && stopOrder.quantity > 0) {
            if (stopOrder.side === 'BUY') {
              this.accountManager.unlockCredits(stopOrder.userId, stopOrder.price * stopOrder.quantity);
            } else {
              this.accountManager.unlockShares(stopOrder.userId, symbol, stopOrder.quantity);
            }
          }
        }
      }

      this.emit('orderbookChange', {
        symbol,
        depth: book.getDepth(10)
      });

      // Check if cascaded trades trigger further stop orders
      const bestSpread = book.getSpread();
      const currentPrice = bestSpread.mid || lastPrice;
      triggeredOrders = book.checkStopOrders(currentPrice);
    }
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
        if (cancelled.type === 'STOP_LOSS') {
          const lockedAmount = +(cancelled.stopPrice * 1.05 * cancelled.quantity).toFixed(2);
          this.accountManager.unlockCredits(userId, lockedAmount);
        } else {
          this.accountManager.unlockCredits(userId, cancelled.price * cancelled.quantity);
        }
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
