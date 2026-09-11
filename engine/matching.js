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
    if (symbols && !Array.isArray(symbols) && typeof symbols.getUser === 'function') {
      clock = accountManager;
      accountManager = symbols;
      symbols = null;
    }
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
        } else if (bell === 'CLOSING_BELL') {
          this.executeAllClosingAuctions();
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

    if (this.clock && !this.clock.isTradingOpen()) {
      // In Pre-market, allow limit orders, resting stop orders, and closing auction orders
      if (this.clock.phase !== 'PRE_MARKET' || (type !== 'LIMIT' && type !== 'STOP_LOSS' && type !== 'STOP_LIMIT' && type !== 'TRAILING_STOP' && type !== 'MOC' && type !== 'LOC')) {
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

    // Check if symbol is halted under LULD circuit breaker
    if (book.isHalted()) {
      if (type === 'MARKET') {
        return { success: false, error: `Trading in ${symbol} is currently HALTED by LULD circuit breaker` };
      }
    }

    const cleanQty = Math.floor(Number(quantity));
    if (isNaN(cleanQty) || cleanQty <= 0) {
      return { success: false, error: 'Quantity must be a positive whole integer' };
    }

    const cleanLeverage = Math.min(5, Math.max(1, Number(leverage) || 1));
    const cleanPrice = price !== undefined && price !== null ? +(Number(price).toFixed(2)) : 0;
    const cleanStopPrice = stopPrice !== undefined && stopPrice !== null ? +(Number(stopPrice).toFixed(2)) : 0;
    const cleanTrailingDelta = trailingDelta !== undefined && trailingDelta !== null ? +(Number(trailingDelta).toFixed(2)) : 5.0;

    if ((type === 'LIMIT' || type === 'STOP_LIMIT' || type === 'LOC') && (isNaN(cleanPrice) || cleanPrice <= 0)) {
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

    // Reg SHO Rule 201 alternative uptick rule restriction
    if (orderIsShort && book.regShoTriggered) {
      const bestBid = book.getBestBid();
      if (type === 'MARKET') {
        return {
          success: false,
          error: `Reg SHO Rule 201 active for ${symbol}: Short sales cannot execute at market (restricted to passive limit prices above best bid)`
        };
      }
      if (bestBid !== null && cleanPrice <= bestBid) {
        return {
          success: false,
          error: `Reg SHO Rule 201 active for ${symbol}: Short sale limit price ($${cleanPrice}) must be strictly above the best bid ($${bestBid})`
        };
      }
    }

    // Balance and holding validations
    if (side === 'BUY') {
      let estimatedPrice = cleanPrice;
      if (type === 'MARKET') {
        const sweep = this.calculateBookSweepEstimate(symbol, 'BUY', cleanQty);
        const bestAsk = book.getBestAsk();
        if (!bestAsk && !sweep) {
          return { success: false, error: 'Cannot execute Market Buy: No sellers in the order book' };
        }
        estimatedPrice = sweep ? sweep.vwap : (bestAsk * 1.05);
      } else if (type === 'STOP_LOSS') {
        estimatedPrice = cleanStopPrice * 1.05;
      } else if (type === 'STOP_LIMIT') {
        estimatedPrice = cleanPrice;
      } else if (type === 'TRAILING_STOP') {
        estimatedPrice = (currentMidPrice + cleanTrailingDelta) * 1.05;
      } else if (type === 'MOC') {
        estimatedPrice = currentMidPrice * 1.05;
      } else if (type === 'LOC') {
        estimatedPrice = cleanPrice;
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
    } else if (type === 'MOC') {
      if (side === 'BUY') {
        const estPrice = currentMidPrice * 1.05;
        const marginLock = +((estPrice * cleanQty) / cleanLeverage).toFixed(2);
        this.accountManager.lockCredits(userId, marginLock);
      } else if (!orderIsShort) {
        this.accountManager.lockShares(userId, symbol, cleanQty);
      } else {
        const estPrice = currentMidPrice * 1.05;
        const marginLock = +((estPrice * cleanQty) / cleanLeverage).toFixed(2);
        this.accountManager.lockCredits(userId, marginLock);
      }
      book.addClosingOrder(order);
      this.emit('closingOrderPlaced', order);
      const indicative = book.calculateClosingAuctionPrice(currentMidPrice);
      this.emit('auction:closingIndicative', { symbol, ...indicative });
      return { success: true, order, isClosingAuction: true };
    } else if (type === 'LOC') {
      if (side === 'BUY') {
        const marginLock = +((cleanPrice * cleanQty) / cleanLeverage).toFixed(2);
        this.accountManager.lockCredits(userId, marginLock);
      } else if (!orderIsShort) {
        this.accountManager.lockShares(userId, symbol, cleanQty);
      } else {
        const marginLock = +((cleanPrice * cleanQty) / cleanLeverage).toFixed(2);
        this.accountManager.lockCredits(userId, marginLock);
      }
      book.addClosingOrder(order);
      this.emit('closingOrderPlaced', order);
      const indicative = book.calculateClosingAuctionPrice(currentMidPrice);
      this.emit('auction:closingIndicative', { symbol, ...indicative });
      return { success: true, order, isClosingAuction: true };
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

    if (result.haltTriggered) {
      this.emit('circuitBreaker:halt', { symbol, reason: result.reason, durationSec: 30 });
    }

    return {
      success: true,
      order,
      trades: result.trades,
      remainingOrder: result.remainingOrder,
      isHalted: result.isHalted,
      haltTriggered: result.haltTriggered
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
        if (cancelled.type === 'STOP_LOSS' || cancelled.type === 'TRAILING_STOP' || cancelled.type === 'MOC') {
          const ref = cancelled.stopPrice || cancelled.currentMarketPrice || 100;
          const lockedAmount = +((ref * 1.05 * cancelled.quantity) / (cancelled.leverage || 1)).toFixed(2);
          this.accountManager.unlockCredits(userId, lockedAmount);
        } else {
          const lockedAmount = +(((cancelled.price || cancelled.stopPrice || 0) * cancelled.quantity) / (cancelled.leverage || 1)).toFixed(2);
          this.accountManager.unlockCredits(userId, lockedAmount);
        }
      } else {
        if (!cancelled.isShort) {
          this.accountManager.unlockShares(userId, symbol, cancelled.quantity);
        } else {
          const ref = cancelled.stopPrice || cancelled.price || cancelled.currentMarketPrice || 100;
          const lockedAmount = +((ref * 1.05 * cancelled.quantity) / (cancelled.leverage || 1)).toFixed(2);
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

  /**
   * Query Indicative Closing Price and Volume for a symbol
   */
  getIndicativeClosing(symbol, referencePrice = null) {
    const book = this.books.get(symbol);
    if (!book) return null;
    return {
      symbol,
      ...book.calculateClosingAuctionPrice(referencePrice)
    };
  }

  /**
   * Query Indicative Closing data across all symbols
   */
  getAllIndicativeClosings(referencePrices = {}) {
    const reports = {};
    for (const [symbol, book] of this.books.entries()) {
      reports[symbol] = book.calculateClosingAuctionPrice(referencePrices[symbol] || null);
    }
    return reports;
  }

  /**
   * Execute Closing Call Auction across all symbols at the Closing Bell
   * Matches all eligible MOC, LOC, and crossing limit orders at uniform single clearing price
   */
  executeAllClosingAuctions(referencePrices = {}) {
    const results = {};
    for (const [symbol, book] of this.books.entries()) {
      const ref = referencePrices[symbol] || null;
      results[symbol] = this.executeClosingAuction(symbol, ref);
    }
    this.emit('closingAuction:allCleared', results);
    return results;
  }

  /**
   * Execute Closing Call Auction for a specific symbol
   */
  executeClosingAuction(symbol, referencePrice = null) {
    const book = this.books.get(symbol);
    if (!book) return null;

    const auctionResult = book.executeClosingAuction(referencePrice);
    const { trades, clearingPrice, clearingVolume, expiredOrders } = auctionResult;

    for (const trade of trades) {
      this.accountManager.settleTrade(trade, true, true);
      this.emit('trade', trade);
    }

    for (const expired of expiredOrders) {
      if (expired.side === 'BUY' || expired.isShort) {
        const refPrice = expired.type === 'LOC' ? expired.price : (expired.currentMarketPrice || clearingPrice || 100);
        const lockedAmount = +((refPrice * (expired.type === 'MOC' ? 1.05 : 1.0) * expired.quantity) / (expired.leverage || 1)).toFixed(2);
        this.accountManager.unlockCredits(expired.userId, lockedAmount);
      } else {
        this.accountManager.unlockShares(expired.userId, symbol, expired.quantity);
      }
      this.emit('orderExpired', expired);
    }

    if (trades.length > 0) {
      this.emit('orderbookChange', { symbol, depth: book.getDepth(10) });
    }

    const report = {
      symbol,
      clearingPrice,
      clearingVolume,
      tradesCount: trades.length,
      expiredCount: expiredOrders.length,
      timestamp: Date.now()
    };

    this.emit('closingAuction:cleared', report);
    return report;
  }

  /**
   * Query Order Book Imbalance (OBI) for a specific symbol
   * @param {string} symbol
   * @param {number} [depthLevels=5]
   * @returns {Object|null}
   */
  getOrderBookImbalance(symbol, depthLevels = 5) {
    const book = this.books.get(symbol);
    if (!book) return null;
    return book.getOrderBookImbalance(depthLevels);
  }

  /**
   * Query Order Book Imbalance (OBI) across all active symbols
   * @param {number} [depthLevels=5]
   * @returns {Object<string, Object>}
   */
  getAllOrderBookImbalances(depthLevels = 5) {
    const reports = {};
    for (const [symbol, book] of this.books.entries()) {
      reports[symbol] = book.getOrderBookImbalance(depthLevels);
    }
    return reports;
  }

  /**
   * Calculates nonlinear book sweep VWAP and slippage for market orders
   * @param {string} symbol
   * @param {'BUY'|'SELL'} side
   * @param {number} quantity
   * @returns {Object|null}
   */
  calculateBookSweepEstimate(symbol, side, quantity) {
    const book = this.books.get(symbol);
    if (!book) return null;
    const levels = side === 'BUY' ? book.asks : book.bids;
    if (!levels || levels.length === 0) return null;

    let remaining = quantity;
    let totalNotional = 0;
    let filled = 0;

    for (const ord of levels) {
      const take = Math.min(remaining, ord.quantity);
      totalNotional += take * ord.price;
      filled += take;
      remaining -= take;
      if (remaining <= 0) break;
    }

    if (filled === 0) return null;
    const topOfBook = levels[0].price;
    // If order size exceeds visible depth, extrapolate remaining shares with nonlinear penalty
    if (remaining > 0) {
      const lastPrice = levels[levels.length - 1].price;
      const penaltyPercent = Math.min(0.20, (remaining / quantity) * 0.10);
      const penaltyPrice = side === 'BUY' ? lastPrice * (1 + penaltyPercent) : lastPrice * (1 - penaltyPercent);
      totalNotional += remaining * penaltyPrice;
      filled += remaining;
    }
    const finalVwap = +(totalNotional / filled).toFixed(2);
    const slippageBps = +(((Math.abs(finalVwap - topOfBook)) / topOfBook) * 10000).toFixed(1);
    return {
      symbol,
      side,
      quantity,
      vwap: finalVwap,
      topOfBook,
      totalNotional: +totalNotional.toFixed(2),
      slippageBps,
      visibleSharesFilled: filled - remaining
    };
  }

  /**
   * Triggers an automated Limit-Up/Limit-Down (LULD) trading halt on a symbol
   * @param {string} symbol
   * @param {string} reason
   * @param {number} durationSec
   */
  triggerSymbolHalt(symbol, reason = 'LULD_BREACH', durationSec = 30) {
    const book = this.books.get(symbol);
    if (!book) return null;
    const haltInfo = book.triggerHalt(reason, durationSec);
    this.emit('circuitBreaker:halt', haltInfo);
    return haltInfo;
  }

  /**
   * Resumes trading on a halted symbol and uncrosses accumulated orders via call auction
   * @param {string} symbol
   * @param {number} [referencePrice]
   */
  executeResumptionAuction(symbol, referencePrice = null) {
    const book = this.books.get(symbol);
    if (!book) return null;

    const auctionResult = book.executeAuctionUncrossing(referencePrice || book.referencePrice);
    const { trades, clearingPrice, clearingVolume } = auctionResult;

    book.resumeTrading();
    if (clearingPrice) {
      book.setReferencePrice(clearingPrice);
    }

    for (const trade of trades) {
      const buyerWasMaker = trade.takerSide === 'SELL' || trade.isAuction;
      const sellerWasMaker = trade.takerSide === 'BUY' || trade.isAuction;
      this.accountManager.settleTrade(trade, buyerWasMaker, sellerWasMaker);
      this.emit('trade', trade);
    }

    const report = {
      symbol,
      clearingPrice,
      clearingVolume,
      tradesCount: trades.length,
      timestamp: Date.now()
    };

    this.emit('circuitBreaker:resumed', report);
    this.emit('orderbookChange', { symbol, depth: book.getDepth(10) });
    return report;
  }

  getLULDBands(symbol) {
    const book = this.books.get(symbol);
    return book ? book.getLULDBands() : null;
  }
}


