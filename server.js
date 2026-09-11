import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

import { MarketClock } from './engine/clock.js';
import { AccountManager } from './engine/accounts.js';
import { MatchingEngine } from './engine/matching.js';
import { MarketManager, INITIAL_COMPANIES } from './engine/market.js';
import { NPCManager } from './traders/manager.js';
import { SQLiteStorageManager } from './engine/sqlite-storage.js';
import { TournamentManager } from './engine/tournament.js';
import { MarketRegimeEngine } from './engine/regimes.js';
import { APIKeyManager } from './engine/api-keys.js';
import { TokenBucketRateLimiter } from './engine/rate-limiter.js';
import { AuthManager } from './engine/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Initialize Core Subsystems with SQLite Persistence
const storageManager = new SQLiteStorageManager();
const clock = new MarketClock({
  openDurationSec: 180,    // 3 mins open trading
  postMarketDurationSec: 25, // 25s post-market recap
  preMarketDurationSec: 20   // 20s pre-market
});
const accountManager = new AccountManager(100000, storageManager); // 100,000 Credits
const symbols = INITIAL_COMPANIES.map(c => c.symbol);
const matchingEngine = new MatchingEngine(symbols, accountManager, clock);
const marketManager = new MarketManager(clock, matchingEngine);
const regimeEngine = new MarketRegimeEngine(clock);
const npcManager = new NPCManager(matchingEngine, marketManager, accountManager, clock, regimeEngine);
const tournamentManager = new TournamentManager(accountManager, clock, 180, 50000, () => marketManager.getCurrentPrices());
const apiKeyManager = new APIKeyManager(storageManager);
const rateLimiter = new TokenBucketRateLimiter({ capacity: 100, refillRate: 20 });
const authManager = new AuthManager(storageManager);

// Wire regime events
regimeEngine.on('regimeChange', (regime) => {
  marketManager.setRegimeMultiplier(regime.volatilityMultiplier);
  io.emit('regime:change', regime);
});
regimeEngine.on('tick', (data) => {
  io.emit('regime:tick', data);
});

// Wire tournament events
matchingEngine.on('trade', (trade) => {
  tournamentManager.recordTournamentTrade(trade);
});
tournamentManager.on('tick', (data) => {
  io.emit('tournament:tick', tournamentManager.getState(marketManager.getCurrentPrices()));
});
tournamentManager.on('stateChange', (state) => {
  io.emit('tournament:state', state);
});
tournamentManager.on('tournamentConcluded', (podium) => {
  io.emit('tournament:concluded', podium);
});

// Wire opening auction events
matchingEngine.on('auction:indicative', (data) => {
  io.emit('auction:indicative', data);
});
matchingEngine.on('auction:cleared', (report) => {
  io.emit('auction:cleared', report);
});

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Basic health / stats API
app.get('/api/state', (req, res) => {
  res.json({
    clock: clock.getState(),
    regime: regimeEngine.getRegime(),
    companies: marketManager.getAllCompanies(),
    leaderboard: accountManager.getLeaderboard(marketManager.getCurrentPrices(), 10)
  });
});

// ==========================================
// PROGRAMMATIC BOT REST API (v0.8)
// ==========================================

// Rate limiting middleware for all /api/v1 endpoints
app.use('/api/v1', rateLimiter.middleware());

// --- Public Market Data & Diagnostics ---
app.get('/api/v1/ping', (req, res) => {
  res.json({
    status: 'ok',
    serverTime: Date.now(),
    clock: clock.getState()
  });
});

app.get('/api/v1/regime', (req, res) => {
  res.json(regimeEngine.getRegime());
});

// --- Opening Auction & Simulation World Data ---
app.get('/api/v1/auction/:symbol', (req, res) => {
  const symbol = (req.params.symbol || '').toUpperCase();
  const comp = marketManager.getCompany(symbol);
  const data = matchingEngine.getIndicativeOpening(symbol, comp?.previousClose);
  if (!data) return res.status(404).json({ error: 'Symbol not found' });
  res.json(data);
});

app.get('/api/v1/auction', (req, res) => {
  const prices = marketManager.getCurrentPrices();
  res.json(matchingEngine.getAllIndicativeOpenings(prices));
});

app.get('/api/v1/world/state', (req, res) => {
  res.json(marketManager.simulationNews ? marketManager.simulationNews.getWorldState() : { status: 'idle' });
});

