import { EventEmitter } from 'events';

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
    fundamentals: {
      marketCap: '89.0B',
      peRatio: 22.0,
      profitMargin: '19.4%',
      revenueGrowth: '+16.2%',
      dividendYield: '1.5%'
    },
    description: 'Clinical-stage pharmaceutical leader developing targeted immuno-therapeutics and precision genomics.'
  }
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
    this.candles = new Map(); // symbol -> Array of { time, open, high, low, close, volume }
    this.currentCandles = new Map(); // symbol -> active candle
    this.newsFeed = [];
    this.tradesHistory = [];
    this.maxTradesHistory = 80;
    this.newsTimer = null;

    this._initializeCompanies();
    this._bindEngineEvents();
    this._bindClockEvents();
  }

  _initializeCompanies() {
    const nowSec = Math.floor(Date.now() / 1000);
    for (const comp of INITIAL_COMPANIES) {
      this.companies.set(comp.symbol, {
        ...comp,
        volume: 0,
        tradesCount: 0
      });

      // Initialize with historical starter candles
      const starterCandles = [];
      let p = comp.basePrice;
      const totalStarter = 30;
      for (let i = totalStarter; i >= 1; i--) {
        const cTime = nowSec - (i * 10);
        const delta = (Math.random() - 0.5) * (comp.basePrice * comp.volatility * 0.8);
        const open = +(p).toFixed(2);
        const close = +(p + delta).toFixed(2);
        const high = +(Math.max(open, close) + Math.random() * (comp.basePrice * 0.005)).toFixed(2);
        const low = +(Math.min(open, close) - Math.random() * (comp.basePrice * 0.005)).toFixed(2);
        starterCandles.push({
          time: cTime,
          open,
          high,
          low,
          close,
          volume: Math.floor(Math.random() * 200 + 20)
        });
        p = close;
      }

      this.candles.set(comp.symbol, starterCandles);
      const lastCandle = starterCandles[starterCandles.length - 1];
      this.currentCandles.set(comp.symbol, {
        time: nowSec,
        open: lastCandle.close,
        high: lastCandle.close,
        low: lastCandle.close,
        close: lastCandle.close,
        volume: 0
      });
      const c = this.companies.get(comp.symbol);
      c.price = lastCandle.close;
      c.openPrice = lastCandle.close;
      c.highPrice = Math.max(...starterCandles.map(x => x.high));
      c.lowPrice = Math.min(...starterCandles.map(x => x.low));
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

    // 5-second candle roll
    setInterval(() => {
      this._rollCandles();
    }, 5000);
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
    const eventTemplate = NEWS_EVENTS_POOL[Math.floor(Math.random() * NEWS_EVENTS_POOL.length)];
    const event = {
      id: `news_${Date.now()}`,
      headline: eventTemplate.headline,
      symbols: eventTemplate.symbols,
      sentiment: eventTemplate.sentiment,
      isRumor: eventTemplate.isRumor,
      timestamp: Date.now()
    };

    // Apply sentiment and intrinsic value shift
    for (const [sym, factor] of Object.entries(eventTemplate.impact)) {
      const comp = this.companies.get(sym);
      if (comp) {
        comp.intrinsicValue = +(comp.intrinsicValue * (1 + factor)).toFixed(2);
        comp.sentiment = Math.max(-1, Math.min(1, +(comp.sentiment + factor * 5).toFixed(2)));
      }
    }

    this.newsFeed.unshift(event);
    if (this.newsFeed.length > 30) this.newsFeed.pop();

    this.emit('news', event);
    this.emit('companiesUpdate', this.getAllCompanies());
  }

  _handleTrade(trade) {
    const comp = this.companies.get(trade.symbol);
    if (!comp) return;

    comp.price = trade.price;
    comp.volume += trade.quantity;
    comp.tradesCount++;
    if (comp.highPrice === null || trade.price > comp.highPrice) comp.highPrice = trade.price;
    if (comp.lowPrice === null || trade.price < comp.lowPrice) comp.lowPrice = trade.price;

    // Update active candle
    const activeCandle = this.currentCandles.get(trade.symbol);
    if (activeCandle) {
      activeCandle.close = trade.price;
      activeCandle.high = Math.max(activeCandle.high, trade.price);
      activeCandle.low = Math.min(activeCandle.low, trade.price);
      activeCandle.volume += trade.quantity;
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

  _rollCandles() {
    const nowSec = Math.floor(Date.now() / 1000);
    for (const [sym, active] of this.currentCandles.entries()) {
      const candlesList = this.candles.get(sym);
      if (!candlesList) continue;

      candlesList.push({ ...active });
      if (candlesList.length > 200) candlesList.shift();

      // Start new candle from previous close
      this.currentCandles.set(sym, {
        time: nowSec,
        open: active.close,
        high: active.close,
        low: active.close,
        close: active.close,
        volume: 0
      });
    }
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

  getCandles(symbol) {
    const list = this.candles.get(symbol) || [];
    const active = this.currentCandles.get(symbol);
    return active ? [...list, active] : list;
  }

  getRecentTrades() {
    return this.tradesHistory;
  }

  getNewsFeed() {
    return this.newsFeed;
  }
}
