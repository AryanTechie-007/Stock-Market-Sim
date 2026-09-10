/**
 * Account and Portfolio Management System
 * Manages virtual balances (Credits), holdings, locking for limit orders,
 * realized/unrealized P&L, and leaderboard ranking.
 */
export class AccountManager {
  constructor(initialCredits = 100000) {
    this.initialCredits = initialCredits;
    this.accounts = new Map(); // userId -> account object
  }

  getOrCreateUser(userId, userName, isNpc = false, customInitialCredits = null) {
    if (!this.accounts.has(userId)) {
      const startCapital = customInitialCredits !== null ? customInitialCredits : this.initialCredits;
      this.accounts.set(userId, {
        id: userId,
        name: userName || (isNpc ? `Bot_${userId}` : `Trader_${userId.slice(0, 4)}`),
        isNpc,
        initialCapital: startCapital,
        credits: startCapital,
        lockedCredits: 0,
        holdings: new Map(), // symbol -> { quantity: number, avgPrice: number, lockedQty: number }
        realizedPnL: 0,
        tradesCount: 0,
        volumeTraded: 0,
        createdAt: Date.now()
      });
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
    buyer.volumeTraded = +(buyer.volumeTraded + totalValue).toFixed(2);

    let buyerHolding = buyer.holdings.get(trade.symbol);
    if (!buyerHolding) {
      buyerHolding = { quantity: 0, avgPrice: 0, lockedQty: 0 };
      buyer.holdings.set(trade.symbol, buyerHolding);
    }
    const newBuyerQty = buyerHolding.quantity + trade.quantity;
    const prevBuyerCost = buyerHolding.quantity * buyerHolding.avgPrice;
    buyerHolding.avgPrice = +((prevBuyerCost + totalValue) / newBuyerQty).toFixed(2);
    buyerHolding.quantity = newBuyerQty;

    // Update Seller
    seller.credits = +(seller.credits + totalValue).toFixed(2);
    seller.tradesCount++;
    seller.volumeTraded = +(seller.volumeTraded + totalValue).toFixed(2);

    const sellerHolding = seller.holdings.get(trade.symbol);
    if (sellerHolding) {
      if (sellerWasMaker) {
        sellerHolding.lockedQty = Math.max(0, (sellerHolding.lockedQty || 0) - trade.quantity);
      }
      // Calculate realized P&L
      const costBasis = sellerHolding.avgPrice * trade.quantity;
      const profit = totalValue - costBasis;
      seller.realizedPnL = +(seller.realizedPnL + profit).toFixed(2);

      sellerHolding.quantity -= trade.quantity;
      if (sellerHolding.quantity <= 0) {
        sellerHolding.quantity = 0;
        sellerHolding.avgPrice = 0;
        sellerHolding.lockedQty = 0;
      }
    }
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
      holdings: holdingsList
    };
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
