/**
 * Achievements Configuration & Definitions
 */
export const ACHIEVEMENTS_CONFIG = {
  FIRST_TRADE: {
    id: 'FIRST_TRADE',
    title: 'Market Debut',
    description: 'Executed your first buy or sell order.',
    rewardCredits: 250,
    icon: '⚡'
  },
  FIRST_PROFIT: {
    id: 'FIRST_PROFIT',
    title: 'In The Green',
    description: 'Closed a position with a positive realized gain.',
    rewardCredits: 500,
    icon: '📈'
  },
  HIGH_ROLLER: {
    id: 'HIGH_ROLLER',
    title: 'High Roller',
    description: 'Surpassed 50,000 CR in cumulative trading volume.',
    rewardCredits: 1000,
    icon: '💎'
  },
  DIVERSIFIED: {
    id: 'DIVERSIFIED',
    title: 'Asset Allocator',
    description: 'Held positions in 3 or more companies simultaneously.',
    rewardCredits: 750,
    icon: '🌐'
  },
  ALPHA_HUNTER: {
    id: 'ALPHA_HUNTER',
    title: 'Alpha Hunter',
    description: 'Achieved a net portfolio gain of 10% or greater.',
    rewardCredits: 2500,
    icon: '🏆'
  },
  SPEED_TRADER: {
    id: 'SPEED_TRADER',
    title: 'Centurion Trader',
    description: 'Executed 10 or more trades on the exchange.',
    rewardCredits: 500,
    icon: '🔥'
  },
  RISK_MANAGER: {
    id: 'RISK_MANAGER',
    title: 'Risk Manager',
    description: 'Placed your first Stop-Loss or Stop-Limit order.',
    rewardCredits: 300,
    icon: '🛡️'
  }
};

/**
 * Account and Portfolio Management System
 * Manages virtual balances (Credits), holdings, locking for limit orders,
 * realized/unrealized P&L, achievements, and leaderboard ranking.
 */
export class AccountManager {
  constructor(initialCredits = 100000, storageManager = null) {
    this.initialCredits = initialCredits;
    this.storageManager = storageManager;
    this.accounts = new Map(); // userId -> account object

    if (this.storageManager) {
      this._loadFromStorage();
    }
  }

  _serializeAccounts() {
    const list = [];
    for (const user of this.accounts.values()) {
      if (user.isNpc) continue; // Only persist human users
      const holdingsObj = {};
      for (const [sym, h] of user.holdings.entries()) {
        holdingsObj[sym] = { ...h };
      }
      list.push({
        id: user.id,
        name: user.name,
        isNpc: false,
        initialCapital: user.initialCapital,
        credits: user.credits,
        lockedCredits: user.lockedCredits,
        holdings: holdingsObj,
        tradeHistory: user.tradeHistory || [],
        realizedPnL: user.realizedPnL,
        tradesCount: user.tradesCount,
        volumeTraded: user.volumeTraded,
        createdAt: user.createdAt
      });
    }
    return { users: list, savedAt: Date.now() };
  }

  _loadFromStorage() {
    if (!this.storageManager) return;
    if (typeof this.storageManager.loadAllAccounts === 'function') {
      const accountsList = this.storageManager.loadAllAccounts();
      for (const acc of accountsList) {
        this.accounts.set(acc.id, acc);
      }
      return;
    }
    const data = this.storageManager.loadState ? this.storageManager.loadState() : null;
    if (!data || !Array.isArray(data.users)) return;
    for (const raw of data.users) {
      const holdingsMap = new Map();
      if (raw.holdings && typeof raw.holdings === 'object') {
        for (const [sym, h] of Object.entries(raw.holdings)) {
          holdingsMap.set(sym, {
            quantity: h.quantity || 0,
            avgPrice: h.avgPrice || 0,
            lockedQty: 0
          });
        }
      }
      this.accounts.set(raw.id, {
        id: raw.id,
        name: raw.name,
        isNpc: false,
        initialCapital: raw.initialCapital || this.initialCredits,
        credits: raw.credits !== undefined ? raw.credits : this.initialCredits,
        lockedCredits: 0,
        holdings: holdingsMap,
        tradeHistory: raw.tradeHistory || [],
        realizedPnL: raw.realizedPnL || 0,
        tradesCount: raw.tradesCount || 0,
        volumeTraded: raw.volumeTraded || 0,
        createdAt: raw.createdAt || Date.now()
      });
    }
  }

