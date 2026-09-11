import { BaseTrader } from './base.js';

/**
 * Market Maker Trader
 * Quotes symmetric bids and asks around the mid price, creating liquidity
 * and tightening the bid-ask spread.
 */
export class MarketMaker extends BaseTrader {
  constructor(id, name, matchingEngine, marketManager, accountManager, clock, options = {}) {
    super(id, name, 'MARKET_MAKER', matchingEngine, marketManager, accountManager, clock, {
      minDelayMs: 1000,
      maxDelayMs: 2500,
      initialCredits: 2000000,
      initialShares: 5000,
      ...options
    });
    this.spreadTarget = options.spreadTarget || 0.008; // 0.8% spread
    this.volatilitySpreads = new Map(); // symbol -> multiplier
    this.regimeMultiplier = 1.0;
  }

  setRegimeMultiplier(multiplier) {
    this.regimeMultiplier = multiplier || 1.0;
    for (const comp of this.marketManager.getAllCompanies()) {
      this.cancelAllMyOrders(comp.symbol);
    }
  }

  reactToNews(newsItem) {
    if (!newsItem || !newsItem.symbols) return;
    for (const sym of newsItem.symbols) {
      // Widen spread by 2.2x to protect against volatility
      this.volatilitySpreads.set(sym, 2.2);
      this.cancelAllMyOrders(sym);

      // Revert after 15 seconds
      setTimeout(() => {
        const cur = this.volatilitySpreads.get(sym);
        if (cur && cur > 1.0) {
          this.volatilitySpreads.set(sym, Math.max(1.0, cur - 0.6));
        }
      }, 15000);
    }
  }

  /**
   * Estimates fair value without perfect knowledge of the hidden intrinsic value.
   * Real market makers do not observe true intrinsic value; they infer value from order book
   * microprice and noisy fundamental consensus.
   * @param {string} symbol
   * @param {Object} target
   * @returns {number}
   */
  estimateFairValue(symbol, target) {
    if (!target) return 100;
    const book = this.matchingEngine ? this.matchingEngine.getOrderBook(symbol) : null;
    const bestBid = book && book.bids && book.bids[0] ? book.bids[0].price : null;
    const bestAsk = book && book.asks && book.asks[0] ? book.asks[0].price : null;
    const bidQty = book && book.bids && book.bids[0] ? book.bids[0].quantity : 0;
    const askQty = book && book.asks && book.asks[0] ? book.asks[0].quantity : 0;

    let microprice = target.price;
    if (bestBid && bestAsk && (bidQty + askQty) > 0) {
      microprice = (bestAsk * bidQty + bestBid * askQty) / (bidQty + askQty);
    }

    // Noisy fundamental estimation: MMs have imperfect consensus rather than oracle access
    const noise = (Math.random() - 0.5) * 0.008; // +/- 0.4% estimation dispersion
    const noisyFundamental = (typeof target.intrinsicValue === 'number' && target.intrinsicValue > 0)
      ? target.intrinsicValue * (1 + noise)
      : target.price;

    // Anchor: 40% to order book microprice / last traded price, 60% to noisy fundamental consensus
    const marketAnchor = (bestBid && bestAsk) ? microprice : target.price;
    return +(marketAnchor * 0.40 + noisyFundamental * 0.60).toFixed(2);
  }

