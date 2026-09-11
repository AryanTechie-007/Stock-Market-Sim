import { EventEmitter } from 'events';
import { SimulationWorldNewsEngine } from './news-engine.js';

export const INITIAL_COMPANIES = [
  {
    symbol: 'AUTO',
    name: 'AutoCorp',
    mark: 'AU',
    sector: 'Auto · EV',
    basePrice: 450,
    price: 450,
    openPrice: 450,
    highPrice: 450,
    lowPrice: 450,
    previousClose: 450,
    intrinsicValue: 450,
    sentiment: 0, // -1.0 to +1.0
    volatility: 0.015,
    annualReturn: 0.08, // 8.0% annual expected return (GBM drift mu)
    annualVolatility: 0.2381, // 23.81% annualized volatility (GBM diffusion sigma = 0.015 * sqrt(252))
    fundamentals: {
      marketCap: '45.0B',
      peRatio: 16.4,
      profitMargin: '8.2%',
      revenueGrowth: '+12.4%',
      dividendYield: '2.1%'
    },
    description: 'Premier automotive manufacturer pioneering solid-state battery tech and electric vehicles.'
  },
  {
    symbol: 'SOLR',
    name: 'SolarGen',
    mark: 'SO',
    sector: 'Solar · Clean Energy',
    basePrice: 280,
    price: 280,
    openPrice: 280,
    highPrice: 280,
    lowPrice: 280,
    previousClose: 280,
    intrinsicValue: 280,
    sentiment: 0.1,
    volatility: 0.025,
    annualReturn: 0.14, // 14.0% annual expected return (clean tech growth drift)
    annualVolatility: 0.3969, // 39.69% annualized volatility (0.025 * sqrt(252))
    fundamentals: {
      marketCap: '28.0B',
      peRatio: 28.5,
      profitMargin: '14.5%',
      revenueGrowth: '+28.0%',
      dividendYield: '0.8%'
    },
    description: 'High-growth renewable grid developer with utility-scale solar farms and next-gen battery storage.'
  },
  {
    symbol: 'BYTE',
    name: 'ByteWorks',
    mark: 'BY',
    sector: 'Cloud · AI Systems',
    basePrice: 1200,
    price: 1200,
    openPrice: 1200,
    highPrice: 1200,
    lowPrice: 1200,
    previousClose: 1200,
    intrinsicValue: 1200,
    sentiment: 0.2,
    volatility: 0.022,
    annualReturn: 0.16, // 16.0% annual expected return (AI enterprise drift)
    annualVolatility: 0.3492, // 34.92% annualized volatility (0.022 * sqrt(252))
    fundamentals: {
      marketCap: '120.0B',
      peRatio: 34.2,
      profitMargin: '26.8%',
      revenueGrowth: '+35.1%',
      dividendYield: '0.4%'
    },
    description: 'Enterprise AI computing and distributed cloud architectures powering modern intelligent automation.'
  },
  {
    symbol: 'NBNK',
    name: 'National Bank',
    mark: 'NB',
    sector: 'Banking · Treasury',
    basePrice: 620,
    price: 620,
    openPrice: 620,
    highPrice: 620,
    lowPrice: 620,
    previousClose: 620,
    intrinsicValue: 620,
    sentiment: 0,
    volatility: 0.010,
    annualReturn: 0.06, // 6.0% annual expected return (defensive banking dividend drift)
    annualVolatility: 0.1587, // 15.87% annualized volatility (0.010 * sqrt(252))
    fundamentals: {
      marketCap: '62.0B',
      peRatio: 11.2,
      profitMargin: '18.0%',
      revenueGrowth: '+7.5%',
      dividendYield: '4.2%'
    },
    description: 'Established financial institution with deep treasury reserves, institutional lending, and payments.'
  },
  {
    symbol: 'MEDL',
    name: 'MedLife',
    mark: 'ME',
    sector: 'Biotech · Pharma',
    basePrice: 890,
    price: 890,
    openPrice: 890,
    highPrice: 890,
    lowPrice: 890,
    previousClose: 890,
    intrinsicValue: 890,
    sentiment: 0,
    volatility: 0.018,
    annualReturn: 0.10, // 10.0% annual expected return (biopharmaceutical drift)
    annualVolatility: 0.2857, // 28.57% annualized volatility (0.018 * sqrt(252))
    fundamentals: {
      marketCap: '89.0B',
      peRatio: 22.0,
      profitMargin: '19.4%',
      revenueGrowth: '+16.2%',
      dividendYield: '1.5%'
    },
    description: 'Clinical-stage pharmaceutical leader developing targeted immuno-therapeutics and precision genomics.'
  },
  {
    symbol: 'AERO',
    name: 'AeroDynamics Inc.',
    mark: 'AE',
    sector: 'Aerospace · Defense',
    basePrice: 740,
    price: 740,
    openPrice: 740,
    highPrice: 740,
    lowPrice: 740,
    previousClose: 740,
    intrinsicValue: 740,
    sentiment: 0.05,
    volatility: 0.016,
    annualReturn: 0.11, // 11.0% annual expected return (defense procurement drift)
    annualVolatility: 0.2540, // 25.40% annualized volatility (0.016 * sqrt(252))
    fundamentals: {
      marketCap: '74.0B',
      peRatio: 19.8,
      profitMargin: '11.5%',
      revenueGrowth: '+14.2%',
      dividendYield: '1.8%'
    },
    description: 'Defense prime contractor developing autonomous avionics, hypersonics, and next-generation orbital satellite networks.'
  },
  {
    symbol: 'SEMI',
    name: 'NovaSilicon Technologies',
    mark: 'NS',
    sector: 'Semiconductors · Hardware',
    basePrice: 960,
    price: 960,
    openPrice: 960,
    highPrice: 960,
    lowPrice: 960,
    previousClose: 960,
    intrinsicValue: 960,
    sentiment: 0.15,
    volatility: 0.024,
    annualReturn: 0.17, // 17.0% annual expected return (AI semiconductor foundry drift)
    annualVolatility: 0.3810, // 38.10% annualized volatility (0.024 * sqrt(252))
    fundamentals: {
      marketCap: '96.0B',
      peRatio: 31.4,
      profitMargin: '29.1%',
      revenueGrowth: '+38.5%',
      dividendYield: '0.5%'
    },
    description: 'Global semiconductor powerhouse fabricating 2nm extreme-ultraviolet (EUV) microprocessors and specialized AI accelerators.'
  },
  {
    symbol: 'RETL',
    name: 'OmniRetail Global',
    mark: 'OR',
    sector: 'Retail · E-Commerce',
    basePrice: 310,
    price: 310,
    openPrice: 310,
    highPrice: 310,
    lowPrice: 310,
    previousClose: 310,
    intrinsicValue: 310,
    sentiment: 0,
    volatility: 0.014,
    annualReturn: 0.07, // 7.0% annual expected return (consumer staple growth drift)
    annualVolatility: 0.2222, // 22.22% annualized volatility (0.014 * sqrt(252))
    fundamentals: {
      marketCap: '31.0B',
      peRatio: 14.8,
      profitMargin: '6.4%',
      revenueGrowth: '+9.1%',
      dividendYield: '2.8%'
    },
    description: 'Omnichannel consumer retail network with automated fulfillment centers, direct-to-consumer logistics, and subscription services.'
  },
  {
    symbol: 'CYBR',
    name: 'CipherShield Security',
    mark: 'CS',
    sector: 'Cybersecurity · GovTech',
    basePrice: 530,
    price: 530,
    openPrice: 530,
    highPrice: 530,
    lowPrice: 530,
    previousClose: 530,
    intrinsicValue: 530,
    sentiment: 0.1,
    volatility: 0.021,
    annualReturn: 0.15, // 15.0% annual expected return (zero-trust enterprise drift)
    annualVolatility: 0.3334, // 33.34% annualized volatility (0.021 * sqrt(252))
    fundamentals: {
      marketCap: '53.0B',
      peRatio: 36.5,
      profitMargin: '21.0%',
      revenueGrowth: '+27.4%',
      dividendYield: '0.2%'
    },
    description: 'Zero-trust enterprise cybersecurity suite safeguarding critical infrastructure, cloud pipelines, and federal intelligence datacenters.'
  },
  {
    symbol: 'STRM',
    name: 'StreamPulse Entertainment',
    mark: 'SP',
    sector: 'Digital Media · Streaming',
    basePrice: 195,
    price: 195,
    openPrice: 195,
    highPrice: 195,
    lowPrice: 195,
    previousClose: 195,
    intrinsicValue: 195,
    sentiment: -0.05,
    volatility: 0.026,
    annualReturn: 0.12, // 12.0% annual expected return (streaming subscriber drift)
    annualVolatility: 0.4127, // 41.27% annualized volatility (0.026 * sqrt(252))
    fundamentals: {
      marketCap: '19.5B',
      peRatio: 24.2,
      profitMargin: '12.3%',
      revenueGrowth: '+19.6%',
      dividendYield: '0.0%'
    },
    description: 'Next-generation streaming media and interactive entertainment platform with 180M global active subscribers.'
  }
];

