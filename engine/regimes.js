import { EventEmitter } from 'events';

/**
 * Adaptive Market Regime Engine
 * Coordinates macroeconomic & microstructure volatility states across MarketArena
 */
export class MarketRegimeEngine extends EventEmitter {
  constructor(clock = null) {
    super();
    this.clock = clock;

    this.regimes = {
      NORMAL: {
        name: 'NORMAL',
        label: 'Normal Volatility',
        description: 'Standard equilibrium conditions with balanced liquidity and steady two-sided order flow.',
        volatilityMultiplier: 1.0,
        spreadMultiplier: 1.0,
        volumeMultiplier: 1.0,
        color: '#64748b',
        defaultDurationSec: 120
      },
      LOW_VOLATILITY: {
        name: 'LOW_VOLATILITY',
        label: 'Low Vol Consolidation',
        description: 'Tight range-bound consolidation with compressed bid-ask spreads and reduced tick velocity.',
        volatilityMultiplier: 0.5,
        spreadMultiplier: 0.75,
        volumeMultiplier: 0.6,
        color: '#38bdf8',
        defaultDurationSec: 90
      },
      BREAKOUT: {
        name: 'BREAKOUT',
        label: 'Momentum Breakout',
        description: 'Aggressive directional trend with expanding volume and directional order imbalances.',
        volatilityMultiplier: 1.8,
        spreadMultiplier: 1.3,
        volumeMultiplier: 2.2,
        color: '#34d399',
        defaultDurationSec: 60
      },
      HIGH_VOLATILITY: {
        name: 'HIGH_VOLATILITY',
        label: 'High Volatility Drought',
        description: 'Elevated asset uncertainty. Market makers expand spreads to guard against adverse selection.',
        volatilityMultiplier: 2.5,
        spreadMultiplier: 2.2,
        volumeMultiplier: 1.6,
        color: '#f59e0b',
        defaultDurationSec: 45
      },
      FLASH_CRASH: {
        name: 'FLASH_CRASH',
        label: 'Flash Crash Event',
        description: 'Sudden liquidity withdrawal and cascading automated sell orders followed by rapid stabilization.',
        volatilityMultiplier: 4.0,
        spreadMultiplier: 3.5,
        volumeMultiplier: 3.0,
        color: '#ef4444',
        defaultDurationSec: 25
      }
    };

    this.currentRegimeName = 'NORMAL';
    this.remainingSec = this.regimes.NORMAL.defaultDurationSec;
    this.timer = null;

    if (this.clock) {
      this.clock.on('tick', () => this.tick());
    }
  }

  /**
   * Transition to a specific market regime
   */
  setRegime(regimeName, durationSec = null) {
    const target = this.regimes[regimeName.toUpperCase()];
    if (!target) {
      throw new Error(`Unknown market regime: ${regimeName}`);
    }

    const previousName = this.currentRegimeName;
    this.currentRegimeName = target.name;
    this.remainingSec = durationSec || target.defaultDurationSec;

    const payload = this.getRegime();
    this.emit('regimeChange', {
      ...payload,
      previousRegime: previousName,
      timestamp: Date.now()
    });

    return payload;
  }

  /**
   * Decrement regime timer and transition when expired
   */
  tick() {
    this.remainingSec--;
    this.emit('tick', {
      regime: this.currentRegimeName,
      remainingSec: this.remainingSec
    });

    if (this.remainingSec <= 0) {
      this._transitionNextRegime();
    }
  }

  /**
   * Probabilistic transition to next regime
   */
  _transitionNextRegime() {
    // Weighted probabilities
    const rand = Math.random();
    let nextRegime = 'NORMAL';

    if (this.currentRegimeName === 'FLASH_CRASH') {
      // After flash crash, always transition to high volatility or normal recovery
      nextRegime = rand > 0.4 ? 'HIGH_VOLATILITY' : 'NORMAL';
    } else if (this.currentRegimeName === 'NORMAL') {
      if (rand < 0.45) nextRegime = 'NORMAL';
      else if (rand < 0.70) nextRegime = 'LOW_VOLATILITY';
      else if (rand < 0.88) nextRegime = 'BREAKOUT';
      else if (rand < 0.97) nextRegime = 'HIGH_VOLATILITY';
      else nextRegime = 'FLASH_CRASH';
    } else {
      // Return to normal or alternate
      if (rand < 0.55) nextRegime = 'NORMAL';
      else if (rand < 0.80) nextRegime = 'BREAKOUT';
      else nextRegime = 'LOW_VOLATILITY';
    }

    this.setRegime(nextRegime);
  }

  /**
   * Get full state object for current regime
   */
  getRegime() {
    const current = this.regimes[this.currentRegimeName];
    return {
      name: current.name,
      label: current.label,
      description: current.description,
      volatilityMultiplier: current.volatilityMultiplier,
      spreadMultiplier: current.spreadMultiplier,
      volumeMultiplier: current.volumeMultiplier,
      color: current.color,
      remainingSec: this.remainingSec
    };
  }
}
