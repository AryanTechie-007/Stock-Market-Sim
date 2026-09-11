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
    this.accountManager = accountManager;
    this.clock = clock;
    this.books = new Map(); // symbol -> OrderBook

    const defaultSymbols = ['AUTO', 'SOLR', 'BYTE', 'NBNK', 'MEDL', 'AERO', 'SEMI', 'RETL', 'CYBR', 'STRM'];
    const symbolList = (symbols && symbols.length > 0) ? symbols : defaultSymbols;
    this.symbols = Array.from(new Set([...symbolList, ...defaultSymbols]));

    for (const sym of this.symbols) {
      this.books.set(sym, new OrderBook(sym));
    }

    if (this.clock) {
      this.clock.on('bellRing', ({ bell }) => {
        if (bell === 'OPENING_BELL') {
          this.executeAllOpeningAuctions();
        }
      });
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
    const { userId, userName, symbol, side, type, price, quantity, stopPrice, trailingDelta, leverage, isShort, ocoGroupId } = rawOrder;

    if (!this.clock.isTradingOpen()) {
      // In Pre-market, allow limit orders and resting stop orders
      if (this.clock.phase !== 'PRE_MARKET' || (type !== 'LIMIT' && type !== 'STOP_LOSS' && type !== 'STOP_LIMIT' && type !== 'TRAILING_STOP')) {
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

    const cleanLeverage = Math.min(5, Math.max(1, Number(leverage) || 1));
    const cleanPrice = price !== undefined && price !== null ? +(Number(price).toFixed(2)) : 0;
    const cleanStopPrice = stopPrice !== undefined && stopPrice !== null ? +(Number(stopPrice).toFixed(2)) : 0;
    const cleanTrailingDelta = trailingDelta !== undefined && trailingDelta !== null ? +(Number(trailingDelta).toFixed(2)) : 5.0;

    if ((type === 'LIMIT' || type === 'STOP_LIMIT') && (isNaN(cleanPrice) || cleanPrice <= 0)) {
      return { success: false, error: 'Valid limit price is required' };
    }

    if ((type === 'STOP_LOSS' || type === 'STOP_LIMIT') && (isNaN(cleanStopPrice) || cleanStopPrice <= 0)) {
      return { success: false, error: 'Valid stop trigger price is required' };
    }

    if (type === 'TRAILING_STOP' && (isNaN(cleanTrailingDelta) || cleanTrailingDelta <= 0)) {
      return { success: false, error: 'Valid trailing delta distance is required' };
    }

    const currentMidPrice = book.getSpread().mid || 100;
    let orderIsShort = Boolean(isShort);

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
      } else if (type === 'TRAILING_STOP') {
        estimatedPrice = (currentMidPrice + cleanTrailingDelta) * 1.05;
      }

      if (!this.accountManager.canAffordBuy(userId, estimatedPrice, cleanQty, cleanLeverage)) {
        return { success: false, error: 'Insufficient credits/margin to place this buy order' };
      }
    } else if (side === 'SELL') {
      if (type === 'MARKET') {
        const bestBid = book.getBestBid();
        if (!bestBid) {
          return { success: false, error: 'Cannot execute Market Sell: No buyers in the order book' };
        }
      }

      const sellCheck = this.accountManager.getSellAvailability(userId, symbol);
      if (sellCheck.availableShares >= cleanQty && !orderIsShort) {
        // Normal Long share sale
        orderIsShort = false;
      } else {
        // Short sale (borrowing shares against margin collateral)
        orderIsShort = true;
        const shortSharesNeeded = cleanQty - sellCheck.availableShares;
        const shortEstPrice = cleanPrice || currentMidPrice;
        if (!this.accountManager.canAffordShort(userId, shortEstPrice, shortSharesNeeded, cleanLeverage)) {
          return {
            success: false,
            error: `Insufficient margin to short ${shortSharesNeeded} shares of ${symbol}. Requires collateral at ${cleanLeverage}x leverage.`
          };
        }
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
      trailingDelta: cleanTrailingDelta,
      currentMarketPrice: currentMidPrice,
      leverage: cleanLeverage,
      isShort: orderIsShort,
      ocoGroupId: ocoGroupId || null,
      quantity: cleanQty,
      originalQuantity: cleanQty,
      timestamp: Date.now()
    };

    // Pre-lock funds/shares if limit or stop order
    if (type === 'LIMIT') {
      if (side === 'BUY') {
        const marginLock = +((cleanPrice * cleanQty) / cleanLeverage).toFixed(2);
        this.accountManager.lockCredits(userId, marginLock);
      } else if (!orderIsShort) {
        this.accountManager.lockShares(userId, symbol, cleanQty);
      } else {
        const marginLock = +((cleanPrice * cleanQty) / cleanLeverage).toFixed(2);
        this.accountManager.lockCredits(userId, marginLock);
      }

      // In Pre-market, queue limit orders for the Opening Call Auction without continuous matching
      if (this.clock && this.clock.phase === 'PRE_MARKET') {
        book.addPreMarketLimitOrder(order);
        this.emit('orderbookChange', { symbol, depth: book.getDepth(10) });
        const indicative = book.calculateIndicativeClearingPrice();
        this.emit('auction:indicative', { symbol, ...indicative });
        return { success: true, order, isPreMarket: true };
      }
    } else if (type === 'STOP_LIMIT') {
      if (side === 'BUY') {
        const marginLock = +((cleanPrice * cleanQty) / cleanLeverage).toFixed(2);
        this.accountManager.lockCredits(userId, marginLock);
      } else if (!orderIsShort) {
        this.accountManager.lockShares(userId, symbol, cleanQty);
      } else {
        const marginLock = +((cleanPrice * cleanQty) / cleanLeverage).toFixed(2);
        this.accountManager.lockCredits(userId, marginLock);
      }
      book.addStopOrder(order);
      this.emit('stopOrderPlaced', order);
      this.emit('orderbookChange', { symbol, depth: book.getDepth(10) });
      return { success: true, order, isStop: true };
    } else if (type === 'STOP_LOSS') {
      if (side === 'BUY') {
        const marginLock = +((cleanStopPrice * 1.05 * cleanQty) / cleanLeverage).toFixed(2);
        this.accountManager.lockCredits(userId, marginLock);
      } else if (!orderIsShort) {
        this.accountManager.lockShares(userId, symbol, cleanQty);
      } else {
        const marginLock = +((cleanStopPrice * 1.05 * cleanQty) / cleanLeverage).toFixed(2);
        this.accountManager.lockCredits(userId, marginLock);
      }
      book.addStopOrder(order);
      this.emit('stopOrderPlaced', order);
      this.emit('orderbookChange', { symbol, depth: book.getDepth(10) });
      return { success: true, order, isStop: true };
    } else if (type === 'TRAILING_STOP') {
      if (side === 'BUY') {
        const estPrice = currentMidPrice + cleanTrailingDelta;
        const marginLock = +((estPrice * 1.05 * cleanQty) / cleanLeverage).toFixed(2);
        this.accountManager.lockCredits(userId, marginLock);
      } else if (!orderIsShort) {
        this.accountManager.lockShares(userId, symbol, cleanQty);
      } else {
        const estPrice = Math.max(0.01, currentMidPrice - cleanTrailingDelta);
        const marginLock = +((estPrice * 1.05 * cleanQty) / cleanLeverage).toFixed(2);
        this.accountManager.lockCredits(userId, marginLock);
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

      // OCO mutual cancellation: If matched order had an ocoGroupId, cancel counterpart
      if (order.ocoGroupId) {
        this._cancelOcoCounterpart(symbol, order.ocoGroupId, order.id);
      }
      if (trade.buyerOcoGroupId) {
        const triggeringId = trade.takerSide === 'BUY' ? trade.takerOrderId : trade.makerOrderId;
        this._cancelOcoCounterpart(symbol, trade.buyerOcoGroupId, triggeringId);
      }
      if (trade.sellerOcoGroupId) {
        const triggeringId = trade.takerSide === 'SELL' ? trade.takerOrderId : trade.makerOrderId;
        this._cancelOcoCounterpart(symbol, trade.sellerOcoGroupId, triggeringId);
      }
    }

    // If limit order was filled or cancelled immediately without resting
    if (type === 'LIMIT' && !result.remainingOrder) {
      if (order.quantity > 0) {
        if (side === 'BUY') {
          const unlocked = +((cleanPrice * order.quantity) / cleanLeverage).toFixed(2);
          this.accountManager.unlockCredits(userId, unlocked);
        } else if (!orderIsShort) {
          this.accountManager.unlockShares(userId, symbol, order.quantity);
        } else {
          const unlocked = +((cleanPrice * order.quantity) / cleanLeverage).toFixed(2);
          this.accountManager.unlockCredits(userId, unlocked);
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
   * Submit an OCO (One-Cancels-the-Other) bracket order pair
   * @param {Object} limitOrderParams - Take-profit limit order
   * @param {Object} stopOrderParams - Stop-loss or trailing-stop order
   */
  submitOcoOrder(limitOrderParams, stopOrderParams) {
    const ocoGroupId = `oco_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const limitRes = this.submitOrder({ ...limitOrderParams, ocoGroupId });
    if (!limitRes.success) {
      return { success: false, error: `Limit leg failed: ${limitRes.error}` };
    }

    const stopRes = this.submitOrder({ ...stopOrderParams, ocoGroupId });
    if (!stopRes.success) {
      // Roll back limit leg if stop submission fails
      this.cancelOrder(limitOrderParams.symbol, limitRes.order.id, limitOrderParams.userId);
      return { success: false, error: `Stop leg failed: ${stopRes.error}` };
    }

    return {
      success: true,
      ocoGroupId,
      limitOrder: limitRes.order,
      stopOrder: stopRes.order
    };
  }

  /**
   * Cancel counterpart orders in an OCO group when one leg executes
   * @param {string} symbol
   * @param {string} ocoGroupId
   * @param {string} triggeringOrderId
   */
  _cancelOcoCounterpart(symbol, ocoGroupId, triggeringOrderId) {
    if (!ocoGroupId) return;
    const book = this.books.get(symbol);
    if (!book) return;

    for (const [orderId, ord] of book.orders.entries()) {
      if (ord.ocoGroupId === ocoGroupId && orderId !== triggeringOrderId && ord.status !== 'CANCELLED' && ord.status !== 'FILLED') {
        this.cancelOrder(symbol, orderId, ord.userId);
        this.emit('ocoCounterpartCancelled', { symbol, ocoGroupId, cancelledOrderId: orderId });
      }
    }

    for (const [orderId, ord] of book.stopOrders.entries()) {
      if (ord.ocoGroupId === ocoGroupId && orderId !== triggeringOrderId && ord.status !== 'CANCELLED' && ord.status !== 'FILLED') {
        this.cancelOrder(symbol, orderId, ord.userId);
        this.emit('ocoCounterpartCancelled', { symbol, ocoGroupId, cancelledOrderId: orderId });
      }
    }
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

        // Cancel OCO counterpart if stop order triggered
        if (stopOrder.ocoGroupId) {
          this._cancelOcoCounterpart(symbol, stopOrder.ocoGroupId, stopOrder.id);
        }

        if (stopOrder.type === 'STOP_LOSS' || stopOrder.type === 'TRAILING_STOP') {
          // Convert to MARKET order
          stopOrder.type = 'MARKET';
          if (stopOrder.side === 'BUY') {
            const lockedAmount = +(stopOrder.stopPrice * 1.05 * stopOrder.quantity).toFixed(2);
            this.accountManager.unlockCredits(stopOrder.userId, lockedAmount);
          } else if (!stopOrder.isShort) {
            this.accountManager.unlockShares(stopOrder.userId, stopOrder.symbol, stopOrder.quantity);
          } else {
            const lockedAmount = +(stopOrder.stopPrice * 1.05 * stopOrder.quantity).toFixed(2);
            this.accountManager.unlockCredits(stopOrder.userId, lockedAmount);
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
            } else if (!stopOrder.isShort) {
              this.accountManager.unlockShares(stopOrder.userId, symbol, stopOrder.quantity);
            } else {
              this.accountManager.unlockCredits(stopOrder.userId, stopOrder.price * stopOrder.quantity);
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

  /**
   * Check an account for margin call and trigger automated liquidation if equity < maintenance margin
   * @param {string} userId
   * @returns {Array<Object>|null}
   */
  checkAndLiquidate(userId) {
    const prices = {};
    for (const [sym, b] of this.books.entries()) {
      prices[sym] = b.getSpread().mid || 100;
    }

    const marginStatus = this.accountManager.getMarginStatus(userId, prices);
    if (!marginStatus || !marginStatus.isMarginCall) return null;

    const user = this.accountManager.getUser(userId);
    if (!user) return null;

    const liquidations = [];
    for (const [sym, h] of user.holdings.entries()) {
      const book = this.books.get(sym);
      if (!book) continue;

      // Liquidate short positions (buy to cover)
      if (h.shortQuantity > 0) {
        const coverQty = h.shortQuantity;
        const res = this.submitOrder({
          userId: user.id,
          userName: user.name,
          symbol: sym,
          side: 'BUY',
          type: 'MARKET',
          quantity: coverQty,
          leverage: 1
        });
        liquidations.push({ symbol: sym, action: 'LIQUIDATE_SHORT', quantity: coverQty, result: res });
      }

      // Liquidate long positions (market sell)
      if (h.quantity > 0) {
        const sellQty = h.quantity;
        const res = this.submitOrder({
          userId: user.id,
          userName: user.name,
          symbol: sym,
          side: 'SELL',
          type: 'MARKET',
          quantity: sellQty,
          leverage: 1
        });
        liquidations.push({ symbol: sym, action: 'LIQUIDATE_LONG', quantity: sellQty, result: res });
      }
    }

    this.emit('liquidation', { userId, liquidations, timestamp: Date.now() });
    return liquidations;
  }

  cancelOrder(symbol, orderId, userId) {
    const book = this.books.get(symbol);
    if (!book) return { success: false, error: 'Invalid symbol' };

    const order = book.orders.get(orderId) || book.stopOrders.get(orderId);
    if (!order) return { success: false, error: 'Order not found or already filled' };

    if (order.userId !== userId) {
      return { success: false, error: 'Unauthorized to cancel this order' };
    }

    const cancelled = book.cancelOrder(orderId);
    if (cancelled) {
      // Unlock remaining reserved capital/shares
      if (cancelled.side === 'BUY') {
        if (cancelled.type === 'STOP_LOSS' || cancelled.type === 'TRAILING_STOP') {
          const lockedAmount = +(cancelled.stopPrice * 1.05 * cancelled.quantity).toFixed(2);
          this.accountManager.unlockCredits(userId, lockedAmount);
        } else {
          this.accountManager.unlockCredits(userId, (cancelled.price || cancelled.stopPrice || 0) * cancelled.quantity);
        }
      } else {
        if (!cancelled.isShort) {
          this.accountManager.unlockShares(userId, symbol, cancelled.quantity);
        } else {
          const lockedAmount = +(cancelled.stopPrice * 1.05 * cancelled.quantity).toFixed(2);
          this.accountManager.unlockCredits(userId, lockedAmount);
        }
      }

      this.emit('orderbookChange', {
        symbol,
        depth: book.getDepth(10)
      });

      return { success: true, order: cancelled };
    }

    return { success: false, error: 'Failed to cancel order' };
  }

  /**
   * Query Indicative Equilibrium Price and Volume for a symbol
   */
  getIndicativeOpening(symbol, referencePrice = null) {
    const book = this.books.get(symbol);
    if (!book) return null;
    return {
      symbol,
      ...book.calculateIndicativeClearingPrice(referencePrice)
    };
  }

  /**
   * Query Indicative Opening data across all symbols
   */
  getAllIndicativeOpenings(referencePrices = {}) {
    const reports = {};
    for (const [symbol, book] of this.books.entries()) {
      reports[symbol] = book.calculateIndicativeClearingPrice(referencePrices[symbol] || null);
    }
    return reports;
  }

  /**
   * Execute Opening Auction across all symbols at the Opening Bell
   * Matches all crossing orders at uniform single clearing price P*
   */
  executeAllOpeningAuctions(referencePrices = {}) {
    const results = {};
    for (const [symbol, book] of this.books.entries()) {
      const ref = referencePrices[symbol] || null;
      results[symbol] = this.executeOpeningAuction(symbol, ref);
    }
    this.emit('auction:allCleared', results);
    return results;
  }

  /**
   * Execute Opening Auction for a specific symbol
   */
  executeOpeningAuction(symbol, referencePrice = null) {
    const book = this.books.get(symbol);
    if (!book) return null;

    const auctionResult = book.executeAuctionUncrossing(referencePrice);
    const { trades, clearingPrice, clearingVolume } = auctionResult;

    for (const trade of trades) {
      // In call market, both buyer and seller orders rested in the book prior to uncrossing
      this.accountManager.settleTrade(trade, true, true);
      this.emit('trade', trade);
    }

    if (trades.length > 0) {
      this.emit('orderbookChange', { symbol, depth: book.getDepth(10) });
    }

    const report = {
      symbol,
      clearingPrice,
      clearingVolume,
      tradesCount: trades.length,
      timestamp: Date.now()
    };

    this.emit('auction:cleared', report);
    return report;
  }
}