export const ASSET_CORRELATION_SYMBOLS = [
  'AUTO', 'SOLR', 'BYTE', 'NBNK', 'MEDL', 'AERO', 'SEMI', 'RETL', 'CYBR', 'STRM'
];

export const ASSET_CORRELATION_MATRIX = [
  [1.00, 0.58, 0.22, 0.12, 0.15, 0.25, 0.35, 0.28, 0.20, 0.18],
  [0.58, 1.00, 0.25,-0.10, 0.14, 0.20, 0.30, 0.22, 0.22, 0.15],
  [0.22, 0.25, 1.00,-0.15, 0.12, 0.22, 0.70, 0.25, 0.62, 0.38],
  [0.12,-0.10,-0.15, 1.00, 0.18, 0.20,-0.12, 0.18, 0.10, 0.08],
  [0.15, 0.14, 0.12, 0.18, 1.00, 0.18, 0.15, 0.14, 0.16, 0.12],
  [0.25, 0.20, 0.22, 0.20, 0.18, 1.00, 0.32, 0.18, 0.56, 0.15],
  [0.35, 0.30, 0.70,-0.12, 0.15, 0.32, 1.00, 0.24, 0.55, 0.30],
  [0.28, 0.22, 0.25, 0.18, 0.14, 0.18, 0.24, 1.00, 0.20, 0.45],
  [0.20, 0.22, 0.62, 0.10, 0.16, 0.56, 0.55, 0.20, 1.00, 0.28],
  [0.18, 0.15, 0.38, 0.08, 0.12, 0.15, 0.30, 0.45, 0.28, 1.00]
];

