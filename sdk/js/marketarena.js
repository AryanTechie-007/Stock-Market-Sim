import crypto from 'crypto';

/**
 * MarketArena JavaScript/Node.js Client SDK
 * Programmatic trading and market data interface for external bots.
 */
export class MarketArenaClient {
  /**
   * @param {Object} options
   * @param {string} [options.baseUrl='http://localhost:3000']
   * @param {string} [options.apiKey]
   * @param {string} [options.apiSecret]
   */
  constructor({ baseUrl = 'http://localhost:3000', apiKey = null, apiSecret = null } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  /**
   * Internal authenticated request dispatcher
   */
  async _request(method, endpoint, body = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Accept': 'application/json'
    };

    const methodUpper = method.toUpperCase();
    let bodyStr = '';

    if (body !== null && methodUpper !== 'GET') {
      bodyStr = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }

    if (this.apiKey && this.apiSecret) {
      const timestamp = Date.now().toString();
      const payload = `${timestamp}${methodUpper}${endpoint}${bodyStr}`;
      const signature = crypto.createHmac('sha256', this.apiSecret).update(payload).digest('hex');

      headers['X-API-KEY'] = this.apiKey;
      headers['X-API-TIMESTAMP'] = timestamp;
      headers['X-API-SIGNATURE'] = signature;
    } else if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }

    const res = await fetch(url, {
      method: methodUpper,
      headers,
      body: bodyStr || undefined
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || data.error || `HTTP ${res.status}: ${res.statusText}`);
      err.status = res.status;
      err.response = data;
      throw err;
    }

    return data;
  }

  // --- Public Market Data ---

  /**
   * Server ping & health check
   */
  async ping() {
    return this._request('GET', '/api/v1/ping');
  }

  /**
   * Get active macroeconomic market regime
   */
  async getRegime() {
    return this._request('GET', '/api/v1/regime');
  }

  /**
   * Get L2 order book depth for a symbol
   * @param {string} symbol (e.g. 'BYTE')
   * @param {number} [depth=10]
   */
  async getOrderbook(symbol, depth = 10) {
    return this._request('GET', `/api/v1/orderbook/${symbol}?depth=${depth}`);
  }

  /**
   * Get historical OHLCV candlestick bars
   * @param {string} symbol (e.g. 'BYTE')
   * @param {string} [timeframe='5s'] '1s'|'5s'|'15s'|'1m'|'5m'
   * @param {number} [limit=50]
   */
  async getCandles(symbol, timeframe = '5s', limit = 50) {
    return this._request('GET', `/api/v1/candles/${symbol}?timeframe=${timeframe}&limit=${limit}`);
  }

  // --- Authenticated Account & Trading Endpoints ---

  /**
   * Get authenticated user account details, portfolio valuation, and risk metrics
   */
  async getAccount() {
    return this._request('GET', '/api/v1/account');
  }

  /**
   * Get authenticated user active resting orders
   */
  async getOpenOrders() {
    return this._request('GET', '/api/v1/orders');
  }

  /**
   * Submit an order to the matching engine
   * @param {Object} order
   * @param {string} order.symbol
   * @param {'BUY'|'SELL'} order.side
   * @param {'LIMIT'|'MARKET'|'STOP_LOSS'|'STOP_LIMIT'|'TRAILING_STOP'} [order.type='LIMIT']
   * @param {number} order.quantity
   * @param {number} [order.price] Required for LIMIT/STOP_LIMIT
   * @param {number} [order.stopPrice] Required for STOP_LOSS/STOP_LIMIT
   * @param {number} [order.trailingDelta] Required for TRAILING_STOP
   * @param {number} [order.leverage=1] Margin leverage (1, 2, or 5)
   * @param {boolean} [order.isShort=false] Short sell execution
   */
  async placeOrder(order) {
    return this._request('POST', '/api/v1/orders', order);
  }

  /**
   * Cancel a resting order
   * @param {string} symbol
   * @param {string} orderId
   */
  async cancelOrder(symbol, orderId) {
    return this._request('DELETE', `/api/v1/orders/${orderId}?symbol=${symbol}`);
  }

  /**
   * Generate an API key pair for a user
   * @param {string} userId
   * @param {string} [name='Bot Key']
   * @param {Array<string>} [permissions=['read', 'trade']]
   */
  async createApiKey(userId, name = 'Bot Key', permissions = ['read', 'trade']) {
    return this._request('POST', '/api/v1/keys', { userId, name, permissions });
  }

  /**
   * List API keys for a user
   * @param {string} userId
   */
  async getUserApiKeys(userId) {
    return this._request('GET', `/api/v1/keys?userId=${userId}`);
  }
}
