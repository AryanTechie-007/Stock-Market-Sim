import { EventEmitter } from 'events';

/**
 * Dark Pool / Alternative Trading System (ATS)
 * Non-displayed liquidity venue matching institutional block orders at the
 * NBBO (National Best Bid and Offer) midpoint with zero pre-trade market impact.
 */
export class DarkPoolATS extends EventEmitter {
  /**
   * @param {Object} matchingEngine Reference to lit MatchingEngine
   * @param {Object} accountManager Reference to AccountManager for settlements
   * @param {Object} [options]
   * @param {number} [options.minBlockSize=100] Minimum shares required per dark order
   */
  constructor(matchingEngine, accountManager, options = {}) {
    super();
    this.matchingEngine = matchingEngine;
    this.accountManager = accountManager;
    this.minBlockSize = options.minBlockSize !== undefined ? options.minBlockSize : 100;

    this.orders = new Map(); // orderId -> Order
    this.buyOrders = new Map(); // symbol -> Array<Order>
    this.sellOrders = new Map(); // symbol -> Array<Order>
    this.trades = []; // ATS trade execution history
    this.maxTradesHistory = options.maxTradesHistory || 500;

    this.stats = {
      totalTrades: 0,
      totalVolume: 0,
      totalNotional: 0,
      totalPriceImprovement: 0,
      symbolStats: new Map() // symbol -> { volume, trades, notional, priceImprovement }
    };

    this._crossingLocks = new Set(); // Prevent re-entrant cross triggers per symbol

    // Wire listeners to lit market events: check for dark crosses when lit quotes change
    if (this.matchingEngine) {
      this.matchingEngine.on('orderbookChange', ({ symbol }) => {
        if (symbol) this.executeCross(symbol);
      });
      this.matchingEngine.on('trade', (trade) => {
        if (trade && trade.symbol && !trade.isDarkPool) {
          this.executeCross(trade.symbol);
        }
      });
    }
  }

  /**
   * Sample National Best Bid and Offer (NBBO) from lit order book
   * @param {string} symbol
   * @returns {{ valid: boolean, bestBid?: number, bestAsk?: number, spread?: number, midpoint?: number, priceImprovementPerShare?: number, reason?: string }}
   */
  getNBBO(symbol) {
    if (!this.matchingEngine) {
      return { valid: false, reason: 'Matching engine not available' };
    }
    const book = this.matchingEngine.getOrderBook(symbol);
    if (!book) {
      return { valid: false, reason: `No lit book found for symbol ${symbol}` };
    }

    const bestBid = book.getBestBid();
    const bestAsk = book.getBestAsk();

    if (bestBid === null || bestAsk === null) {
      return { valid: false, reason: 'One-sided market: missing bid or ask liquidity in lit book' };
    }

    if (bestBid >= bestAsk) {
      return { valid: false, reason: `Crossed or locked lit market (Bid: ${bestBid}, Ask: ${bestAsk})` };
    }

    const spread = +(bestAsk - bestBid).toFixed(2);
    const midpoint = +((bestBid + bestAsk) / 2).toFixed(2);
    const priceImprovementPerShare = +(spread / 2).toFixed(2);

    return {
      valid: true,
      symbol,
      bestBid,
      bestAsk,
      spread,
      midpoint,
      priceImprovementPerShare
    };
  }