export const NEWS_EVENTS_POOL = [
  {
    headline: 'Government announces multi-billion solar subsidy & green grid modernization',
    symbols: ['SOLR'],
    impact: { SOLR: 0.08 },
    sentiment: 'BULLISH',
    isRumor: false
  },
  {
    headline: 'ByteWorks announces breakthrough in quantum-assisted enterprise neural network',
    symbols: ['BYTE'],
    impact: { BYTE: 0.07 },
    sentiment: 'BULLISH',
    isRumor: false
  },
  {
    headline: 'Central Bank unexpectedly signals interest rate hike to tame inflation',
    symbols: ['NBNK', 'BYTE', 'AUTO'],
    impact: { NBNK: 0.04, BYTE: -0.05, AUTO: -0.03 },
    sentiment: 'MIXED',
    isRumor: false
  },
  {
    headline: 'SolarGen reports unexpected manufacturing supply chain delay at primary plant',
    symbols: ['SOLR'],
    impact: { SOLR: -0.06 },
    sentiment: 'BEARISH',
    isRumor: false
  },
  {
    headline: 'AutoCorp unveils solid-state EV battery pack delivering 1,000 km real-world range',
    symbols: ['AUTO'],
    impact: { AUTO: 0.09 },
    sentiment: 'BULLISH',
    isRumor: false
  },
  {
    headline: 'RUMOR: Global tech conglomerate exploring takeover bid for ByteWorks at 25% premium',
    symbols: ['BYTE'],
    impact: { BYTE: 0.06 },
    sentiment: 'BULLISH',
    isRumor: true
  },
  {
    headline: 'MedLife announces successful Phase 3 trials for breakthrough oncology therapy',
    symbols: ['MEDL'],
    impact: { MEDL: 0.11 },
    sentiment: 'BULLISH',
    isRumor: false
  },
  {
    headline: 'RUMOR: National Bank investigating suspected exposure to defaulted overseas debt',
    symbols: ['NBNK'],
    impact: { NBNK: -0.04 },
    sentiment: 'BEARISH',
    isRumor: true
  },
  {
    headline: 'Global semiconductor shortage temporarily stalls AutoCorp assembly lines',
    symbols: ['AUTO'],
    impact: { AUTO: -0.05 },
    sentiment: 'BEARISH',
    isRumor: false
  },
  {
    headline: 'MedLife patent dispute settled favorably with recurring licensing royalty stream',
    symbols: ['MEDL'],
    impact: { MEDL: 0.05 },
    sentiment: 'BULLISH',
    isRumor: false
  }
];

