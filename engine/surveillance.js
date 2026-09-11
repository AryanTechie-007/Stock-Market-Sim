import { EventEmitter } from 'events';

/**
 * Market Surveillance & Spoofing Detection Engine
 * Continuously monitors order book dynamics, order submissions, cancellations,
 * and trade executions to detect predatory trading practices such as spoofing,
 * layering, quote stuffing, and abusive cancel-to-fill ratios.
 */
export class MarketSurveillance extends EventEmitter {
  /**
   * @param {Object} matchingEngine Reference to MatchingEngine
   * @param {Object} accountManager Reference to AccountManager
   * @param {Object} [options]
   */
  constructor(matchingEngine, accountManager, options = {}) {
    super();
    this.matchingEngine = matchingEngine;
    this.accountManager = accountManager;

    this.options = {
      cfrThreshold: options.cfrThreshold || 6.0, // Alert if cancel-to-fill ratio >= 6.0
      minCancelsForAlert: options.minCancelsForAlert || 3, // Minimum cancellations required before CFR alert
      phantomSizeThreshold: options.phantomSizeThreshold || 400, // Order size classified as large phantom order
      phantomLifespanMs: options.phantomLifespanMs || 600, // Max ms between submission and cancel to be "phantom"
      autoSanction: options.autoSanction !== undefined ? options.autoSanction : true,
      fineAmount: options.fineAmount || 250, // Regulatory fine credits
      throttleDurationSec: options.throttleDurationSec || 15,
      ...options
    };

    // User metrics: userId -> { ordersSubmitted, ordersCancelled, tradesFilled, cancelledVolume, filledVolume, phantomCancels, activeOrders: Map }
    this.userMetrics = new Map();
    // Alerts history: Array<Alert>
    this.alerts = [];
    // Active throttling: userId -> expiresAtTimestamp
    this.throttledUsers = new Map();
    // Sanctions history: userId -> Array<Sanction>
    this.sanctions = new Map();

    if (this.matchingEngine) {
      this._bindEngineEvents();
    }
  }

  _bindEngineEvents() {
    this.matchingEngine.on('orderSubmitted', (order) => {
      this.onOrderSubmitted(order);
    });

    this.matchingEngine.on('orderCancelled', (order) => {
      this.onOrderCancelled(order);
    });

    this.matchingEngine.on('trade', (trade) => {
      this.onTrade(trade);
    });
  }

  _getOrCreateMetrics(userId, userName = '') {
    if (!this.userMetrics.has(userId)) {
      this.userMetrics.set(userId, {
        userId,
        userName: userName || userId,
        ordersSubmitted: 0,
        ordersCancelled: 0,
        tradesFilled: 0,
        cancelledVolume: 0,
        filledVolume: 0,
        phantomCancels: 0,
        recentSubmissions: new Map(), // orderId -> { symbol, side, price, quantity, timestamp }
        recentFills: [] // Array<{ side, timestamp, quantity }>
      });
    }
    const metrics = this.userMetrics.get(userId);
    if (userName && !metrics.userName) metrics.userName = userName;
    return metrics;
  }

  /**
   * Evaluates order submission event
   * @param {Object} order
   */
  onOrderSubmitted(order) {
    if (!order || !order.userId) return;
    const metrics = this._getOrCreateMetrics(order.userId, order.userName);
    metrics.ordersSubmitted++;

    metrics.recentSubmissions.set(order.id, {
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      price: order.price,
      quantity: order.quantity,
      timestamp: Date.now()
    });
  }

  /**
   * Evaluates order cancellation event
   * @param {Object} order
   */
  onOrderCancelled(order) {
    if (!order || !order.userId) return;
    const metrics = this._getOrCreateMetrics(order.userId, order.userName);
    metrics.ordersCancelled++;
    metrics.cancelledVolume += (order.quantity || 0);

    const submission = metrics.recentSubmissions.get(order.id);
    const now = Date.now();
    let isPhantom = false;
    let lifespanMs = 0;

    if (submission) {
      lifespanMs = now - submission.timestamp;
      metrics.recentSubmissions.delete(order.id);

      // Check for phantom order (large size cancelled quickly without execution)
      if (order.quantity >= this.options.phantomSizeThreshold && lifespanMs <= this.options.phantomLifespanMs) {
        isPhantom = true;
        metrics.phantomCancels++;
      }
    }

    // Evaluate surveillance alert triggers
    const cfr = metrics.tradesFilled === 0
      ? metrics.ordersCancelled
      : +(metrics.ordersCancelled / metrics.tradesFilled).toFixed(2);

    // Condition A: High Cancel-to-Fill Ratio
    if (metrics.ordersCancelled >= this.options.minCancelsForAlert && cfr >= this.options.cfrThreshold) {
      this.raiseAlert({
        userId: order.userId,
        userName: metrics.userName,
        symbol: order.symbol,
        type: 'HIGH_CANCEL_TO_FILL_RATIO',
        severity: cfr >= 15.0 ? 'CRITICAL' : 'HIGH',
        details: {
          cancelToFillRatio: cfr,
          ordersCancelled: metrics.ordersCancelled,
          tradesFilled: metrics.tradesFilled,
          cancelledVolume: metrics.cancelledVolume
        }
      });
    }

    // Condition B: Spoofing / Layering (Phantom orders combined with opposite side trades or intent)
    if (isPhantom) {
      this.raiseAlert({
        userId: order.userId,
        userName: metrics.userName,
        symbol: order.symbol,
        type: 'SPOOFING_PHANTOM_ORDER_ABUSE',
        severity: 'CRITICAL',
        details: {
          orderId: order.id,
          side: order.side,
          quantity: order.quantity,
          lifespanMs,
          phantomCancelsCount: metrics.phantomCancels
        }
      });
    }
  }

