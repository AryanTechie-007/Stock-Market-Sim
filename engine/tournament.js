import { EventEmitter } from 'events';

/**
 * Competitive Multiplayer Tournament Coordinator
 * MarketArena Tournament Mode
 */
export class TournamentManager extends EventEmitter {
  constructor(accountManager, clock, roundDurationSec = 180, standardBankroll = 50000, priceGetter = null) {
    super();
    this.accountManager = accountManager;
    this.clock = clock;
    this.roundDurationSec = roundDurationSec;
    this.standardBankroll = standardBankroll;
    this.priceGetter = priceGetter;

    this.status = 'IDLE'; // 'IDLE' | 'COUNTDOWN' | 'ACTIVE' | 'CONCLUDED'
    this.countdownRemaining = 0;
    this.roundRemainingSec = 0;
    this.currentRoundId = null;
    this.timer = null;

    // Map<userId, ParticipantState>
    this.participants = new Map();
    this.lastPodium = null;
  }

  /**
   * Enroll a trader in the upcoming/active tournament
   */
  joinTournament(userId, userName) {
    if (this.participants.has(userId)) {
      return { success: true, participant: this.participants.get(userId), alreadyJoined: true };
    }

    const participant = {
      userId,
      userName,
      credits: this.standardBankroll,
      lockedCredits: 0,
      holdings: new Map(), // symbol -> { quantity, avgPrice, lockedQty }
      tradesCount: 0,
      realizedPnL: 0,
      startingNetWorth: this.standardBankroll,
      joinedAt: Date.now()
    };

    this.participants.set(userId, participant);
    this.emit('participantJoined', participant);

    // If IDLE and we have participants, start automated countdown
    if (this.status === 'IDLE') {
      this.startCountdown(10, this.roundDurationSec);
    }

    return { success: true, participant, alreadyJoined: false };
  }