export class MarketManager extends EventEmitter {
  constructor(clock, matchingEngine) {
    super();
    this.clock = clock;
    this.matchingEngine = matchingEngine;
    this.companies = new Map();

    // Multi-timeframe candlestick support
    this.timeframes = ['1s', '5s', '15s', '1m', '5m'];
    this.timeframeSecs = {
      '1s': 1,
      '5s': 5,
      '15s': 15,
      '1m': 60,
      '5m': 300
    };
    this.candleBuffers = new Map(); // timeframe -> Map<symbol, Array<Candle>>
    this.activeCandles = new Map(); // timeframe -> Map<symbol, Candle>
    for (const tf of this.timeframes) {
      this.candleBuffers.set(tf, new Map());
      this.activeCandles.set(tf, new Map());
    }

    // Backwards compatibility mappings (defaults to '5s')
    this.candles = new Map(); // symbol -> Array of { time, open, high, low, close, volume }
    this.currentCandles = new Map(); // symbol -> active candle
    this.newsFeed = [];
    this.tradesHistory = [];
    this.maxTradesHistory = 80;
    this.newsTimer = null;

    // Geometric Brownian Motion (GBM) Price Discovery Engine
    this.gbmEnabled = true;
    this.regimeMultiplier = 1.0;
    this._spareNormal = null;
    this._hasSpareNormal = false;

    // News Impact Decay System (Spike-and-Settle Pattern)
    this.activeNewsDecays = [];
    this.newsDecayDurationSec = 30; // 30-second exponential digestion horizon

    // Multi-Asset Cholesky Decomposition Correlation Engine
    this.correlationSymbols = [...ASSET_CORRELATION_SYMBOLS];
    this.correlationMatrix = ASSET_CORRELATION_MATRIX.map(r => [...r]);
    this.choleskyMatrix = this._computeCholesky(this.correlationMatrix);

    // Dynamic Simulation World News Engine
    this.simulationNews = new SimulationWorldNewsEngine(this);

    this._initializeCompanies();
    this._bindEngineEvents();
    this._bindClockEvents();
  }

  _initializeCompanies() {
    const nowSec = Math.floor(Date.now() / 1000);
    const starterCounts = {
      '1s': 60,
      '5s': 45,
      '15s': 30,
      '1m': 20,
      '5m': 15
    };

    for (const comp of INITIAL_COMPANIES) {
      this.companies.set(comp.symbol, {
        ...comp,
        volume: 0,
        tradesCount: 0,
        lastTradeTimeSec: nowSec,
        gbmHistory: { ticks: 0, cumulativeDrift: 1.0 }
      });

      let latestClose = comp.basePrice;

      // Generate historical starter series for all supported resolutions
      for (const tf of this.timeframes) {
        const interval = this.timeframeSecs[tf];
        const count = starterCounts[tf] || 30;
        const starterList = [];
        let p = comp.basePrice;

        for (let i = count; i >= 1; i--) {
          const cTime = nowSec - (i * interval);
          const delta = (Math.random() - 0.5) * (comp.basePrice * comp.volatility * (0.5 + Math.sqrt(interval / 5)));
          const open = +(p).toFixed(2);
          const close = +(p + delta).toFixed(2);
          const high = +(Math.max(open, close) + Math.random() * (comp.basePrice * 0.003 * Math.sqrt(interval))).toFixed(2);
          const low = +(Math.min(open, close) - Math.random() * (comp.basePrice * 0.003 * Math.sqrt(interval))).toFixed(2);
          starterList.push({
            time: cTime,
            open,
            high,
            low,
            close,
            volume: Math.floor((Math.random() * 200 + 20) * Math.max(1, interval / 5))
          });
          p = close;
        }

        this.candleBuffers.get(tf).set(comp.symbol, starterList);
        const last = starterList[starterList.length - 1];
        this.activeCandles.get(tf).set(comp.symbol, {
          time: nowSec,
          open: last.close,
          high: last.close,
          low: last.close,
          close: last.close,
          volume: 0
        });

        if (tf === '5s') latestClose = last.close;
      }

      // Populate default 5s pointers for backwards compatibility
      this.candles.set(comp.symbol, this.candleBuffers.get('5s').get(comp.symbol));
      this.currentCandles.set(comp.symbol, this.activeCandles.get('5s').get(comp.symbol));

      const c = this.companies.get(comp.symbol);
      c.price = latestClose;
      c.openPrice = latestClose;
      c.highPrice = Math.max(...this.candles.get(comp.symbol).map(x => x.high));
      c.lowPrice = Math.min(...this.candles.get(comp.symbol).map(x => x.low));
    }
  }

  _bindEngineEvents() {
    this.matchingEngine.on('trade', (trade) => {
      this._handleTrade(trade);
    });
  }