  /**
   * Submit an institutional non-displayed order to the Dark Pool ATS
   * @param {Object} rawOrder
   * @param {string} rawOrder.userId
   * @param {string} rawOrder.userName
   * @param {string} rawOrder.symbol
   * @param {'BUY'|'SELL'} rawOrder.side
   * @param {'MIDPOINT_PEG'|'IOC_MIDPOINT'|'LIMIT_MIDPOINT'} [rawOrder.type='MIDPOINT_PEG']
   * @param {number} rawOrder.quantity
   * @param {number} [rawOrder.price] Optional limit price cap/floor
   * @param {number} [rawOrder.minQuantity] Minimum Execution Size (MES)
   * @param {number} [rawOrder.leverage=1]
   * @param {boolean} [rawOrder.isShort=false]
   * @returns {{ success: boolean, order?: Object, trades?: Array, error?: string }}
   */
  submitOrder(rawOrder) {
    const {
      userId,
      userName,
      symbol: rawSymbol,
      side: rawSide,
      type: rawType,
      quantity: rawQty,
      price: rawPrice,
      minQuantity: rawMinQty,
      leverage: rawLev,
      isShort: rawIsShort
    } = rawOrder;

    if (!userId) return { success: false, error: 'User ID is required' };
    if (!rawSymbol) return { success: false, error: 'Symbol is required' };

    const symbol = rawSymbol.toUpperCase();
    const side = (rawSide || '').toUpperCase();
    if (side !== 'BUY' && side !== 'SELL') {
      return { success: false, error: 'Order side must be BUY or SELL' };
    }

    const validTypes = ['MIDPOINT_PEG', 'IOC_MIDPOINT', 'LIMIT_MIDPOINT'];
    const type = rawType ? rawType.toUpperCase() : 'MIDPOINT_PEG';
    if (!validTypes.includes(type)) {
      return { success: false, error: `Invalid order type. Must be one of: ${validTypes.join(', ')}` };
    }

    const quantity = Math.floor(Number(rawQty));
    if (isNaN(quantity) || quantity <= 0) {
      return { success: false, error: 'Quantity must be a positive integer' };
    }

    if (quantity < this.minBlockSize) {
      return {
        success: false,
        error: `Order quantity (${quantity}) is below minimum Dark Pool ATS block threshold of ${this.minBlockSize} shares`
      };
    }

    const minQuantity = rawMinQty !== undefined && rawMinQty !== null ? Math.max(1, Math.floor(Number(rawMinQty))) : null;
    if (minQuantity !== null && minQuantity > quantity) {
      return { success: false, error: 'Minimum execution size (MES) cannot exceed order quantity' };
    }

    const limitPrice = rawPrice !== undefined && rawPrice !== null ? +(Number(rawPrice).toFixed(2)) : null;
    if (type === 'LIMIT_MIDPOINT' && (!limitPrice || limitPrice <= 0 || isNaN(limitPrice))) {
      return { success: false, error: 'Valid limit price is required for LIMIT_MIDPOINT orders' };
    }

    const leverage = Math.min(5, Math.max(1, Number(rawLev) || 1));
    let isShort = Boolean(rawIsShort);

    // Estimate execution price from NBBO or lit book
    const nbbo = this.getNBBO(symbol);
    const book = this.matchingEngine ? this.matchingEngine.getOrderBook(symbol) : null;
    const estPrice = nbbo.valid ? nbbo.midpoint : (book ? (book.getSpread().mid || 100) : 100);

    // Collateral & holdings verification and locking
    let lockedAmount = 0;
    let lockedShares = 0;

    if (side === 'BUY') {
      const refPrice = (type === 'LIMIT_MIDPOINT' && limitPrice) ? Math.max(estPrice, limitPrice) : estPrice;
      if (!this.accountManager.canAffordBuy(userId, refPrice, quantity, leverage)) {
        return { success: false, error: 'Insufficient credits or margin for dark pool buy order' };
      }
      lockedAmount = +((refPrice * quantity) / leverage).toFixed(2);
      this.accountManager.lockCredits(userId, lockedAmount);
    } else {
      // SELL: Check whether long shares exist or short borrowing is needed
      const sellCheck = this.accountManager.getSellAvailability(userId, symbol);
      if (sellCheck.availableShares >= quantity && !isShort) {
        isShort = false;
        lockedShares = quantity;
        this.accountManager.lockShares(userId, symbol, quantity);
      } else {
        isShort = true;
        const refPrice = (type === 'LIMIT_MIDPOINT' && limitPrice) ? limitPrice : estPrice;
        if (!this.accountManager.canAffordShort(userId, refPrice, quantity, leverage)) {
          return { success: false, error: 'Insufficient margin collateral for dark pool short sale' };
        }
        lockedAmount = +((refPrice * quantity) / leverage).toFixed(2);
        this.accountManager.lockCredits(userId, lockedAmount);
      }
    }

    const orderId = `drk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const order = {
      id: orderId,
      userId,
      userName: userName || `Trader_${userId.slice(-4)}`,
      symbol,
      side,
      type,
      quantity,
      originalQuantity: quantity,
      filledQuantity: 0,
      price: limitPrice,
      minQuantity,
      leverage,
      isShort,
      lockedAmount,
      lockedShares,
      status: 'RESTING',
      venue: 'DARK_POOL',
      timestamp: Date.now()
    };

    this.orders.set(orderId, order);

    if (side === 'BUY') {
      if (!this.buyOrders.has(symbol)) this.buyOrders.set(symbol, []);
      this.buyOrders.get(symbol).push(order);
    } else {
      if (!this.sellOrders.has(symbol)) this.sellOrders.set(symbol, []);
      this.sellOrders.get(symbol).push(order);
    }

    this.emit('darkOrderPlaced', { ...order });

    // Attempt immediate midpoint cross
    const crossResult = this.executeCross(symbol);
    const orderTrades = (crossResult.trades || []).filter(t => t.makerOrderId === orderId || t.takerOrderId === orderId);

    // Handle Immediate-Or-Cancel (IOC_MIDPOINT)
    if (type === 'IOC_MIDPOINT' && order.quantity > 0) {
      const remainingUnfilled = order.quantity;
      this._cancelRestingOrderInternal(order);
      order.status = order.filledQuantity > 0 ? 'PARTIALLY_FILLED' : 'CANCELLED';
      order.iocCancelledRemainder = remainingUnfilled;
    }

    return {
      success: true,
      order,
      trades: orderTrades,
      isDarkPool: true
    };
  }

  /**
   * Execute non-displayed midpoint cross for a symbol against NBBO
   * @param {string} symbol
   * @returns {{ trades: Array<Object>, executedCount: number, crossedVolume: number }}
   */
  executeCross(symbol) {
    if (!symbol) return { trades: [], executedCount: 0, crossedVolume: 0 };
    if (this._crossingLocks.has(symbol)) {
      return { trades: [], executedCount: 0, crossedVolume: 0 };
    }

    this._crossingLocks.add(symbol);
    const trades = [];

    try {
      const nbbo = this.getNBBO(symbol);
      if (!nbbo.valid) {
        return { trades: [], executedCount: 0, crossedVolume: 0, reason: nbbo.reason };
      }

      const buys = this.buyOrders.get(symbol) || [];
      const sells = this.sellOrders.get(symbol) || [];

      if (buys.length === 0 || sells.length === 0) {
        return { trades: [], executedCount: 0, crossedVolume: 0 };
      }

      const midpoint = nbbo.midpoint;
      let bIdx = 0;

      while (bIdx < buys.length) {
        const buy = buys[bIdx];

        // Check buy limit constraint: buy won't pay higher than limit price
        if (buy.type === 'LIMIT_MIDPOINT' && buy.price !== null && midpoint > buy.price) {
          bIdx++;
          continue;
        }

        let sIdx = 0;
        let matchedWithSell = false;

        while (sIdx < sells.length && buy.quantity > 0) {
          const sell = sells[sIdx];

          // Self-trading prevention
          if (buy.userId === sell.userId) {
            sIdx++;
            continue;
          }

          // Check sell limit constraint: sell won't sell lower than limit price
          if (sell.type === 'LIMIT_MIDPOINT' && sell.price !== null && midpoint < sell.price) {
            sIdx++;
            continue;
          }

          const potentialQty = Math.min(buy.quantity, sell.quantity);

          // Minimum Execution Size (MES) checks
          if (buy.minQuantity && potentialQty < buy.minQuantity) {
            sIdx++;
            continue;
          }
          if (sell.minQuantity && potentialQty < sell.minQuantity) {
            sIdx++;
            continue;
          }

          // Valid cross match found!
          const matchQty = potentialQty;
          buy.quantity -= matchQty;
          buy.filledQuantity += matchQty;
          sell.quantity -= matchQty;
          sell.filledQuantity += matchQty;

          const tradeId = `dark_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const buyerSavings = +(nbbo.priceImprovementPerShare * matchQty).toFixed(2);
          const sellerSavings = +(nbbo.priceImprovementPerShare * matchQty).toFixed(2);
          const totalSavings = +(nbbo.spread * matchQty).toFixed(2);

          const trade = {
            id: tradeId,
            symbol,
            price: midpoint,
            quantity: matchQty,
            buyerId: buy.userId,
            buyerName: buy.userName,
            sellerId: sell.userId,
            sellerName: sell.userName,
            takerSide: 'ATS_MIDPOINT',
            venue: 'DARK_POOL',
            isDarkPool: true,
            bestBid: nbbo.bestBid,
            bestAsk: nbbo.bestAsk,
            spread: nbbo.spread,
            priceImprovement: nbbo.priceImprovementPerShare,
            buyerSavings,
            sellerSavings,
            totalSavings,
            buyerLeverage: buy.leverage,
            sellerLeverage: sell.leverage,
            buyerIsShort: buy.isShort,
            sellerIsShort: sell.isShort,
            makerOrderId: sell.id,
            takerOrderId: buy.id,
            timestamp: Date.now()
          };

          trades.push(trade);

          // Settle trade accounts: both buyer and seller were non-displayed resting limit orders
          if (this.accountManager) {
            this.accountManager.settleTrade(trade, true, true);
          }

          // Update statistics
          this._recordStats(trade);

          // Push to history
          this.trades.unshift(trade);
          if (this.trades.length > this.maxTradesHistory) {
            this.trades.pop();
          }

          // Emit dark trade event
          this.emit('darkTrade', trade);

          // Emit to lit matching engine so tape, volume, and company prices reflect the cross
          if (this.matchingEngine) {
            this.matchingEngine.emit('trade', trade);
          }

          // Clean up filled sell order
          if (sell.quantity === 0) {
            sell.status = 'FILLED';
            sells.splice(sIdx, 1);
          } else {
            sell.status = 'PARTIALLY_FILLED';
            sIdx++;
          }

          matchedWithSell = true;
        }

