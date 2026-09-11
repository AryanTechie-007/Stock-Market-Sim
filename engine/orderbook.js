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
    this.closingOrders = new Map(); // orderId -> MOC or LOC order
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
          buyerLeverage: order.leverage || 1,
          sellerLeverage: bestAsk.leverage || 1,
          buyerIsShort: Boolean(order.isShort),
          sellerIsShort: Boolean(bestAsk.isShort),
          buyerOcoGroupId: order.ocoGroupId || null,
          sellerOcoGroupId: bestAsk.ocoGroupId || null,
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
          buyerLeverage: bestBid.leverage || 1,
          sellerLeverage: order.leverage || 1,
          buyerIsShort: Boolean(bestBid.isShort),
          sellerIsShort: Boolean(order.isShort),
          buyerOcoGroupId: bestBid.ocoGroupId || null,
          sellerOcoGroupId: order.ocoGroupId || null,
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
   * Add a resting stop-loss, stop-limit, or trailing-stop order outside the active matching queue
   * @param {Object} order
   */
  addStopOrder(order) {
    order.quantity = Math.max(0, Math.floor(order.quantity));
    order.originalQuantity = order.quantity;
    order.filledQuantity = 0;
    order.timestamp = order.timestamp || Date.now();
    order.status = 'STOP_RESTING';

    if (order.type === 'TRAILING_STOP') {
      order.trailingDelta = Math.max(0.1, +(Number(order.trailingDelta || 5).toFixed(2)));
      const refPrice = order.currentMarketPrice || order.price || order.stopPrice || 100;
      if (order.side === 'SELL') {
        order.peakPrice = refPrice;
        order.stopPrice = Math.max(0.01, +(refPrice - order.trailingDelta).toFixed(2));
      } else {
        order.troughPrice = refPrice;
        order.stopPrice = +(refPrice + order.trailingDelta).toFixed(2);
      }
    }

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

      if (order.type === 'TRAILING_STOP') {
        if (order.side === 'SELL') {
          // Ratchet stop price upward if market price reaches new high
          if (lastTradedPrice > order.peakPrice) {
            order.peakPrice = lastTradedPrice;
            const ratcheted = +(lastTradedPrice - order.trailingDelta).toFixed(2);
            if (ratcheted > order.stopPrice) {
              order.stopPrice = ratcheted;
            }
          }
          // Trigger when market drops to or below ratcheted stop
          if (lastTradedPrice <= order.stopPrice) {
            shouldTrigger = true;
          }
        } else if (order.side === 'BUY') {
          // Ratchet stop price downward if market price reaches new low
          if (lastTradedPrice < order.troughPrice) {
            order.troughPrice = lastTradedPrice;
            const ratcheted = +(lastTradedPrice + order.trailingDelta).toFixed(2);
            if (ratcheted < order.stopPrice) {
              order.stopPrice = ratcheted;
            }
          }
          // Trigger when market rises to or above ratcheted stop
          if (lastTradedPrice >= order.stopPrice) {
            shouldTrigger = true;
          }
        }
      } else if (order.side === 'BUY') {
        // Standard Buy stop triggers when market price rises to or above stopPrice (e.g. breakout / cover)
        if (lastTradedPrice >= order.stopPrice) {
          shouldTrigger = true;
        }
      } else if (order.side === 'SELL') {
        // Standard Sell stop triggers when market price falls to or below stopPrice (e.g. stop-loss)
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
    } else if (this.closingOrders && this.closingOrders.has(orderId)) {
      this.closingOrders.delete(orderId);
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

  /**
   * Calculate Order Book Imbalance (OBI) across the top K price levels
   * OBI = (V_bid - V_ask) / (V_bid + V_ask) bounded in [-1.0, 1.0]
   * Also computes volume-weighted microprice.
   * @param {number} [depthLevels=5] Top K levels to aggregate
   * @returns {{ symbol: string, obi: number, bidVolume: number, askVolume: number, totalVolume: number, microPrice: number|null, topLevels: number }}
   */
  getOrderBookImbalance(depthLevels = 5) {
    const k = Math.max(1, depthLevels || 5);
    const l2 = this.getDepth(k);

    let bidVol = 0;
    for (const b of l2.bids) {
      bidVol += b.quantity;
    }

    let askVol = 0;
    for (const a of l2.asks) {
      askVol += a.quantity;
    }

    const totalVol = bidVol + askVol;
    let obi = 0;
    if (totalVol > 0) {
      obi = (bidVol - askVol) / totalVol;
      obi = Math.max(-1, Math.min(1, obi));
    }

    let microPrice = null;
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    if (bestBid !== null && bestAsk !== null && totalVol > 0) {
      // Microprice: P_micro = (bestAsk * bidVol + bestBid * askVol) / totalVol
      microPrice = +( (bestAsk * bidVol + bestBid * askVol) / totalVol ).toFixed(2);
    } else if (bestBid !== null && bestAsk !== null) {
      microPrice = +(((bestBid + bestAsk) / 2).toFixed(2));
    } else if (bestBid !== null) {
      microPrice = bestBid;
    } else if (bestAsk !== null) {
      microPrice = bestAsk;
    }

    return {
      symbol: this.symbol,
      obi: +obi.toFixed(4),
      bidVolume: bidVol,
      askVolume: askVol,
      totalVolume: totalVol,
      microPrice,
      topLevels: k
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

  /**
   * Add a limit order during Pre-Market without continuous FIFO matching.
   * Orders accumulate for the Opening Auction call market.
   * @param {Object} order
   * @returns {{ success: boolean, order: Object }}
   */
  addPreMarketLimitOrder(order) {
    order.quantity = Math.max(0, Math.floor(order.quantity));
    order.originalQuantity = order.quantity;
    order.filledQuantity = 0;
    order.timestamp = order.timestamp || Date.now();
    order.status = 'OPEN';

    if (order.side === 'BUY') {
      this._insertBid(order);
    } else {
      this._insertAsk(order);
    }
    this.orders.set(order.id, order);
    return { success: true, order };
  }

  /**
   * Calculate Indicative Equilibrium Price (IEP) and Indicative Equilibrium Volume (IEV)
   * for the Opening/Closing Call Auction.
   * Finds the price level P* that maximizes executable volume with minimum imbalance.
   * @param {number} [referencePrice] Reference price for tie-breaking (e.g. previous close)
   * @returns {{ clearingPrice: number|null, clearingVolume: number, imbalance: number, imbalanceSide: 'BUY'|'SELL'|'NEUTRAL'|'NONE' }}
   */
  calculateIndicativeClearingPrice(referencePrice = null) {
    if (this.bids.length === 0 || this.asks.length === 0) {
      return {
        clearingPrice: referencePrice || null,
        clearingVolume: 0,
        imbalance: 0,
        imbalanceSide: 'NONE'
      };
    }

    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();

    // If books do not cross (best bid < best ask), no executable auction volume
    if (bestBid === null || bestAsk === null || bestBid < bestAsk) {
      return {
        clearingPrice: referencePrice || (this.getSpread().mid || null),
        clearingVolume: 0,
        imbalance: 0,
        imbalanceSide: 'NONE'
      };
    }

    // Collect all candidate prices from crossing bids and asks
    const candidatePriceSet = new Set();
    for (const b of this.bids) {
      if (b.price >= bestAsk) candidatePriceSet.add(b.price);
    }
    for (const a of this.asks) {
      if (a.price <= bestBid) candidatePriceSet.add(a.price);
    }

    if (candidatePriceSet.size === 0) {
      return {
        clearingPrice: referencePrice || null,
        clearingVolume: 0,
        imbalance: 0,
        imbalanceSide: 'NONE'
      };
    }

    const candidatePrices = Array.from(candidatePriceSet).sort((a, b) => a - b);
    let maxVolume = 0;
    const evaluations = [];

    for (const p of candidatePrices) {
      // Cumulative Buy Volume at or above price p
      let buyQty = 0;
      for (const b of this.bids) {
        if (b.price >= p) buyQty += b.quantity;
      }

      // Cumulative Sell Volume at or below price p
      let sellQty = 0;
      for (const a of this.asks) {
        if (a.price <= p) sellQty += a.quantity;
      }

      const execVolume = Math.min(buyQty, sellQty);
      const imbalance = Math.abs(buyQty - sellQty);
      const side = buyQty > sellQty ? 'BUY' : sellQty > buyQty ? 'SELL' : 'NEUTRAL';

      if (execVolume > maxVolume) {
        maxVolume = execVolume;
      }

      evaluations.push({
        price: p,
        executableVolume: execVolume,
        imbalance,
        buyQty,
        sellQty,
        imbalanceSide: side
      });
    }

    if (maxVolume === 0) {
      return {
        clearingPrice: referencePrice || null,
        clearingVolume: 0,
        imbalance: 0,
        imbalanceSide: 'NONE'
      };
    }

    // Filter candidate prices that maximize executable volume
    const topVolumeCandidates = evaluations.filter(e => e.executableVolume === maxVolume);

    // Multi-tier tie-breaking:
    // 1. Minimum imbalance
    const minImbalance = Math.min(...topVolumeCandidates.map(e => e.imbalance));
    const minImbalanceCandidates = topVolumeCandidates.filter(e => e.imbalance === minImbalance);

    // 2. Proximity to reference price (previous close or midpoint)
    const ref = referencePrice || (bestBid + bestAsk) / 2;
    minImbalanceCandidates.sort((a, b) => {
      const distA = Math.abs(a.price - ref);
      const distB = Math.abs(b.price - ref);
      if (Math.abs(distA - distB) > 0.0001) return distA - distB;
      return a.price - b.price; // Lowest price determinism
    });

    const chosen = minImbalanceCandidates[0];

    return {
      clearingPrice: +(chosen.price.toFixed(2)),
      clearingVolume: chosen.executableVolume,
      imbalance: chosen.imbalance,
      imbalanceSide: chosen.imbalanceSide
    };
  }

  /**
   * Execute the Opening Auction Uncrossing.
   * Matches all crossing bids and asks at the single uniform clearing price P*.
   * Priority: Price-time (FIFO) at each eligible limit level.
   * @param {number} [referencePrice]
   * @returns {{ trades: Array<Object>, clearingPrice: number|null, clearingVolume: number }}
   */
  executeAuctionUncrossing(referencePrice = null) {
    const indicative = this.calculateIndicativeClearingPrice(referencePrice);
    const { clearingPrice, clearingVolume } = indicative;

    if (!clearingPrice || clearingVolume <= 0) {
      return {
        trades: [],
        clearingPrice: referencePrice || this.getBestBid() || this.getBestAsk() || null,
        clearingVolume: 0
      };
    }

    const trades = [];
    let remainingVolumeToMatch = clearingVolume;

    // Cross eligible bids (price >= clearingPrice) against eligible asks (price <= clearingPrice)
    while (
      remainingVolumeToMatch > 0 &&
      this.bids.length > 0 &&
      this.asks.length > 0 &&
      this.bids[0].price >= clearingPrice &&
      this.asks[0].price <= clearingPrice
    ) {
      const topBid = this.bids[0];
      const topAsk = this.asks[0];

      // Prevent self-trading during auction if possible
      if (topBid.userId === topAsk.userId) {
        // If same user, advance to next eligible or break
        break;
      }

      const matchQty = Math.min(topBid.quantity, topAsk.quantity, remainingVolumeToMatch);
      if (matchQty <= 0) break;

      topBid.quantity -= matchQty;
      topBid.filledQuantity += matchQty;
      topAsk.quantity -= matchQty;
      topAsk.filledQuantity += matchQty;
      remainingVolumeToMatch -= matchQty;

      const trade = {
        id: `auc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        symbol: this.symbol,
        price: clearingPrice, // Single uniform clearing price for both sides!
        quantity: matchQty,
        buyerId: topBid.userId,
        buyerName: topBid.userName,
        sellerId: topAsk.userId,
        sellerName: topAsk.userName,
        takerSide: 'AUCTION',
        isAuction: true,
        makerOrderId: topAsk.id,
        takerOrderId: topBid.id,
        buyerLeverage: topBid.leverage || 1,
        sellerLeverage: topAsk.leverage || 1,
        buyerIsShort: Boolean(topBid.isShort),
        sellerIsShort: Boolean(topAsk.isShort),
        timestamp: Date.now()
      };
      trades.push(trade);

      if (topBid.quantity === 0) {
        topBid.status = 'FILLED';
        this.orders.delete(topBid.id);
        this.bids.shift();
      } else {
        topBid.status = 'PARTIALLY_FILLED';
      }

      if (topAsk.quantity === 0) {
        topAsk.status = 'FILLED';
        this.orders.delete(topAsk.id);
        this.asks.shift();
      } else {
        topAsk.status = 'PARTIALLY_FILLED';
      }
    }

    return {
      trades,
      clearingPrice,
      clearingVolume: clearingVolume - remainingVolumeToMatch
    };
  }

  /**
   * Add a Market-On-Close (MOC) or Limit-On-Close (LOC) order
   * @param {Object} order
   * @returns {Object}
   */
  addClosingOrder(order) {
    order.quantity = Math.max(0, Math.floor(order.quantity));
    order.originalQuantity = order.quantity;
    order.filledQuantity = 0;
    order.timestamp = order.timestamp || Date.now();
    order.status = 'CLOSING_RESTING';

    if (order.type === 'MOC') {
      order.price = order.side === 'BUY' ? Infinity : 0;
    }

    this.closingOrders.set(order.id, order);
    this.orders.set(order.id, order);
    return order;
  }

  /**
   * Calculate Indicative Equilibrium Price (IEP) and Indicative Equilibrium Volume (IEV)
   * for the Closing Call Auction.
   * Considers continuous resting limit orders + MOC + eligible LOC orders.
   * @param {number} [referencePrice]
   * @returns {{ clearingPrice: number|null, clearingVolume: number, imbalance: number, imbalanceSide: string }}
   */
  calculateClosingAuctionPrice(referencePrice = null) {
    const candidatePriceSet = new Set();
    if (referencePrice && referencePrice > 0) {
      candidatePriceSet.add(referencePrice);
    }

    for (const b of this.bids) {
      if (b.price > 0) candidatePriceSet.add(b.price);
    }
    for (const a of this.asks) {
      if (a.price > 0) candidatePriceSet.add(a.price);
    }
    for (const c of this.closingOrders.values()) {
      if (c.type === 'LOC' && c.price > 0) {
        candidatePriceSet.add(c.price);
      }
    }

    if (candidatePriceSet.size === 0) {
      const bestBid = this.getBestBid();
      const bestAsk = this.getBestAsk();
      const defaultRef = bestBid && bestAsk ? +((bestBid + bestAsk) / 2).toFixed(2) : (bestBid || bestAsk || null);
      return {
        clearingPrice: defaultRef,
        clearingVolume: 0,
        imbalance: 0,
        imbalanceSide: 'NONE'
      };
    }

    const candidatePrices = Array.from(candidatePriceSet).sort((a, b) => a - b);
    let maxVolume = 0;
    const evaluations = [];

    for (const p of candidatePrices) {
      let buyQty = 0;
      // 1. Resting Limit Bids >= p
      for (const b of this.bids) {
        if (b.price >= p) buyQty += b.quantity;
      }
      // 2. Closing Buy Orders (MOC buys at any price, LOC buys if price >= p)
      for (const c of this.closingOrders.values()) {
        if (c.side === 'BUY') {
          if (c.type === 'MOC' || (c.type === 'LOC' && c.price >= p)) {
            buyQty += c.quantity;
          }
        }
      }

      let sellQty = 0;
      // 1. Resting Limit Asks <= p
      for (const a of this.asks) {
        if (a.price <= p) sellQty += a.quantity;
      }
      // 2. Closing Sell Orders (MOC sells at any price, LOC sells if price <= p)
      for (const c of this.closingOrders.values()) {
        if (c.side === 'SELL') {
          if (c.type === 'MOC' || (c.type === 'LOC' && c.price <= p)) {
            sellQty += c.quantity;
          }
        }
      }

      const execVolume = Math.min(buyQty, sellQty);
      const imbalance = Math.abs(buyQty - sellQty);
      const side = buyQty > sellQty ? 'BUY' : sellQty > buyQty ? 'SELL' : 'NEUTRAL';

      if (execVolume > maxVolume) {
        maxVolume = execVolume;
      }

      evaluations.push({
        price: p,
        executableVolume: execVolume,
        imbalance,
        buyQty,
        sellQty,
        imbalanceSide: side
      });
    }

    if (maxVolume === 0) {
      return {
        clearingPrice: referencePrice || candidatePrices[0] || null,
        clearingVolume: 0,
        imbalance: 0,
        imbalanceSide: 'NONE'
      };
    }

    // Step 1: Filter candidates with maximum executable volume
    let bestCandidates = evaluations.filter(e => e.executableVolume === maxVolume);

    // Step 2: Tie-break by minimum volume imbalance
    if (bestCandidates.length > 1) {
      const minImbalance = Math.min(...bestCandidates.map(e => e.imbalance));
      bestCandidates = bestCandidates.filter(e => e.imbalance === minImbalance);
    }

    // Step 3: Tie-break by minimizing distance to reference price
    let chosen = bestCandidates[0];
    if (bestCandidates.length > 1 && referencePrice) {
      let minDistance = Infinity;
      for (const cand of bestCandidates) {
        const dist = Math.abs(cand.price - referencePrice);
        if (dist < minDistance) {
          minDistance = dist;
          chosen = cand;
        }
      }
    } else if (bestCandidates.length > 1) {
      const mid = (bestCandidates[0].price + bestCandidates[bestCandidates.length - 1].price) / 2;
      chosen = bestCandidates.reduce((prev, curr) => Math.abs(curr.price - mid) < Math.abs(prev.price - mid) ? curr : prev);
    }

    return {
      clearingPrice: chosen.price,
      clearingVolume: chosen.executableVolume,
      imbalance: chosen.imbalance,
      imbalanceSide: chosen.imbalanceSide
    };
  }

  /**
   * Execute Closing Call Auction Uncrossing
   * Matches eligible orders at uniform clearing price, expires unfilled MOC/LOC orders
   * @param {number} [referencePrice]
   * @returns {{ trades: Array, clearingPrice: number, clearingVolume: number, expiredOrders: Array }}
   */
  executeClosingAuction(referencePrice = null) {
    const clearing = this.calculateClosingAuctionPrice(referencePrice);
    const { clearingPrice, clearingVolume } = clearing;
    const trades = [];
    const expiredOrders = [];

    if (!clearingPrice || clearingVolume <= 0) {
      // No trades execute, all MOC/LOC orders expire
      for (const order of this.closingOrders.values()) {
        order.status = 'EXPIRED';
        this.orders.delete(order.id);
        expiredOrders.push(order);
      }
      this.closingOrders.clear();
      return {
        trades: [],
        clearingPrice: referencePrice || clearingPrice,
        clearingVolume: 0,
        expiredOrders
      };
    }

    // Collect eligible buyers:
    // 1. MOC Buys (highest priority, sorted by timestamp)
    // 2. Limit / LOC Buys where price >= clearingPrice (sorted by price DESC, timestamp ASC)
    const eligibleBuys = [];
    for (const c of this.closingOrders.values()) {
      if (c.side === 'BUY') {
        if (c.type === 'MOC' || (c.type === 'LOC' && c.price >= clearingPrice)) {
          eligibleBuys.push(c);
        }
      }
    }
    for (const b of this.bids) {
      if (b.price >= clearingPrice) {
        eligibleBuys.push(b);
      }
    }
    eligibleBuys.sort((a, b) => {
      const aIsMoc = a.type === 'MOC';
      const bIsMoc = b.type === 'MOC';
      if (aIsMoc && !bIsMoc) return -1;
      if (!aIsMoc && bIsMoc) return 1;
      if (b.price !== a.price) return b.price - a.price;
      return a.timestamp - b.timestamp;
    });

    // Collect eligible sellers:
    // 1. MOC Sells (highest priority, sorted by timestamp)
    // 2. Limit / LOC Sells where price <= clearingPrice (sorted by price ASC, timestamp ASC)
    const eligibleSells = [];
    for (const c of this.closingOrders.values()) {
      if (c.side === 'SELL') {
        if (c.type === 'MOC' || (c.type === 'LOC' && c.price <= clearingPrice)) {
          eligibleSells.push(c);
        }
      }
    }
    for (const a of this.asks) {
      if (a.price <= clearingPrice) {
        eligibleSells.push(a);
      }
    }
    eligibleSells.sort((a, b) => {
      const aIsMoc = a.type === 'MOC';
      const bIsMoc = b.type === 'MOC';
      if (aIsMoc && !bIsMoc) return -1;
      if (!aIsMoc && bIsMoc) return 1;
      if (a.price !== b.price) return a.price - b.price;
      return a.timestamp - b.timestamp;
    });

    let remainingVolumeToMatch = clearingVolume;
    let bIdx = 0;
    let sIdx = 0;

    while (remainingVolumeToMatch > 0 && bIdx < eligibleBuys.length && sIdx < eligibleSells.length) {
      const topBuy = eligibleBuys[bIdx];
      const topSell = eligibleSells[sIdx];

      if (topBuy.userId === topSell.userId) {
        sIdx++;
        continue;
      }

      const matchQty = Math.min(topBuy.quantity, topSell.quantity, remainingVolumeToMatch);
      if (matchQty <= 0) break;

      topBuy.quantity -= matchQty;
      topBuy.filledQuantity += matchQty;
      topSell.quantity -= matchQty;
      topSell.filledQuantity += matchQty;
      remainingVolumeToMatch -= matchQty;

      const trade = {
        id: `close_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        symbol: this.symbol,
        price: clearingPrice,
        quantity: matchQty,
        buyerId: topBuy.userId,
        buyerName: topBuy.userName,
        sellerId: topSell.userId,
        sellerName: topSell.userName,
        takerSide: 'CLOSING_AUCTION',
        isAuction: true,
        isClosingAuction: true,
        makerOrderId: topSell.id,
        takerOrderId: topBuy.id,
        buyerLeverage: topBuy.leverage || 1,
        sellerLeverage: topSell.leverage || 1,
        buyerIsShort: Boolean(topBuy.isShort),
        sellerIsShort: Boolean(topSell.isShort),
        timestamp: Date.now()
      };
      trades.push(trade);

      if (topBuy.quantity === 0) {
        topBuy.status = 'FILLED';
        this.orders.delete(topBuy.id);
        this.closingOrders.delete(topBuy.id);
        const bidIdx = this.bids.findIndex(o => o.id === topBuy.id);
        if (bidIdx !== -1) this.bids.splice(bidIdx, 1);
        bIdx++;
      } else {
        topBuy.status = 'PARTIALLY_FILLED';
      }

      if (topSell.quantity === 0) {
        topSell.status = 'FILLED';
        this.orders.delete(topSell.id);
        this.closingOrders.delete(topSell.id);
        const askIdx = this.asks.findIndex(o => o.id === topSell.id);
        if (askIdx !== -1) this.asks.splice(askIdx, 1);
        sIdx++;
      } else {
        topSell.status = 'PARTIALLY_FILLED';
      }
    }

    // Expire any remaining unexecuted / partially executed MOC and LOC orders
    for (const [orderId, order] of this.closingOrders.entries()) {
      if (order.quantity > 0) {
        order.status = 'EXPIRED';
        expiredOrders.push(order);
      }
      this.orders.delete(orderId);
    }
    this.closingOrders.clear();

    return {
      trades,
      clearingPrice,
      clearingVolume: clearingVolume - remainingVolumeToMatch,
      expiredOrders
    };
  }
}