  _bindClockEvents() {
    this.clock.on('bellRing', ({ bell, day }) => {
      if (bell === 'OPENING_BELL') {
        this.emit('news', {
          id: `news_${Date.now()}`,
          headline: `OPENING BELL — Regular trading session for Day ${day} is now open.`,
          symbols: Array.from(this.companies.keys()),
          sentiment: 'NEUTRAL',
          isRumor: false,
          timestamp: Date.now()
        });
        this._startNewsGenerator();
      } else if (bell === 'CLOSING_BELL') {
        this.emit('news', {
          id: `news_${Date.now()}`,
          headline: `CLOSING BELL — Trading session for Day ${day} has closed. Order matching halted for settlement.`,
          symbols: Array.from(this.companies.keys()),
          sentiment: 'NEUTRAL',
          isRumor: false,
          timestamp: Date.now()
        });
        this._stopNewsGenerator();
      }
    });

    this.clock.on('newDay', ({ day }) => {
      // Set previousClose to current price for new day
      for (const comp of this.companies.values()) {
        comp.previousClose = comp.price;
        comp.openPrice = comp.price;
        comp.highPrice = comp.price;
        comp.lowPrice = comp.price;
        comp.volume = 0;
      }
      this.emit('companiesUpdate', this.getAllCompanies());
    });

    // Multi-timeframe 1-second tick evaluator, GBM price discovery, and news impact decay
    setInterval(() => {
      this._tickCandles();
      if (this.clock && this.clock.isTradingOpen()) {
        this._tickGBM();
        this._tickNewsDecay();
      }
    }, 1000);
  }

  _startNewsGenerator() {
    if (this.newsTimer) clearInterval(this.newsTimer);
    // News fires every 35-55 seconds
    const scheduleNext = () => {
      const delay = Math.floor(Math.random() * 20000 + 35000);
      this.newsTimer = setTimeout(() => {
        if (this.clock.isTradingOpen()) {
          this.triggerRandomEvent();
          scheduleNext();
        }
      }, delay);
    };
    scheduleNext();
  }

  _stopNewsGenerator() {
    if (this.newsTimer) {
      clearTimeout(this.newsTimer);
      this.newsTimer = null;
    }
  }

  triggerRandomEvent() {
    // Interleave procedural simulation world events with foundational event pool
    if (this.simulationNews && Math.random() < 0.60) {
      const worldEvent = this.simulationNews.generateWorldEvent();
      return this.triggerNewsEvent(worldEvent);
    }
    const eventTemplate = NEWS_EVENTS_POOL[Math.floor(Math.random() * NEWS_EVENTS_POOL.length)];
    return this.triggerNewsEvent(eventTemplate);
  }

  /**
   * Triggers a news event with an immediate overreaction spike followed by
   * scheduled exponential decay back to a permanent residual level.
   */
  triggerNewsEvent(eventTemplate) {
    const event = {
      id: eventTemplate.id || `news_${Date.now()}`,
      headline: eventTemplate.headline,
      symbols: eventTemplate.symbols,
      sentiment: eventTemplate.sentiment,
      isRumor: Boolean(eventTemplate.isRumor),
      impact: eventTemplate.impact || {},
      timestamp: eventTemplate.timestamp || Date.now()
    };

    // Realistic behavior: Rumors induce higher speculative frenzy (1.6x) and sharp decay (30% residual)
    // Confirmed news induces 1.4x overreaction settling to 55% permanent fundamental shift
    const overshootMultiplier = event.isRumor ? 1.60 : 1.40;
    const residualRatio = event.isRumor ? 0.30 : 0.55;

    // Apply immediate overreaction spike and register active decay tracker
    for (const [sym, rawFactor] of Object.entries(event.impact)) {
      const comp = this.companies.get(sym);
      if (!comp) continue;

      const initialShockFactor = rawFactor * overshootMultiplier;
      const residualFactor = rawFactor * residualRatio;
      const logDecayTarget = Math.log((1 + residualFactor) / (1 + initialShockFactor));

      const initialSentimentShock = rawFactor * 5 * overshootMultiplier;
      const residualSentiment = rawFactor * 5 * residualRatio;
      const excessSentiment = initialSentimentShock - residualSentiment;

      // Apply initial overreaction spike immediately
      comp.intrinsicValue = +(comp.intrinsicValue * (1 + initialShockFactor)).toFixed(2);
      if (comp.intrinsicValue < 1.00) comp.intrinsicValue = 1.00;
      comp.sentiment = Math.max(-1, Math.min(1, +(comp.sentiment + initialSentimentShock).toFixed(2)));

      // Register decay tracker to digest the excess overreaction over newsDecayDurationSec
      this.activeNewsDecays.push({
        id: `${event.id}_${sym}_${Date.now()}`,
        newsId: event.id,
        symbol: sym,
        rawFactor,
        overshootMultiplier,
        residualRatio,
        logDecayTarget,
        excessSentiment,
        durationSec: this.newsDecayDurationSec,
        elapsedSec: 0,
        prevAlpha: 1.0
      });
    }

    this.newsFeed.unshift(event);
    if (this.newsFeed.length > 30) this.newsFeed.pop();

    this.emit('news', event);
    this.emit('companiesUpdate', this.getAllCompanies());
    return event;
  }