  _saveAccount(account) {
    if (!account || account.isNpc || !this.storageManager) return;
    if (typeof this.storageManager.saveAccount === 'function') {
      this.storageManager.saveAccount(account);
    } else if (typeof this.storageManager.scheduleSave === 'function') {
      this.storageManager.scheduleSave(this._serializeAccounts());
    }
  }

  _recordTrade(userId, tradeItem) {
    if (!this.storageManager || typeof this.storageManager.recordTrade !== 'function') return;
    this.storageManager.recordTrade(userId, tradeItem);
  }

  _saveToStorage() {
    if (this.storageManager) {
      if (typeof this.storageManager.scheduleSave === 'function') {
        this.storageManager.scheduleSave(this._serializeAccounts());
      }
    }
  }

  getOrCreateUser(userId, userName, isNpc = false, customInitialCredits = null) {
    if (!this.accounts.has(userId)) {
      const computedIsNpc = isNpc || (typeof userId === 'string' && userId.startsWith('bot_'));
      const startCapital = customInitialCredits !== null ? customInitialCredits : this.initialCredits;
      const account = {
        id: userId,
        name: userName || (computedIsNpc ? `Bot_${userId}` : `Trader_${userId.slice(0, 4)}`),
        isNpc: computedIsNpc,
        initialCapital: startCapital,
        credits: startCapital,
        lockedCredits: 0,
        holdings: new Map(), // symbol -> { quantity: number, avgPrice: number, lockedQty: number }
        tradeHistory: [], // array of executed trades for this account
        achievements: new Set(),
        dayStartNetWorth: startCapital,
        tradesToday: 0,
        volumeToday: 0,
        realizedPnL: 0,
        tradesCount: 0,
        volumeTraded: 0,
        createdAt: Date.now()
      };
      this.accounts.set(userId, account);
      if (!computedIsNpc) {
        this._saveAccount(account);
      }
    }
    return this.accounts.get(userId);
  }

  getUser(userId) {
    return this.accounts.get(userId) || null;
  }

  canAffordBuy(userId, price, quantity) {
    const user = this.accounts.get(userId);
    if (!user) return false;
    const required = price * quantity;
    const available = user.credits - user.lockedCredits;
    return available >= required;
  }

  lockCredits(userId, amount) {
    const user = this.accounts.get(userId);
    if (!user) return false;
    user.lockedCredits = +(user.lockedCredits + amount).toFixed(2);
    return true;
  }

  unlockCredits(userId, amount) {
    const user = this.accounts.get(userId);
    if (!user) return false;
    user.lockedCredits = Math.max(0, +(user.lockedCredits - amount).toFixed(2));
    return true;
  }

  canAffordSell(userId, symbol, quantity) {
    const user = this.accounts.get(userId);
    if (!user) return false;
    const holding = user.holdings.get(symbol);
    if (!holding) return false;
    const availableShares = holding.quantity - (holding.lockedQty || 0);
    return availableShares >= quantity;
  }

  getSellAvailability(userId, symbol) {
    const user = this.accounts.get(userId);
    if (!user) return { hasHolding: false, totalShares: 0, availableShares: 0, lockedShares: 0 };
    const holding = user.holdings.get(symbol);
    if (!holding || holding.quantity <= 0) return { hasHolding: false, totalShares: 0, availableShares: 0, lockedShares: 0 };
    const lockedShares = holding.lockedQty || 0;
    const availableShares = holding.quantity - lockedShares;
    return {
      hasHolding: true,
      totalShares: holding.quantity,
      availableShares,
      lockedShares
    };
  }

  lockShares(userId, symbol, quantity) {
    const user = this.accounts.get(userId);
    if (!user) return false;
    const holding = user.holdings.get(symbol);
    if (!holding) return false;
    holding.lockedQty = (holding.lockedQty || 0) + quantity;
    return true;
  }