  /**
   * Start pre-round countdown
   */
  startCountdown(countdownSec = 10, roundSec = 180) {
    if (this.status === 'ACTIVE') return;

    this.status = 'COUNTDOWN';
    this.countdownRemaining = countdownSec;
    this.roundDurationSec = roundSec;
    this.roundRemainingSec = roundSec;
    this.currentRoundId = `tourney_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(() => {
      if (this.status === 'COUNTDOWN') {
        this.countdownRemaining--;
        this.emit('tick', { status: this.status, countdownRemaining: this.countdownRemaining });
        if (this.countdownRemaining <= 0) {
          this.startRound();
        }
      } else if (this.status === 'ACTIVE') {
        this.roundRemainingSec--;
        this.emit('tick', { status: this.status, roundRemainingSec: this.roundRemainingSec });
        if (this.roundRemainingSec <= 0) {
          this.concludeTournament();
        }
      }
    }, 1000);

    this.emit('stateChange', this.getState());
  }

  /**
   * Start active trading round
   */
  startRound() {
    this.status = 'ACTIVE';
    this.roundRemainingSec = this.roundDurationSec;
    this.emit('roundStarted', {
      roundId: this.currentRoundId,
      durationSec: this.roundDurationSec,
      participantsCount: this.participants.size
    });
    this.emit('stateChange', this.getState());
  }

  /**
   * Conclude tournament, compute podium winners, award prize bonuses to main account
   */
  concludeTournament(prices = {}) {
    if (this.status === 'CONCLUDED') return;
    this.status = 'CONCLUDED';
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const leaderboard = this.getLeaderboard(prices);
    const podium = leaderboard.slice(0, 3);

    // Prize structures: 1st (+5,000 CR), 2nd (+2,500 CR), 3rd (+1,000 CR)
    const prizePill = [5000, 2500, 1000];
    podium.forEach((winner, idx) => {
      winner.rank = idx + 1;
      winner.prizeCredits = prizePill[idx] || 500;

      // Credit main user account with tournament winnings
      if (this.accountManager) {
        const user = this.accountManager.getUser(winner.userId);
        if (user) {
          user.credits = +(user.credits + winner.prizeCredits).toFixed(2);
        }
      }
    });

    this.lastPodium = {
      roundId: this.currentRoundId,
      concludedAt: Date.now(),
      podium,
      totalParticipants: leaderboard.length
    };

    this.emit('tournamentConcluded', this.lastPodium);
    this.emit('stateChange', this.getState(prices));

    // Reset back to IDLE after 20 seconds recap cooldown
    setTimeout(() => {
      this.status = 'IDLE';
      this.participants.clear();
      this.emit('stateChange', this.getState());
    }, 20000);
  }

  /**
   * Settle a tournament trade execution
   */
  recordTournamentTrade(trade) {
    if (this.status !== 'ACTIVE') return;

    // Process buyer
    if (this.participants.has(trade.buyerId)) {
      const p = this.participants.get(trade.buyerId);
      const gross = trade.price * trade.quantity;
      p.credits = +(p.credits - gross).toFixed(2);
      p.tradesCount++;

      const existing = p.holdings.get(trade.symbol) || { quantity: 0, avgPrice: 0, lockedQty: 0 };
      const newQty = existing.quantity + trade.quantity;
      const newAvg = (existing.quantity * existing.avgPrice + gross) / newQty;
      p.holdings.set(trade.symbol, { quantity: newQty, avgPrice: +newAvg.toFixed(2), lockedQty: 0 });
    }

    // Process seller
    if (this.participants.has(trade.sellerId)) {
      const p = this.participants.get(trade.sellerId);
      const gross = trade.price * trade.quantity;
      p.credits = +(p.credits + gross).toFixed(2);
      p.tradesCount++;

      const existing = p.holdings.get(trade.symbol);
      if (existing && existing.quantity >= trade.quantity) {
        const pnl = (trade.price - existing.avgPrice) * trade.quantity;
        p.realizedPnL = +(p.realizedPnL + pnl).toFixed(2);
        existing.quantity -= trade.quantity;
        if (existing.quantity === 0) {
          p.holdings.delete(trade.symbol);
        }
      }
    }

    this.emit('leaderboardUpdate', this.getLeaderboard());
  }

  /**
   * Get sorted tournament leaderboard
   */
  getLeaderboard(prices = {}) {
    const activePrices = Object.keys(prices || {}).length > 0
      ? prices
      : (this.priceGetter ? this.priceGetter() : {});
    const list = [];

    for (const p of this.participants.values()) {
      let stockValue = 0;
      for (const [sym, h] of p.holdings.entries()) {
        if (h.quantity <= 0) continue;
        const mark = activePrices[sym] || h.avgPrice || 100;
        stockValue += h.quantity * mark;
      }

      const totalNetWorth = +(p.credits + stockValue).toFixed(2);
      const netReturn = +(totalNetWorth - p.startingNetWorth).toFixed(2);
      const returnPercent = p.startingNetWorth > 0 ? +((netReturn / p.startingNetWorth) * 100).toFixed(2) : 0;

      list.push({
        userId: p.userId,
        name: p.userName,
        credits: p.credits,
        stockValue: +stockValue.toFixed(2),
        totalNetWorth,
        netReturn,
        returnPercent,
        tradesCount: p.tradesCount,
        realizedPnL: p.realizedPnL
      });
    }

    list.sort((a, b) => b.totalNetWorth - a.totalNetWorth);
    return list;
  }

  /**
   * Full tournament state package for clients
   */
  getState(prices = {}) {
    return {
      status: this.status,
      roundId: this.currentRoundId,
      countdownRemaining: this.countdownRemaining,
      roundRemainingSec: this.roundRemainingSec,
      roundDurationSec: this.roundDurationSec,
      standardBankroll: this.standardBankroll,
      participantsCount: this.participants.size,
      leaderboard: this.getLeaderboard(prices),
      lastPodium: this.lastPodium
    };
  }
}