  _handleTrade(trade) {
    const comp = this.companies.get(trade.symbol);
    if (!comp) return;

    comp.lastTradeTimeSec = Math.floor(Date.now() / 1000);
    comp.price = trade.price;
    if (trade.isAuction || comp.tradesCount === 0) {
      comp.openPrice = trade.price;
    }
    comp.volume += trade.quantity;
    comp.tradesCount++;
    if (comp.highPrice === null || trade.price > comp.highPrice) comp.highPrice = trade.price;
    if (comp.lowPrice === null || trade.price < comp.lowPrice) comp.lowPrice = trade.price;

    // Update active candles across all timeframe resolutions
    for (const tf of this.timeframes) {
      const tfActiveMap = this.activeCandles.get(tf);
      if (tfActiveMap) {
        const activeCandle = tfActiveMap.get(trade.symbol);
        if (activeCandle) {
          activeCandle.close = trade.price;
          activeCandle.high = Math.max(activeCandle.high, trade.price);
          activeCandle.low = Math.min(activeCandle.low, trade.price);
          activeCandle.volume += trade.quantity;
        }
      }
    }

    // Add to trade history feed
    this.tradesHistory.unshift(trade);
    if (this.tradesHistory.length > this.maxTradesHistory) {
      this.tradesHistory.pop();
    }

    this.emit('trade', trade);
    this.emit('priceUpdate', {
      symbol: comp.symbol,
      price: comp.price,
      change: +(comp.price - comp.previousClose).toFixed(2),
      changePercent: +(((comp.price - comp.previousClose) / comp.previousClose) * 100).toFixed(2),
      high: comp.highPrice,
      low: comp.lowPrice,
      volume: comp.volume
    });
  }

  _tickCandles() {
    const nowSec = Math.floor(Date.now() / 1000);

    for (const tf of this.timeframes) {
      const tfSec = this.timeframeSecs[tf];
      const tfActiveMap = this.activeCandles.get(tf);
      const tfBuffers = this.candleBuffers.get(tf);
      if (!tfActiveMap || !tfBuffers) continue;

      for (const [sym, active] of tfActiveMap.entries()) {
        if (nowSec - active.time >= tfSec) {
          const buffer = tfBuffers.get(sym);
          if (buffer) {
            buffer.push({ ...active });
            if (buffer.length > 200) buffer.shift();
          }

          tfActiveMap.set(sym, {
            time: nowSec,
            open: active.close,
            high: active.close,
            low: active.close,
            close: active.close,
            volume: 0
          });
        }
      }
    }

    // Synchronize default 5s backward-compatible references
    const defBuffers = this.candleBuffers.get('5s');
    const defActives = this.activeCandles.get('5s');
    if (defBuffers && defActives) {
      for (const [sym, active] of defActives.entries()) {
        this.currentCandles.set(sym, active);
        this.candles.set(sym, defBuffers.get(sym));
      }
    }
  }

  setRegimeMultiplier(multiplier) {
    this.regimeMultiplier = typeof multiplier === 'number' && multiplier > 0 ? multiplier : 1.0;
  }