  unlockShares(userId, symbol, quantity) {
    const user = this.accounts.get(userId);
    if (!user) return false;
    const holding = user.holdings.get(symbol);
    if (!holding) return false;
    holding.lockedQty = Math.max(0, (holding.lockedQty || 0) - quantity);
    return true;
  }

  /**
   * Settle an executed trade between buyer and seller
   * @param {Object} trade
   * @param {boolean} buyerWasMaker - whether buyer had a resting limit order
   * @param {boolean} sellerWasMaker - whether seller had a resting limit order
   */
  settleTrade(trade, buyerWasMaker, sellerWasMaker) {
    const buyer = this.getOrCreateUser(trade.buyerId, trade.buyerName);
    const seller = this.getOrCreateUser(trade.sellerId, trade.sellerName);
    const totalValue = +(trade.price * trade.quantity).toFixed(2);

    // Update Buyer
    buyer.credits = +(buyer.credits - totalValue).toFixed(2);
    if (buyerWasMaker) {
      // Unlock reserved limit funds
      buyer.lockedCredits = Math.max(0, +(buyer.lockedCredits - totalValue).toFixed(2));
    }
    buyer.tradesCount++;
    buyer.tradesToday = (buyer.tradesToday || 0) + 1;
    buyer.volumeTraded = +(buyer.volumeTraded + totalValue).toFixed(2);
    buyer.volumeToday = +((buyer.volumeToday || 0) + totalValue).toFixed(2);

    let buyerHolding = buyer.holdings.get(trade.symbol);
    if (!buyerHolding) {
      buyerHolding = { quantity: 0, avgPrice: 0, lockedQty: 0 };
      buyer.holdings.set(trade.symbol, buyerHolding);
    }
    const newBuyerQty = buyerHolding.quantity + trade.quantity;
    const prevBuyerCost = buyerHolding.quantity * buyerHolding.avgPrice;
    buyerHolding.avgPrice = +((prevBuyerCost + totalValue) / newBuyerQty).toFixed(2);
    buyerHolding.quantity = newBuyerQty;

    // Record buyer trade history
    if (!buyer.tradeHistory) buyer.tradeHistory = [];
    const buyerTrade = {
      id: trade.id,
      symbol: trade.symbol,
      side: 'BUY',
      price: trade.price,
      quantity: trade.quantity,
      totalValue,
      role: buyerWasMaker ? 'MAKER' : 'TAKER',
      counterparty: trade.sellerName,
      timestamp: trade.timestamp || Date.now()
    };
    buyer.tradeHistory.unshift(buyerTrade);
    if (buyer.tradeHistory.length > 100) buyer.tradeHistory.pop();

    if (!buyer.isNpc) {
      this._saveAccount(buyer);
      this._recordTrade(buyer.id, buyerTrade);
    }

    // Update Seller
    seller.credits = +(seller.credits + totalValue).toFixed(2);
    seller.tradesCount++;
    seller.tradesToday = (seller.tradesToday || 0) + 1;
    seller.volumeTraded = +(seller.volumeTraded + totalValue).toFixed(2);
    seller.volumeToday = +((seller.volumeToday || 0) + totalValue).toFixed(2);

    let profit = 0;
    const sellerHolding = seller.holdings.get(trade.symbol);
    if (sellerHolding) {
      if (sellerWasMaker) {
        sellerHolding.lockedQty = Math.max(0, (sellerHolding.lockedQty || 0) - trade.quantity);
      }
      // Calculate realized P&L
      const costBasis = sellerHolding.avgPrice * trade.quantity;
      profit = +(totalValue - costBasis).toFixed(2);
      seller.realizedPnL = +(seller.realizedPnL + profit).toFixed(2);

      sellerHolding.quantity -= trade.quantity;
      if (sellerHolding.quantity <= 0) {
        sellerHolding.quantity = 0;
        sellerHolding.avgPrice = 0;
        sellerHolding.lockedQty = 0;
      }
    }

    // Record seller trade history
    if (!seller.tradeHistory) seller.tradeHistory = [];
    const sellerTrade = {
      id: trade.id,
      symbol: trade.symbol,
      side: 'SELL',
      price: trade.price,
      quantity: trade.quantity,
      totalValue,
      role: sellerWasMaker ? 'MAKER' : 'TAKER',
      realizedPnL: profit,
      counterparty: trade.buyerName,
      timestamp: trade.timestamp || Date.now()
    };
    seller.tradeHistory.unshift(sellerTrade);
    if (seller.tradeHistory.length > 100) seller.tradeHistory.pop();

    if (!seller.isNpc) {
      this._saveAccount(seller);
      this._recordTrade(seller.id, sellerTrade);
    }
  }

