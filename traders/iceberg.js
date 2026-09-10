import { BaseTrader } from './base.js';

/**
 * Iceberg Order Institutional Execution Bot
 * Slices large parent block orders into small visible child tranches to conceal
 * institutional footprint and reduce market slippage impact.
 */
export class IcebergWhaleTrader extends BaseTrader {
  constructor(id, name, matchingEngine, marketManager, accountManager, clock, options = {}) {
    super(id, name, 'ICEBERG_WHALE', matchingEngine, marketManager, accountManager, clock, {
      minDelayMs: 1500,
      maxDelayMs: 3500,
      initialCredits: 3000000,
      initialShares: 8000,
      ...options
    });

    // Active Iceberg Parent Orders: symbol -> IcebergState
    this.activeIcebergs = new Map();
    this.totalFilledShares = 0;

    // Listen to engine trades to catch slice fills
    this.matchingEngine.on('trade', (trade) => {
      this._handleTradeFill(trade);
    });
  }

  /**
   * Initiate a new sliced institutional block order
   */
  startIcebergOrder({ symbol, side, totalQuantity, sliceQuantity, limitPrice = null }) {
    const parentId = `ice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const iceberg = {
      id: parentId,
      symbol,
      side,
      totalQuantity,
      sliceQuantity: Math.min(sliceQuantity, totalQuantity),
      remainingTotalQty: totalQuantity,
      currentSliceOrderId: null,
      currentSliceQty: 0,
      filledTotalQty: 0,
      limitPrice,
      status: 'ACTIVE',
      createdAt: Date.now()
    };

    this.activeIcebergs.set(symbol, iceberg);
    this._submitNextSlice(iceberg);
    return iceberg;
  }

  _submitNextSlice(iceberg) {
    if (iceberg.remainingTotalQty <= 0) {
      iceberg.status = 'COMPLETED';
      return;
    }

    const prices = this.marketManager.getCurrentPrices();
    const currentPrice = prices[iceberg.symbol] || 100;
    const sliceQty = Math.min(iceberg.sliceQuantity, iceberg.remainingTotalQty);

    // Price placement: passive at best bid/ask or limitPrice
    let targetPrice = iceberg.limitPrice;
    if (!targetPrice) {
      targetPrice = iceberg.side === 'BUY'
        ? +(currentPrice * 0.999).toFixed(2)
        : +(currentPrice * 1.001).toFixed(2);
    }

    const res = this.submitOrder({
      symbol: iceberg.symbol,
      side: iceberg.side,
      type: 'LIMIT',
      price: targetPrice,
      quantity: sliceQty
    });

    if (res.success && res.remainingOrder) {
      iceberg.currentSliceOrderId = res.remainingOrder.id;
      iceberg.currentSliceQty = sliceQty;
    } else if (res.success && res.executedQuantity > 0) {
      // Immediate fill
      iceberg.remainingTotalQty -= res.executedQuantity;
      iceberg.filledTotalQty += res.executedQuantity;
      this.totalFilledShares += res.executedQuantity;

      if (iceberg.remainingTotalQty > 0) {
        // Queue next slice
        setTimeout(() => this._submitNextSlice(iceberg), 300);
      } else {
        iceberg.status = 'COMPLETED';
      }
    }
  }

  _handleTradeFill(trade) {
    const iceberg = this.activeIcebergs.get(trade.symbol);
    if (!iceberg || iceberg.status !== 'ACTIVE') return;

    const isMyTrade = trade.buyerId === this.id || trade.sellerId === this.id;
    if (!isMyTrade) return;

    iceberg.remainingTotalQty -= trade.quantity;
    iceberg.filledTotalQty += trade.quantity;
    this.totalFilledShares += trade.quantity;

    // Check if current tranche slice is depleted
    const depth = this.matchingEngine.getOrderBook(trade.symbol);
    const orderExists = depth ? this._orderExistsInBook(depth, iceberg.currentSliceOrderId) : false;

    if (!orderExists && iceberg.remainingTotalQty > 0) {
      // Replenish next visible tranche slice
      setTimeout(() => {
        if (iceberg.status === 'ACTIVE') {
          this._submitNextSlice(iceberg);
        }
      }, 500);
    } else if (iceberg.remainingTotalQty <= 0) {
      iceberg.status = 'COMPLETED';
    }
  }

  _orderExistsInBook(book, orderId) {
    if (!orderId) return false;
    return book.bids.some(o => o.id === orderId) || book.asks.some(o => o.id === orderId);
  }

  act() {
    // Automatically manage institutional accumulation cycles
    const companies = this.marketManager.getAllCompanies();
    for (const comp of companies) {
      const active = this.activeIcebergs.get(comp.symbol);
      if (!active || active.status === 'COMPLETED') {
        // 20% chance to start a new institutional block order on this asset
        if (Math.random() < 0.25) {
          const side = Math.random() > 0.5 ? 'BUY' : 'SELL';
          const totalQty = Math.floor(Math.random() * 1500 + 800); // 800 - 2,300 total shares
          const sliceQty = Math.floor(Math.random() * 80 + 40);    // 40 - 120 visible slice
          this.startIcebergOrder({
            symbol: comp.symbol,
            side,
            totalQuantity: totalQty,
            sliceQuantity: sliceQty
          });
        }
      }
    }
  }
}
