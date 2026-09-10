import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

import { MarketClock } from './engine/clock.js';
import { AccountManager } from './engine/accounts.js';
import { MatchingEngine } from './engine/matching.js';
import { MarketManager } from './engine/market.js';
import { NPCManager } from './traders/manager.js';
import { SQLiteStorageManager } from './engine/sqlite-storage.js';

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
const symbols = ['AUTO', 'SOLR', 'BYTE', 'NBNK', 'MEDL'];
const matchingEngine = new MatchingEngine(symbols, accountManager, clock);
const marketManager = new MarketManager(clock, matchingEngine);
const npcManager = new NPCManager(matchingEngine, marketManager, accountManager, clock);

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Basic health / stats API
app.get('/api/state', (req, res) => {
  res.json({
    clock: clock.getState(),
    companies: marketManager.getAllCompanies(),
    leaderboard: accountManager.getLeaderboard(marketManager.getCurrentPrices(), 10)
  });
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
      leaderboard: accountManager.getLeaderboard(marketManager.getCurrentPrices(), 15)
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
      quantity: orderData.quantity
    });

    if (result.success && (orderData.type === 'STOP_LOSS' || orderData.type === 'STOP_LIMIT')) {
      triggerAchievementCheck(userId, 'STOP_ORDER_PLACED', result.order);
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

  socket.on('chart:history', ({ symbol }, callback) => {
    const candles = marketManager.getCandles(symbol);
    if (callback) {
      callback(candles);
    }
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
  console.log(` 🤖 NPC Traders: 8 automated agents providing liquidity`);
  console.log(`=======================================================`);
});