app.get('/api/v1/market/correlation', (req, res) => {
  res.json(marketManager.getCorrelationMatrix());
});

app.get('/api/v1/orderbook/:symbol', (req, res) => {
  const symbol = (req.params.symbol || '').toUpperCase();
  const depth = parseInt(req.query.depth) || 10;
  const book = matchingEngine.getOrderBook(symbol);
  if (!book) {
    return res.status(404).json({ error: 'Symbol not found' });
  }

  const bids = book.bids.slice(0, depth).map(o => ({
    price: o.price,
    quantity: o.quantity,
    total: Number((o.price * o.quantity).toFixed(2))
  }));
  const asks = book.asks.slice(0, depth).map(o => ({
    price: o.price,
    quantity: o.quantity,
    total: Number((o.price * o.quantity).toFixed(2))
  }));

  const bestBid = bids[0]?.price || null;
  const bestAsk = asks[0]?.price || null;
  const spread = bestBid && bestAsk ? Number((bestAsk - bestBid).toFixed(2)) : null;

  res.json({
    symbol,
    lastPrice: book.lastPrice,
    spread,
    bids,
    asks,
    timestamp: Date.now()
  });
});

app.get('/api/v1/candles/:symbol', (req, res) => {
  const symbol = (req.params.symbol || '').toUpperCase();
  const timeframe = req.query.timeframe || '5s';
  const limit = Math.min(200, parseInt(req.query.limit) || 50);

  const candles = marketManager.getCandles(symbol, timeframe);
  if (!candles) {
    return res.status(404).json({ error: 'Symbol or timeframe not found' });
  }

  const sliced = candles.slice(-limit);
  res.json({
    symbol,
    timeframe,
    count: sliced.length,
    candles: sliced
  });
});

// --- User Authentication & Session Endpoints ---
app.post('/api/v1/auth/register', (req, res) => {
  const { username, email, password } = req.body || {};
  const result = authManager.register(username, email, password);
  if (!result.success) {
    return res.status(400).json(result);
  }
  // Provision default trading account bankroll in accountManager
  accountManager.getOrCreateUser(result.user.id, result.user.username, false);
  res.status(201).json(result);
});

app.post('/api/v1/auth/login', (req, res) => {
  const { identifier, password } = req.body || {};
  const result = authManager.login(identifier, password);
  if (!result.success) {
    return res.status(401).json(result);
  }
  res.json(result);
});

app.get('/api/v1/auth/me', authManager.requireSession(), (req, res) => {
  const creds = storageManager.getUserCredentialById(req.userId);
  const user = accountManager.getUser(req.userId);
  res.json({
    user: {
      id: req.userId,
      username: creds ? creds.username : (user ? user.name : 'Unknown'),
      email: creds ? creds.email : null
    },
    csrfToken: req.csrfToken,
    session: {
      token: req.sessionToken
    }
  });
});

app.post('/api/v1/auth/logout', authManager.requireSession(), (req, res) => {
  const revoked = authManager.revokeSession(req.sessionToken);
  res.json({ success: revoked });
});

app.post('/api/v1/auth/logout-all', authManager.requireSession(), (req, res) => {
  const count = authManager.revokeAllUserSessions(req.userId);
  res.json({ success: true, revokedCount: count });
});

// --- API Key Management ---
app.post('/api/v1/keys', (req, res) => {
  const { userId, name, permissions } = req.body || {};
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }
  accountManager.getOrCreateUser(userId, name || `Trader_${userId.slice(-4)}`, false);
  const key = apiKeyManager.createKey(userId, name || 'Bot Key', permissions || ['read', 'trade']);
  res.status(201).json({
    success: true,
    key
  });
});

app.get('/api/v1/keys', (req, res) => {
  const userId = req.query.userId || req.headers['x-user-id'];
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }
  const keys = apiKeyManager.getUserKeys(userId);
  res.json({
    success: true,
    keys
  });
});

app.delete('/api/v1/keys/:keyId', (req, res) => {
  const keyId = req.params.keyId;
  const userId = req.query.userId || req.body?.userId || null;
  const revoked = apiKeyManager.revokeKey(keyId, userId);
  if (!revoked) {
    return res.status(404).json({ error: 'API key not found or unauthorized' });
  }
  res.json({ success: true, message: 'API key revoked successfully' });
});