  /**
   * Box-Muller transformation generating standard normal random variates Z ~ N(0, 1)
   */
  _randomNormal() {
    if (this._hasSpareNormal) {
      this._hasSpareNormal = false;
      return this._spareNormal;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const mag = Math.sqrt(-2.0 * Math.log(u));
    this._spareNormal = mag * Math.sin(2.0 * Math.PI * v);
    this._hasSpareNormal = true;
    return mag * Math.cos(2.0 * Math.PI * v);
  }

  /**
   * Continuous Geometric Brownian Motion (GBM) price discovery tick
   * S(t + dt) = S(t) * exp((mu - 0.5 * sigma^2) * dt + sigma * dW)
   * where dW = Z * sqrt(dt), Z ~ N(0, 1)
   */
  _tickGBM(customDt = null) {
    if (!this.gbmEnabled) return;
    if (this.clock && !this.clock.isTradingOpen() && !customDt) return;

    const sessionDurationSec = (this.clock && this.clock.durations && this.clock.durations.REGULAR_HOURS) || 180;
    const dt = customDt || (1 / (252 * sessionDurationSec));
    const sqrtDt = Math.sqrt(dt);
    const nowSec = Math.floor(Date.now() / 1000);
    const priceUpdates = [];

    // Generate correlated Wiener increments via Cholesky decomposition
    const correlatedShocks = this.getCorrelatedShocks();

    for (const comp of this.companies.values()) {
      const annualReturn = comp.annualReturn ?? 0.08;
      const baseVol = comp.annualVolatility ?? (comp.volatility * Math.sqrt(252));
      const annualVol = baseVol * (this.regimeMultiplier || 1.0);

      const z = correlatedShocks[comp.symbol] !== undefined ? correlatedShocks[comp.symbol] : this._randomNormal();
      const dW = z * sqrtDt;

      const drift = (annualReturn - 0.5 * annualVol * annualVol) * dt;
      const diffusion = annualVol * dW;
      const gbmMultiplier = Math.exp(drift + diffusion);

      comp.intrinsicValue = +(comp.intrinsicValue * gbmMultiplier).toFixed(2);
      if (comp.intrinsicValue < 1.00) comp.intrinsicValue = 1.00;

      if (!comp.gbmHistory) {
        comp.gbmHistory = { ticks: 0, cumulativeDrift: 1.0 };
      }
      comp.gbmHistory.ticks++;
      comp.gbmHistory.cumulativeDrift *= gbmMultiplier;

      // Soft mean-reversion drift during quiet trading intervals (>= 3s without a trade fill)
      const secondsSinceTrade = nowSec - (comp.lastTradeTimeSec || nowSec);
      if (secondsSinceTrade >= 3) {
        const gap = comp.intrinsicValue - comp.price;
        const softPull = +(gap * 0.05).toFixed(2);
        if (Math.abs(softPull) >= 0.01) {
          comp.price = +(comp.price + softPull).toFixed(2);
          if (comp.highPrice === null || comp.price > comp.highPrice) comp.highPrice = comp.price;
          if (comp.lowPrice === null || comp.price < comp.lowPrice) comp.lowPrice = comp.price;

          for (const tf of this.timeframes) {
            const tfActiveMap = this.activeCandles.get(tf);
            if (tfActiveMap) {
              const activeCandle = tfActiveMap.get(comp.symbol);
              if (activeCandle) {
                activeCandle.close = comp.price;
                activeCandle.high = Math.max(activeCandle.high, comp.price);
                activeCandle.low = Math.min(activeCandle.low, comp.price);
              }
            }
          }

          priceUpdates.push({
            symbol: comp.symbol,
            price: comp.price,
            change: +(comp.price - comp.previousClose).toFixed(2),
            changePercent: +(((comp.price - comp.previousClose) / comp.previousClose) * 100).toFixed(2),
            high: comp.highPrice,
            low: comp.lowPrice,
            volume: comp.volume
          });
        }
      }
    }

    for (const update of priceUpdates) {
      this.emit('priceUpdate', update);
    }
    if (priceUpdates.length > 0) {
      this.emit('companiesUpdate', this.getAllCompanies());
    }
  }

  /**
   * Programmatic / test step runner for GBM simulation
   */
  stepGBM(dt = null) {
    this._tickGBM(dt);
  }

  /**
   * Analytical Cholesky Factorization algorithm: Sigma = L * L^T
   * Decomposes a symmetric positive-definite matrix into lower triangular factor L.
   * @param {Array<Array<number>>} matrix
   * @returns {Array<Array<number>>} Lower-triangular Cholesky factor L
   */
  _computeCholesky(matrix) {
    const n = matrix.length;
    const L = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = 0;
        for (let k = 0; k < j; k++) {
          s += L[i][k] * L[j][k];
        }
        if (i === j) {
          const val = matrix[i][i] - s;
          L[i][j] = Math.sqrt(Math.max(0.000001, val));
        } else {
          L[i][j] = (matrix[i][j] - s) / L[j][j];
        }
      }
    }
    return L;
  }

  /**
   * Generates a vector of correlated standard normal shocks across all listed equities
   * eps = L * Z where Z ~ N(0, I) and Cov(eps) = Sigma
   * @returns {Object} symbol -> shock value
   */
  getCorrelatedShocks() {
    const n = this.correlationSymbols.length;
    const z = [];
    for (let i = 0; i < n; i++) {
      z.push(this._randomNormal());
    }
    const eps = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j <= i; j++) {
        s += this.choleskyMatrix[i][j] * z[j];
      }
      eps[i] = s;
    }
    const shockMap = {};
    for (let i = 0; i < n; i++) {
      shockMap[this.correlationSymbols[i]] = eps[i];
    }
    return shockMap;
  }

  /**
   * Query the underlying asset correlation matrix
   */
  getCorrelationMatrix() {
    return {
      symbols: [...this.correlationSymbols],
      matrix: this.correlationMatrix.map(r => [...r])
    };
  }

  /**
   * Query the lower-triangular Cholesky factor matrix
   */
  getCholeskyMatrix() {
    return {
      symbols: [...this.correlationSymbols],
      matrix: this.choleskyMatrix.map(r => [...r])
    };
  }

  /**
   * Evaluates exponential digestion of active news overreactions
   * alpha(tau) = (exp(-3 * tau) - exp(-3)) / (1 - exp(-3)), tau in [0, 1]
   */
  _tickNewsDecay() {
    if (this.activeNewsDecays.length === 0) return;

    const remainingDecays = [];
    const exp3 = Math.exp(-3.0);
    const denom = 1.0 - exp3;
    let companiesUpdated = false;

    for (const decay of this.activeNewsDecays) {
      const comp = this.companies.get(decay.symbol);
      if (!comp) continue;

      decay.elapsedSec++;
      const progress = Math.min(1.0, decay.elapsedSec / decay.durationSec);
      // Normalized exponential decay curve reaching strictly 0 at progress = 1.0
      const currentAlpha = progress >= 1.0 ? 0.0 : (Math.exp(-3.0 * progress) - exp3) / denom;
      const deltaAlpha = currentAlpha - decay.prevAlpha; // Negative value representing step decay
      decay.prevAlpha = currentAlpha;

      if (Math.abs(deltaAlpha) > 0.000001) {
        // Step multiplier via log-decay strictly converging to residual
        const stepMultiplier = Math.exp(-decay.logDecayTarget * deltaAlpha);
        comp.intrinsicValue = +(comp.intrinsicValue * stepMultiplier).toFixed(2);
        if (comp.intrinsicValue < 1.00) comp.intrinsicValue = 1.00;

        // Apply decay to sentiment
        const stepSentimentDelta = decay.excessSentiment * deltaAlpha;
        comp.sentiment = Math.max(-1, Math.min(1, +(comp.sentiment + stepSentimentDelta).toFixed(2)));

        companiesUpdated = true;
      }

      if (decay.elapsedSec < decay.durationSec) {
        remainingDecays.push(decay);
      }
    }

    this.activeNewsDecays = remainingDecays;
    if (companiesUpdated) {
      this.emit('companiesUpdate', this.getAllCompanies());
    }
  }

  /**
   * Programmatic step runner for active news decays
   */
  stepNewsDecay() {
    this._tickNewsDecay();
  }

  getActiveNewsDecays() {
    return [...this.activeNewsDecays];
  }

  getCompany(symbol) {
    const c = this.companies.get(symbol);
    if (!c) return null;
    const change = +(c.price - c.previousClose).toFixed(2);
    const changePercent = +(((c.price - c.previousClose) / c.previousClose) * 100).toFixed(2);
    return {
      ...c,
      change,
      changePercent
    };
  }

  getAllCompanies() {
    return Array.from(this.companies.values()).map(c => {
      const change = +(c.price - c.previousClose).toFixed(2);
      const changePercent = +(((c.price - c.previousClose) / c.previousClose) * 100).toFixed(2);
      return {
        ...c,
        change,
        changePercent
      };
    });
  }

  getCurrentPrices() {
    const prices = {};
    for (const [sym, c] of this.companies.entries()) {
      prices[sym] = c.price;
    }
    return prices;
  }

  getCandles(symbol, timeframe = '5s') {
    const tf = this.timeframes.includes(timeframe) ? timeframe : '5s';
    const buffer = (this.candleBuffers.get(tf) && this.candleBuffers.get(tf).get(symbol)) || [];
    const active = this.activeCandles.get(tf) && this.activeCandles.get(tf).get(symbol);
    return active ? [...buffer, active] : buffer;
  }

  getRecentTrades() {
    return this.tradesHistory;
  }

  getNewsFeed() {
    return this.newsFeed;
  }

  /**
   * Summarize day performance across all listed stocks
   */
  getDayPerformance() {
    const list = this.getAllCompanies();
    list.sort((a, b) => b.changePercent - a.changePercent);
    const topGainer = list[0] || null;
    const topLoser = list[list.length - 1] || null;
    let totalVolume = 0;
    for (const c of list) {
      totalVolume += c.volume;
    }
    return {
      topGainer: topGainer ? { symbol: topGainer.symbol, name: topGainer.name, change: topGainer.change, changePercent: topGainer.changePercent } : null,
      topLoser: topLoser ? { symbol: topLoser.symbol, name: topLoser.name, change: topLoser.change, changePercent: topLoser.changePercent } : null,
      totalVolume,
      companies: list
    };
  }
}