  getUserTradeHistory(userId) {
    const user = this.getUser(userId);
    return user ? (user.tradeHistory || []) : [];
  }

  getPortfolio(userId, currentPrices) {
    const user = this.getUser(userId);
    if (!user) return null;

    let stockValue = 0;
    let totalUnrealizedPnL = 0;
    const holdingsList = [];

    for (const [symbol, h] of user.holdings.entries()) {
      if (h.quantity <= 0) continue;
      const curPrice = currentPrices[symbol] || h.avgPrice;
      const curVal = +(h.quantity * curPrice).toFixed(2);
      const cost = +(h.quantity * h.avgPrice).toFixed(2);
      const unrlPnL = +(curVal - cost).toFixed(2);
      const pnlPct = cost > 0 ? +((unrlPnL / cost) * 100).toFixed(2) : 0;

      stockValue += curVal;
      totalUnrealizedPnL += unrlPnL;

      holdingsList.push({
        symbol,
        quantity: h.quantity,
        lockedQty: h.lockedQty || 0,
        availableQty: h.quantity - (h.lockedQty || 0),
        avgPrice: h.avgPrice,
        currentPrice: curPrice,
        currentValue: curVal,
        unrealizedPnL: unrlPnL,
        pnlPercent: pnlPct
      });
    }

    const availableCredits = +(user.credits - user.lockedCredits).toFixed(2);
    const totalNetWorth = +(user.credits + stockValue).toFixed(2);
    const baseCapital = user.initialCapital || this.initialCredits;
    const totalPnL = +(totalNetWorth - baseCapital).toFixed(2);
    const totalPnLPercent = baseCapital > 0 ? +((totalPnL / baseCapital) * 100).toFixed(2) : 0;

    const unlockedAchievements = Array.from(user.achievements || []).map(id => ACHIEVEMENTS_CONFIG[id]).filter(Boolean);
    const allAchievements = Object.values(ACHIEVEMENTS_CONFIG).map(a => ({
      ...a,
      unlocked: user.achievements ? user.achievements.has(a.id) : false
    }));

    return {
      userId: user.id,
      name: user.name,
      credits: user.credits,
      availableCredits,
      lockedCredits: user.lockedCredits,
      stockValue: +stockValue.toFixed(2),
      totalNetWorth,
      totalPnL,
      totalPnLPercent,
      realizedPnL: user.realizedPnL,
      unrealizedPnL: +totalUnrealizedPnL.toFixed(2),
      tradesCount: user.tradesCount,
      volumeTraded: user.volumeTraded,
      holdings: holdingsList,
      tradeHistory: user.tradeHistory || [],
      achievements: unlockedAchievements,
      allAchievements
    };
  }