// --- Authenticated Trader Endpoints ---
app.get('/api/v1/account', apiKeyManager.requireAuth('read'), (req, res) => {
  const user = accountManager.getUser(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User account not found' });
  }
  const portfolio = accountManager.getPortfolio(req.userId, marketManager.getCurrentPrices());
  res.json({
    user: {
      id: user.id,
      name: user.name,
      createdAt: user.createdAt
    },
    portfolio
  });
});

app.get('/api/v1/orders', apiKeyManager.requireAuth('read'), (req, res) => {
  const orders = matchingEngine.getUserOpenOrders(req.userId);
  res.json({
    userId: req.userId,
    count: orders.length,
    orders
  });
});

app.post('/api/v1/orders', apiKeyManager.requireAuth('trade'), (req, res) => {
  const orderData = req.body;
  if (!orderData || !orderData.symbol || !orderData.side || !orderData.quantity) {
    return res.status(400).json({ error: 'Invalid order payload: symbol, side, quantity required' });
  }

  const user = accountManager.getUser(req.userId);
  const result = matchingEngine.submitOrder({
    userId: req.userId,
    userName: user ? user.name : 'API Trader',
    symbol: orderData.symbol.toUpperCase(),
    side: orderData.side.toUpperCase(),
    type: orderData.type ? orderData.type.toUpperCase() : 'LIMIT',
    price: orderData.price !== undefined ? Number(orderData.price) : undefined,
    stopPrice: orderData.stopPrice !== undefined ? Number(orderData.stopPrice) : undefined,
    trailingDelta: orderData.trailingDelta !== undefined ? Number(orderData.trailingDelta) : undefined,
    leverage: orderData.leverage ? Number(orderData.leverage) : 1,
    isShort: Boolean(orderData.isShort),
    ocoGroupId: orderData.ocoGroupId || null,
    quantity: parseInt(orderData.quantity)
  });

  if (result.success && (orderData.type === 'STOP_LOSS' || orderData.type === 'STOP_LIMIT' || orderData.type === 'TRAILING_STOP')) {
    triggerAchievementCheck(req.userId, 'STOP_ORDER_PLACED', result.order);
  }

  matchingEngine.checkAndLiquidate(req.userId);
  sendPortfolioUpdate(req.userId);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.status(201).json(result);
});