  /**
   * Evaluates trade execution event
   * @param {Object} trade
   */
  onTrade(trade) {
    if (!trade) return;
    if (trade.buyerId) {
      const buyerMetrics = this._getOrCreateMetrics(trade.buyerId, trade.buyerName);
      buyerMetrics.tradesFilled++;
      buyerMetrics.filledVolume += trade.quantity;
      buyerMetrics.recentFills.push({ side: 'BUY', timestamp: Date.now(), quantity: trade.quantity });
    }
    if (trade.sellerId) {
      const sellerMetrics = this._getOrCreateMetrics(trade.sellerId, trade.sellerName);
      sellerMetrics.tradesFilled++;
      sellerMetrics.filledVolume += trade.quantity;
      sellerMetrics.recentFills.push({ side: 'SELL', timestamp: Date.now(), quantity: trade.quantity });
    }
  }

  /**
   * Dispatches a surveillance alert, logs it, and applies disciplinary enforcement
   * @param {Object} alertParams
   * @returns {Object} alert object
   */
  raiseAlert(alertParams) {
    const alertId = `surv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const alert = {
      id: alertId,
      timestamp: Date.now(),
      status: 'FLAGGED',
      ...alertParams
    };

    this.alerts.push(alert);
    if (this.alerts.length > 500) {
      this.alerts.shift();
    }

    // Disciplinary Sanctions
    if (this.options.autoSanction) {
      this._applySanction(alert);
    }

    this.emit('surveillance:alert', alert);
    return alert;
  }

  _applySanction(alert) {
    const userId = alert.userId;
    const sanctions = this.sanctions.get(userId) || [];

    // 1. Throttle order submission for duration
    const throttleExpiry = Date.now() + (this.options.throttleDurationSec * 1000);
    this.throttledUsers.set(userId, throttleExpiry);

    // 2. Assess regulatory fine if AccountManager is available
    let fineAssessed = 0;
    if (this.accountManager && typeof this.accountManager.getUser === 'function') {
      const user = this.accountManager.getUser(userId);
      if (user && user.credits !== undefined) {
        fineAssessed = this.options.fineAmount;
        user.credits = +(Math.max(0, user.credits - fineAssessed)).toFixed(2);
        user.totalRegulatoryFinesPaid = +((user.totalRegulatoryFinesPaid || 0) + fineAssessed).toFixed(2);
      }
    }

    const sanctionRecord = {
      alertId: alert.id,
      timestamp: Date.now(),
      action: 'THROTTLE_AND_FINE',
      fineAssessed,
      throttleDurationSec: this.options.throttleDurationSec,
      throttleExpiry
    };

    sanctions.push(sanctionRecord);
    this.sanctions.set(userId, sanctions);
    alert.sanction = sanctionRecord;
  }

  /**
   * Checks whether a user account is currently throttled from placing orders
   * @param {string} userId
   * @returns {boolean}
   */
  isThrottled(userId) {
    if (!this.throttledUsers.has(userId)) return false;
    const expiry = this.throttledUsers.get(userId);
    if (Date.now() < expiry) {
      return true;
    } else {
      this.throttledUsers.delete(userId);
      return false;
    }
  }

  /**
   * Query metrics for an account
   * @param {string} userId
   * @returns {Object|null}
   */
  getUserMetrics(userId) {
    const m = this.userMetrics.get(userId);
    if (!m) return null;
    const cfr = m.tradesFilled === 0
      ? m.ordersCancelled
      : +(m.ordersCancelled / m.tradesFilled).toFixed(2);

    return {
      userId: m.userId,
      userName: m.userName,
      ordersSubmitted: m.ordersSubmitted,
      ordersCancelled: m.ordersCancelled,
      tradesFilled: m.tradesFilled,
      cancelledVolume: m.cancelledVolume,
      filledVolume: m.filledVolume,
      phantomCancels: m.phantomCancels,
      cancelToFillRatio: cfr,
      isThrottled: this.isThrottled(userId)
    };
  }

  /**
   * Query all alerts matching optional filter
   * @param {Object} [filter]
   * @returns {Array<Object>}
   */
  getAlerts(filter = {}) {
    return this.alerts.filter(a => {
      if (filter.userId && a.userId !== filter.userId) return false;
      if (filter.symbol && a.symbol !== filter.symbol) return false;
      if (filter.severity && a.severity !== filter.severity) return false;
      return true;
    });
  }

  /**
   * Query surveillance executive summary
   * @returns {Object}
   */
  getSummary() {
    let totalFines = 0;
    for (const sanctions of this.sanctions.values()) {
      for (const s of sanctions) {
        totalFines += (s.fineAssessed || 0);
      }
    }

    return {
      totalAlerts: this.alerts.length,
      monitoredUsers: this.userMetrics.size,
      flaggedUsers: this.sanctions.size,
      totalFinesLevied: +totalFines.toFixed(2),
      activeThrottledUsers: Array.from(this.throttledUsers.keys()).filter(id => this.isThrottled(id)).length
    };
  }
}