        // Clean up filled buy order
        if (buy.quantity === 0) {
          buy.status = 'FILLED';
          buys.splice(bIdx, 1);
        } else {
          if (matchedWithSell) buy.status = 'PARTIALLY_FILLED';
          bIdx++;
        }
      }

      return {
        trades,
        executedCount: trades.length,
        crossedVolume: trades.reduce((sum, t) => sum + t.quantity, 0)
      };
    } finally {
      this._crossingLocks.delete(symbol);
    }
  }

  /**
   * Internal helper to cancel and unlock an order's reserved assets
   * @param {Object} order
   */
  _cancelRestingOrderInternal(order) {
    if (!order) return;

    if (order.side === 'BUY') {
      const buyList = this.buyOrders.get(order.symbol);
      if (buyList) {
        const idx = buyList.findIndex(o => o.id === order.id);
        if (idx !== -1) buyList.splice(idx, 1);
      }
      if (order.lockedAmount > 0 && order.quantity > 0) {
        const unlockRatio = order.quantity / order.originalQuantity;
        const unlockAmt = +(order.lockedAmount * unlockRatio).toFixed(2);
        this.accountManager.unlockCredits(order.userId, unlockAmt);
      }
    } else {
      const sellList = this.sellOrders.get(order.symbol);
      if (sellList) {
        const idx = sellList.findIndex(o => o.id === order.id);
        if (idx !== -1) sellList.splice(idx, 1);
      }
      if (!order.isShort) {
        if (order.quantity > 0) {
          this.accountManager.unlockShares(order.userId, order.symbol, order.quantity);
        }
      } else {
        if (order.lockedAmount > 0 && order.quantity > 0) {
          const unlockRatio = order.quantity / order.originalQuantity;
          const unlockAmt = +(order.lockedAmount * unlockRatio).toFixed(2);
          this.accountManager.unlockCredits(order.userId, unlockAmt);
        }
      }
    }

    order.status = 'CANCELLED';
    this.emit('darkOrderCancelled', { ...order });
  }

  /**
   * Cancel an open dark pool order
   * @param {string} orderId
   * @param {string} [userId] Optional validation of owner
   * @returns {{ success: boolean, order?: Object, error?: string }}
   */
  cancelOrder(orderId, userId = null) {
    const order = this.orders.get(orderId);
    if (!order) {
      return { success: false, error: 'Dark pool order not found' };
    }

    if (order.status === 'FILLED' || order.status === 'CANCELLED') {
      return { success: false, error: `Order is already ${order.status.toLowerCase()}` };
    }

    if (userId && order.userId !== userId) {
      return { success: false, error: 'Unauthorized to cancel this dark pool order' };
    }

    this._cancelRestingOrderInternal(order);
    return { success: true, order };
  }

  /**
   * Record cumulative and per-symbol ATS execution metrics
   * @param {Object} trade
   */
  _recordStats(trade) {
    const notional = +(trade.price * trade.quantity).toFixed(2);
    const savings = trade.totalSavings || 0;

    this.stats.totalTrades++;
    this.stats.totalVolume += trade.quantity;
    this.stats.totalNotional = +(this.stats.totalNotional + notional).toFixed(2);
    this.stats.totalPriceImprovement = +(this.stats.totalPriceImprovement + savings).toFixed(2);

    let symStats = this.stats.symbolStats.get(trade.symbol);
    if (!symStats) {
      symStats = { volume: 0, trades: 0, notional: 0, priceImprovement: 0 };
      this.stats.symbolStats.set(trade.symbol, symStats);
    }
    symStats.volume += trade.quantity;
    symStats.trades++;
    symStats.notional = +(symStats.notional + notional).toFixed(2);
    symStats.priceImprovement = +(symStats.priceImprovement + savings).toFixed(2);
  }

  /**
   * Query non-displayed aggregated depth without revealing individual institutional footprints
   * @param {string} symbol
   * @returns {{ symbol: string, totalBuyVolume: number, totalSellVolume: number, buyOrderCount: number, sellOrderCount: number, hasTwoSidedInterest: boolean, timestamp: number }}
   */
  getDarkBookDepth(symbol) {
    const sym = (symbol || '').toUpperCase();
    const buys = this.buyOrders.get(sym) || [];
    const sells = this.sellOrders.get(sym) || [];

    const totalBuyVolume = buys.reduce((sum, o) => sum + o.quantity, 0);
    const totalSellVolume = sells.reduce((sum, o) => sum + o.quantity, 0);

    return {
      symbol: sym,
      totalBuyVolume,
      totalSellVolume,
      buyOrderCount: buys.length,
      sellOrderCount: sells.length,
      hasTwoSidedInterest: buys.length > 0 && sells.length > 0,
      timestamp: Date.now()
    };
  }

  /**
   * Get all symbols non-displayed depth overview
   */
  getAllDarkBookDepths() {
    const symbols = this.matchingEngine ? this.matchingEngine.symbols : [];
    const depths = {};
    for (const sym of symbols) {
      depths[sym] = this.getDarkBookDepth(sym);
    }
    return depths;
  }

  /**
   * Retrieve ATS executed trades history
   * @param {string} [symbol]
   * @param {number} [limit=50]
   */
  getTrades(symbol = null, limit = 50) {
    const max = Math.min(200, Math.max(1, limit || 50));
    if (!symbol) {
      return this.trades.slice(0, max);
    }
    const sym = symbol.toUpperCase();
    return this.trades.filter(t => t.symbol === sym).slice(0, max);
  }

  /**
   * Query ATS platform performance metrics
   */
  getStats() {
    const symbolMap = {};
    for (const [sym, st] of this.stats.symbolStats.entries()) {
      symbolMap[sym] = { ...st };
    }

    return {
      totalTrades: this.stats.totalTrades,
      totalVolume: this.stats.totalVolume,
      totalNotional: this.stats.totalNotional,
      totalPriceImprovement: this.stats.totalPriceImprovement,
      symbols: symbolMap,
      timestamp: Date.now()
    };
  }

  /**
   * Get dark pool orders for a specific user
   * @param {string} userId
   */
  getUserOrders(userId) {
    const list = [];
    for (const order of this.orders.values()) {
      if (order.userId === userId) {
        list.push({ ...order });
      }
    }
    return list;
  }
}