app.delete('/api/v1/orders/:id', apiKeyManager.requireAuth('trade'), (req, res) => {
  const orderId = req.params.id;
  let symbol = req.query.symbol || req.body?.symbol;

  if (!symbol) {
    const openOrders = matchingEngine.getUserOpenOrders(req.userId);
    const matched = openOrders.find(o => o.id === orderId);
    if (matched) {
      symbol = matched.symbol;
    }
  }

  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter for order cancellation' });
  }

  const result = matchingEngine.cancelOrder(symbol.toUpperCase(), orderId, req.userId);
  sendPortfolioUpdate(req.userId);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

// Socket.IO mapping
const socketToUser = new Map(); // socket.id -> userId
const userSockets = new Map();  // userId -> Set<socket.id>

function sendPortfolioUpdate(userId) {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return;

  const portfolio = accountManager.getPortfolio(userId, marketManager.getCurrentPrices());
  const openOrders = matchingEngine.getUserOpenOrders(userId);

  for (const socketId of sockets) {
    io.to(socketId).emit('portfolio:update', {
      portfolio,
      openOrders
    });
  }
}

function triggerAchievementCheck(uId, eventType = 'TRADE_SETTLED', eventData = {}) {
  if (!uId) return;
  const newlyUnlocked = accountManager.checkAchievements(uId, marketManager.getCurrentPrices(), eventType, eventData);
  if (newlyUnlocked && newlyUnlocked.length > 0) {
    const sockets = userSockets.get(uId);
    if (sockets) {
      for (const sId of sockets) {
        for (const ach of newlyUnlocked) {
          io.to(sId).emit('achievement:unlocked', ach);
        }
      }
    }
  }
}

// Wire Engine events to WebSockets
marketManager.on('priceUpdate', (data) => {
  io.emit('price:update', data);
});

matchingEngine.on('orderbookChange', ({ symbol, depth }) => {
  io.emit('orderbook:update', { symbol, depth });
});

matchingEngine.on('stopOrderTriggered', (order) => {
  const sockets = userSockets.get(order.userId);
  if (sockets) {
    for (const sId of sockets) {
      io.to(sId).emit('order:stopTriggered', order);
    }
  }
  sendPortfolioUpdate(order.userId);
});

matchingEngine.on('ocoCounterpartCancelled', ({ symbol, ocoGroupId, cancelledOrderId }) => {
  io.emit('order:ocoCancelled', { symbol, ocoGroupId, cancelledOrderId });
});

matchingEngine.on('liquidation', ({ userId, liquidations }) => {
  const sockets = userSockets.get(userId);
  if (sockets) {
    for (const sId of sockets) {
      io.to(sId).emit('margin:liquidation', { liquidations });
    }
  }
  sendPortfolioUpdate(userId);
});

matchingEngine.on('trade', (trade) => {
  io.emit('trade:new', trade);

  // Notify buyer and seller with personal trade fill notification
  const buyerSockets = userSockets.get(trade.buyerId);
  if (buyerSockets) {
    for (const sId of buyerSockets) {
      io.to(sId).emit('trade:personal', { ...trade, mySide: 'BUY' });
    }
  }
  const sellerSockets = userSockets.get(trade.sellerId);
  if (sellerSockets) {
    for (const sId of sellerSockets) {
      io.to(sId).emit('trade:personal', { ...trade, mySide: 'SELL' });
    }
  }

  // Check achievements upon settlement
  triggerAchievementCheck(trade.buyerId);
  triggerAchievementCheck(trade.sellerId);

  // Check margin calls and liquidation for both parties
  matchingEngine.checkAndLiquidate(trade.buyerId);
  matchingEngine.checkAndLiquidate(trade.sellerId);

  // Notify buyer and seller with fresh portfolio
  sendPortfolioUpdate(trade.buyerId);
  sendPortfolioUpdate(trade.sellerId);
});

marketManager.on('news', (newsItem) => {
  io.emit('news:breaking', newsItem);
});

marketManager.on('companiesUpdate', (companies) => {
  io.emit('companies:update', companies);
});

clock.on('tick', (clockState) => {
  io.emit('clock:tick', clockState);
});

clock.on('bellRing', (data) => {
  io.emit('bell:ring', data);
});

clock.on('phaseChange', (clockState) => {
  io.emit('clock:phaseChange', clockState);
  // Also push leaderboard on phase changes
  io.emit('leaderboard:update', accountManager.getLeaderboard(marketManager.getCurrentPrices(), 15));
});

clock.on('dayEnd', ({ day }) => {
  const marketPerformance = marketManager.getDayPerformance();
  const leaderboard = accountManager.getLeaderboard(marketManager.getCurrentPrices(), 10);

  // Emit personalized day end summary to each connected user
  for (const [uId, sockets] of userSockets.entries()) {
    const userSummary = accountManager.getDaySummary(uId, marketManager.getCurrentPrices(), day);
    for (const sId of sockets) {
      io.to(sId).emit('market:daySummary', {
        day,
        userSummary,
        marketPerformance,
        leaderboard,
        postMarketSec: clock.durations.POST_MARKET
      });
    }
  }
});

clock.on('newDay', ({ day }) => {
  accountManager.onNewDay(day, marketManager.getCurrentPrices());
  io.emit('market:newDay', { day });
});

// Periodic broadcast of full leaderboard and depths
setInterval(() => {
  io.emit('leaderboard:update', accountManager.getLeaderboard(marketManager.getCurrentPrices(), 15));
}, 3000);

// Client Socket Handlers
io.on('connection', (socket) => {
  let userId = null;

  socket.on('user:join', ({ desiredName, existingUserId }) => {
    userId = existingUserId || `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const userName = desiredName || `Trader_${userId.slice(-4)}`;

    socketToUser.set(socket.id, userId);
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    const user = accountManager.getOrCreateUser(userId, userName, false);
    user.name = userName;

    // Send initial bootstrap package
    socket.emit('init:state', {
      user: {
        id: user.id,
        name: user.name
      },
      clock: clock.getState(),
      companies: marketManager.getAllCompanies(),
      depths: matchingEngine.getAllDepths(10),
      recentTrades: marketManager.getRecentTrades(),
      news: marketManager.getNewsFeed(),
      portfolio: accountManager.getPortfolio(userId, marketManager.getCurrentPrices()),
      openOrders: matchingEngine.getUserOpenOrders(userId),
      leaderboard: accountManager.getLeaderboard(marketManager.getCurrentPrices(), 15),
      tournament: tournamentManager.getState(marketManager.getCurrentPrices()),
      regime: regimeEngine.getRegime()
    });
  });

  socket.on('order:place', (orderData, callback) => {
    if (!userId) {
      if (callback) callback({ success: false, error: 'Not registered' });
      return;
    }

    const user = accountManager.getUser(userId);
    const result = matchingEngine.submitOrder({
      userId,
      userName: user ? user.name : 'Human Trader',
      symbol: orderData.symbol,
      side: orderData.side,
      type: orderData.type,
      price: orderData.price,
      stopPrice: orderData.stopPrice,
      trailingDelta: orderData.trailingDelta,
      leverage: orderData.leverage || 1,
      isShort: Boolean(orderData.isShort),
      ocoGroupId: orderData.ocoGroupId || null,
      quantity: orderData.quantity
    });

    if (result.success && (orderData.type === 'STOP_LOSS' || orderData.type === 'STOP_LIMIT' || orderData.type === 'TRAILING_STOP')) {
      triggerAchievementCheck(userId, 'STOP_ORDER_PLACED', result.order);
    }

    // Check liquidation if needed
    matchingEngine.checkAndLiquidate(userId);

    sendPortfolioUpdate(userId);

    if (callback) {
      callback(result);
    }
  });

  socket.on('order:placeOco', (payload, callback) => {
    if (!userId) {
      if (callback) callback({ success: false, error: 'Not registered' });
      return;
    }

    const user = accountManager.getUser(userId);
    const userName = user ? user.name : 'Human Trader';

    let limitOrder = payload.limitOrder;
    let stopOrder = payload.stopOrder;

    if (!limitOrder || !stopOrder) {
      const sym = payload.symbol;
      const side = payload.side || 'SELL';
      const qty = payload.quantity || 1;
      const lev = payload.leverage || 1;
      limitOrder = {
        symbol: sym,
        side,
        type: 'LIMIT',
        price: payload.limitPrice || payload.price,
        quantity: qty,
        leverage: lev
      };
      stopOrder = {
        symbol: sym,
        side,
        type: 'STOP_LOSS',
        stopPrice: payload.stopPrice,
        quantity: qty,
        leverage: lev
      };
    }

    const result = matchingEngine.submitOcoOrder(
      { ...limitOrder, userId, userName },
      { ...stopOrder, userId, userName }
    );

    if (result.success) {
      triggerAchievementCheck(userId, 'STOP_ORDER_PLACED', result.stopOrder);
    }

    sendPortfolioUpdate(userId);

    if (callback) {
      callback(result);
    }
  });

  socket.on('order:cancel', ({ symbol, orderId }, callback) => {
    if (!userId) {
      if (callback) callback({ success: false, error: 'Not registered' });
      return;
    }

    const result = matchingEngine.cancelOrder(symbol, orderId, userId);
    sendPortfolioUpdate(userId);

    if (callback) {
      callback(result);
    }
  });

  socket.on('chart:history', ({ symbol, timeframe }, callback) => {
    const candles = marketManager.getCandles(symbol, timeframe || '5s');
    if (callback) {
      callback(candles);
    }
  });

  socket.on('tournament:join', (data, callback) => {
    if (!userId) {
      if (callback) callback({ success: false, error: 'Not registered' });
      return;
    }
    const user = accountManager.getUser(userId);
    const result = tournamentManager.joinTournament(userId, user ? user.name : 'Trader');
    io.emit('tournament:state', tournamentManager.getState(marketManager.getCurrentPrices()));
    if (callback) callback(result);
  });

  socket.on('disconnect', () => {
    if (userId && userSockets.has(userId)) {
      const set = userSockets.get(userId);
      set.delete(socket.id);
      if (set.size === 0) userSockets.delete(userId);
    }
    socketToUser.delete(socket.id);
  });
});

// Start clock, NPCs, and HTTP listener
clock.start();
npcManager.startAll();

httpServer.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` 🏛️  MARKET ARENA - FINANCIAL MARKET SIMULATOR`);
  console.log(` 🚀 Server listening on http://localhost:${PORT}`);
  console.log(` 🕒 Market Cycle: Day 1 - Regular Trading Hours Active`);
  console.log(` 🤖 NPC Traders: ${npcManager.traders.length} automated agents providing liquidity`);
  console.log(`=======================================================`);
});