  /**
   * Evaluate and grant achievements for a user
   * @param {string} userId
   * @param {Object} currentPrices
   * @param {string} [eventType] e.g. 'TRADE_SETTLED', 'STOP_ORDER_PLACED'
   * @param {Object} [eventData]
   * @returns {Array<Object>} List of newly unlocked achievements
   */
  checkAchievements(userId, currentPrices = {}, eventType = '', eventData = {}) {
    const user = this.getUser(userId);
    if (!user || user.isNpc) return [];

    if (!user.achievements) user.achievements = new Set();
    const newlyUnlocked = [];

    const unlock = (achievementKey) => {
      const ach = ACHIEVEMENTS_CONFIG[achievementKey];
      if (!ach || user.achievements.has(ach.id)) return;

      user.achievements.add(ach.id);
      // Award bonus reward credits
      if (ach.rewardCredits > 0) {
        user.credits = +(user.credits + ach.rewardCredits).toFixed(2);
      }
      if (this.storageManager && typeof this.storageManager.saveAchievement === 'function') {
        this.storageManager.saveAchievement(userId, ach.id);
      }
      this._saveAccount(user);
      newlyUnlocked.push(ach);
    };

    // 1. FIRST_TRADE: Any trade completed
    if (user.tradesCount >= 1) {
      unlock('FIRST_TRADE');
    }

    // 2. FIRST_PROFIT: Realized PnL > 0
    if (user.realizedPnL > 0) {
      unlock('FIRST_PROFIT');
    }

    // 3. HIGH_ROLLER: Traded >= 50,000 CR
    if (user.volumeTraded >= 50000) {
      unlock('HIGH_ROLLER');
    }

    // 4. DIVERSIFIED: Hold shares in >= 3 different companies
    let distinctHoldings = 0;
    for (const h of user.holdings.values()) {
      if (h.quantity > 0) distinctHoldings++;
    }
    if (distinctHoldings >= 3) {
      unlock('DIVERSIFIED');
    }

    // 5. ALPHA_HUNTER: +10% Total portfolio net worth gain
    let stockValue = 0;
    for (const [sym, h] of user.holdings.entries()) {
      if (h.quantity > 0) {
        stockValue += h.quantity * (currentPrices[sym] || h.avgPrice);
      }
    }
    const currentNW = user.credits + stockValue;
    const baseCap = user.initialCapital || this.initialCredits;
    const returnPct = baseCap > 0 ? ((currentNW - baseCap) / baseCap) * 100 : 0;
    if (returnPct >= 10) {
      unlock('ALPHA_HUNTER');
    }

    // 6. SPEED_TRADER: >= 10 trades
    if (user.tradesCount >= 10) {
      unlock('SPEED_TRADER');
    }

    // 7. RISK_MANAGER: Placed stop order
    if (eventType === 'STOP_ORDER_PLACED') {
      unlock('RISK_MANAGER');
    }

    return newlyUnlocked;
  }

  /**
   * Generate end of day performance recap for a user
   * @param {string} userId
   * @param {Object} currentPrices
   * @param {number} day
   */
  getDaySummary(userId, currentPrices, day) {
    const user = this.getUser(userId);
    if (!user) return null;
    const p = this.getPortfolio(userId, currentPrices);
    const startNW = user.dayStartNetWorth || user.initialCapital || this.initialCredits;
    const dayPnL = +(p.totalNetWorth - startNW).toFixed(2);
    const dayPnLPercent = startNW > 0 ? +((dayPnL / startNW) * 100).toFixed(2) : 0;

    let topHolding = null;
    let maxVal = 0;
    for (const h of p.holdings) {
      if (h.currentValue > maxVal) {
        maxVal = h.currentValue;
        topHolding = h.symbol;
      }
    }

    return {
      day,
      userId: user.id,
      name: user.name,
      netWorth: p.totalNetWorth,
      dayStartNetWorth: startNW,
      dayPnL,
      dayPnLPercent,
      totalPnL: p.totalPnL,
      totalPnLPercent: p.totalPnLPercent,
      tradesToday: user.tradesToday || 0,
      volumeToday: user.volumeToday || 0,
      cash: p.credits,
      stockValue: p.stockValue,
      topHolding,
      unlockedAchievements: Array.from(user.achievements || [])
    };
  }

  /**
   * Reset daily accumulators and snapshot starting net worth for the new day
   * @param {number} day
   * @param {Object} currentPrices
   */
  onNewDay(day, currentPrices) {
    for (const user of this.accounts.values()) {
      const p = this.getPortfolio(user.id, currentPrices);
      if (p) {
        user.dayStartNetWorth = p.totalNetWorth;
      }
      user.tradesToday = 0;
      user.volumeToday = 0;
    }
  }

  getLeaderboard(currentPrices, limit = 10) {
    const list = [];
    for (const user of this.accounts.values()) {
      const p = this.getPortfolio(user.id, currentPrices);
      if (p) {
        list.push({
          userId: user.id,
          name: user.name,
          isNpc: user.isNpc,
          totalNetWorth: p.totalNetWorth,
          totalPnL: p.totalPnL,
          totalPnLPercent: p.totalPnLPercent,
          tradesCount: user.tradesCount
        });
      }
    }
    list.sort((a, b) => b.totalNetWorth - a.totalNetWorth);
    return list.slice(0, limit);
  }
}
