import { EventEmitter } from 'events';

/**
 * MarketClock simulates trading hours and cycles.
 * Phases:
 * 1. PRE_MARKET (30s) - Simulated 09:00 to 09:30. Order book accepts limit orders, no matching.
 * 2. REGULAR_HOURS (180s = 3m) - Simulated 09:30 to 16:00. Active trading and matching.
 * 3. POST_MARKET (30s) - Simulated 16:00 to 17:00. Day summary, settlements, leaderboard review.
 */
export class MarketClock extends EventEmitter {
  constructor(options = {}) {
    super();
    this.day = 1;
    this.phase = 'REGULAR_HOURS'; // Start in open mode so players can trade immediately
    this.phaseRemainingSec = options.openDurationSec || 180;
    this.durations = {
      PRE_MARKET: options.preMarketDurationSec || 30,
      REGULAR_HOURS: options.openDurationSec || 180,
      POST_MARKET: options.postMarketDurationSec || 30
    };
    this.timer = null;
    this.simulatedMinute = 570; // 09:30 AM in minutes
  }

  start() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this._tick(), 1000);
    this.emit('phaseChange', this.getState());
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isTradingOpen() {
    return this.phase === 'REGULAR_HOURS';
  }

  _tick() {
    this.phaseRemainingSec--;

    // Advance simulated time
    if (this.phase === 'REGULAR_HOURS') {
      // 390 trading minutes (09:30 to 16:00) over durations.REGULAR_HOURS seconds
      const minutesPerSec = 390 / this.durations.REGULAR_HOURS;
      this.simulatedMinute += minutesPerSec;
    }

    if (this.phaseRemainingSec <= 0) {
      this._transitionPhase();
    }

    this.emit('tick', this.getState());
  }

  _transitionPhase() {
    if (this.phase === 'PRE_MARKET') {
      this.phase = 'REGULAR_HOURS';
      this.phaseRemainingSec = this.durations.REGULAR_HOURS;
      this.simulatedMinute = 570; // 09:30
      this.emit('bellRing', { bell: 'OPENING_BELL', day: this.day });
    } else if (this.phase === 'REGULAR_HOURS') {
      this.phase = 'POST_MARKET';
      this.phaseRemainingSec = this.durations.POST_MARKET;
      this.simulatedMinute = 960; // 16:00
      this.emit('bellRing', { bell: 'CLOSING_BELL', day: this.day });
      this.emit('dayEnd', { day: this.day });
    } else if (this.phase === 'POST_MARKET') {
      this.day++;
      this.phase = 'PRE_MARKET';
      this.phaseRemainingSec = this.durations.PRE_MARKET;
      this.simulatedMinute = 540; // 09:00
      this.emit('newDay', { day: this.day });
    }

    this.emit('phaseChange', this.getState());
  }

  getSimulatedTimeStr() {
    const totalMinutes = Math.floor(this.simulatedMinute) % 1440;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const h12 = hours % 12 === 0 ? 12 : hours % 12;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const minsStr = mins < 10 ? `0${mins}` : `${mins}`;
    return `${h12}:${minsStr} ${ampm}`;
  }

  getState() {
    return {
      day: this.day,
      phase: this.phase,
      phaseRemainingSec: this.phaseRemainingSec,
      simulatedTime: this.getSimulatedTimeStr(),
      isTradingOpen: this.isTradingOpen()
    };
  }
}