  /**
   * Calculate reservation price and asymmetric quote spreads based on Order Book Imbalance (OBI)
   * and inventory risk (Avellaneda-Stoikov model).
   * @param {string} symbol
   * @returns {Object}
   */
  calculateReservationAndSpreads(symbol) {
    const target = this.marketManager.getCompany(symbol);
    const fairPrice = this.estimateFairValue(symbol, target);

    // Query Order Book Imbalance across top 5 depth levels
    const obiData = this.matchingEngine.getOrderBookImbalance(symbol, 5);
    const obi = (obiData && typeof obiData.obi === 'number') ? obiData.obi : 0;

    // Inventory rebalancing skew (target inventory: 5,000 shares)
    const user = this.accountManager.getUser(this.id);
    const holding = user?.holdings.get(symbol);
    const shares = holding ? holding.quantity : 5000;
    const invDeviation = (shares - 5000) / 1000;
    const inventorySkew = -invDeviation * fairPrice * 0.002;

    // OBI Adverse Selection skew (shifts reservation price towards order flow pressure)
    const obiSkew = obi * fairPrice * 0.0035;

    // Reservation price (fair value adjusted for inventory risk & flow imbalance)
    const reservationPrice = +(fairPrice + inventorySkew + obiSkew).toFixed(2);

    const spreadMult = this.volatilitySpreads.get(symbol) || 1.0;
    const effectiveSpread = this.spreadTarget * spreadMult * (this.regimeMultiplier || 1.0);
    const halfSpread = (fairPrice * effectiveSpread) / 2;

    // Asymmetric Quote Spreads & Sizing to protect against Adverse Selection:
    let bidSpreadMultiplier = 1.0;
    let askSpreadMultiplier = 1.0;
    let bidQtyMultiplier = 1.0;
    let askQtyMultiplier = 1.0;

    if (obi > 0.20) {
      // Strong buying pressure: widen asks to protect against informed buying, tighten bids
      askSpreadMultiplier = 1.0 + Math.min(1.5, obi * 1.2);
      bidSpreadMultiplier = Math.max(0.4, 1.0 - obi * 0.6);
      askQtyMultiplier = Math.max(0.3, +(1.0 - obi * 0.7).toFixed(2));
      bidQtyMultiplier = +(1.0 + obi * 0.5).toFixed(2);
    } else if (obi < -0.20) {
      // Strong selling pressure: widen bids to protect against informed dumping, tighten asks
      const absObi = Math.abs(obi);
      bidSpreadMultiplier = 1.0 + Math.min(1.5, absObi * 1.2);
      askSpreadMultiplier = Math.max(0.4, 1.0 - absObi * 0.6);
      bidQtyMultiplier = Math.max(0.3, +(1.0 - absObi * 0.7).toFixed(2));
      askQtyMultiplier = +(1.0 + absObi * 0.5).toFixed(2);
    }

    return {
      symbol,
      fairPrice,
      reservationPrice,
      obi,
      shares,
      inventorySkew: +inventorySkew.toFixed(3),
      obiSkew: +obiSkew.toFixed(3),
      halfSpread,
      bidSpreadMultiplier: +bidSpreadMultiplier.toFixed(3),
      askSpreadMultiplier: +askSpreadMultiplier.toFixed(3),
      bidQtyMultiplier,
      askQtyMultiplier
    };
  }

  act() {
    const companies = this.marketManager.getAllCompanies();
    // Pick one or two companies each turn to refresh quotes
    const target = companies[Math.floor(Math.random() * companies.length)];
    if (!target) return;

    const symbol = target.symbol;

    // First cancel old quotes for this symbol to refresh ladder
    this.cancelAllMyOrders(symbol);

    const params = this.calculateReservationAndSpreads(symbol);
    const levels = [1, 2, 3];

    for (const lvl of levels) {
      const levelMultiplier = lvl * 0.7;
      const bidPrice = +(params.reservationPrice - params.halfSpread * levelMultiplier * params.bidSpreadMultiplier).toFixed(2);
      const askPrice = +(params.reservationPrice + params.halfSpread * levelMultiplier * params.askSpreadMultiplier).toFixed(2);

      const baseQty = Math.floor(Math.random() * 25 + 10 * lvl);
      const bidQty = Math.max(5, Math.round(baseQty * params.bidQtyMultiplier));
      const askQty = Math.max(5, Math.round(baseQty * params.askQtyMultiplier));

      // Place Limit Buy
      if (bidPrice > 0 && bidQty > 0) {
        this.submitOrder({
          symbol,
          side: 'BUY',
          type: 'LIMIT',
          price: bidPrice,
          quantity: bidQty
        });
      }

      // Place Limit Sell
      if (askPrice > 0 && askQty > 0) {
        this.submitOrder({
          symbol,
          side: 'SELL',
          type: 'LIMIT',
          price: askPrice,
          quantity: askQty
        });
      }
    }
  }
}

