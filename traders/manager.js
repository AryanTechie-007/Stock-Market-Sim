import { MarketMaker } from './market-maker.js';
import { MomentumTrader } from './momentum.js';
import { ValueInvestor } from './value-investor.js';
import { NoiseTrader } from './noise.js';
import { StatisticalArbitrageTrader } from './arbitrage.js';
import { IcebergWhaleTrader } from './iceberg.js';
import { ScalperTrader } from './scalper.js';
import { NewsReactorTrader } from './news-reactor.js';
import { SpoofingTrader } from './spoofer.js';

export class NPCManager {
  constructor(matchingEngine, marketManager, accountManager, clock, regimeEngine = null) {
    this.matchingEngine = matchingEngine;
    this.marketManager = marketManager;
    this.accountManager = accountManager;
    this.clock = clock;
    this.regimeEngine = regimeEngine;
    this.traders = [];

    this._setupTraders();
    this._bindEvents();
  }

  _bindEvents() {
    this.marketManager.on('news', (newsItem) => {
      this.broadcastNews(newsItem);
    });

    if (this.regimeEngine) {
      this.regimeEngine.on('regimeChange', (regime) => {
        this.broadcastRegime(regime);
      });
    }

    if (this.clock) {
      this.clock.on('phaseChange', (state) => {
        if (state.phase === 'PRE_MARKET') {
          this.seedPreMarketAuctionOrders();
        }
      });
    }
  }

  broadcastRegime(regime) {
    for (const trader of this.traders) {
      if (trader.type === 'MARKET_MAKER' && trader.setRegimeMultiplier) {
        trader.setRegimeMultiplier(regime.spreadMultiplier);
      }
    }
  }

  _setupTraders() {
    // 4 Market Makers across sectors
    this.traders.push(
      new MarketMaker('bot_mm_alpha', 'MM Alpha Securities', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        spreadTarget: 0.006,
        minDelayMs: 800,
        maxDelayMs: 2000
      }),
      new MarketMaker('bot_mm_beta', 'Apex Liquidity LP', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        spreadTarget: 0.010,
        minDelayMs: 1200,
        maxDelayMs: 2800
      }),
      new MarketMaker('bot_mm_gamma', 'Jane Street Liquidity', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        spreadTarget: 0.008,
        minDelayMs: 900,
        maxDelayMs: 2200
      }),
      new MarketMaker('bot_mm_delta', 'Flow Traders Alpha', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        spreadTarget: 0.012,
        minDelayMs: 1100,
        maxDelayMs: 2600
      })
    );

    // 4 Momentum Traders
    this.traders.push(
      new MomentumTrader('bot_momo_1', 'Velocity Quant Bot', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 1500,
        maxDelayMs: 3500
      }),
      new MomentumTrader('bot_momo_2', 'TrendRider Algorithmic', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 2000,
        maxDelayMs: 4000
      }),
      new MomentumTrader('bot_momo_3', 'Breakout Alpha Bot', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 1800,
        maxDelayMs: 3800
      }),
      new MomentumTrader('bot_momo_4', 'Surge Capital Systems', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 2200,
        maxDelayMs: 4200
      })
    );

    // 3 Value Investors
    this.traders.push(
      new ValueInvestor('bot_val_1', 'DeepValue Asset Mgmt', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        marginOfSafety: 0.015,
        minDelayMs: 2200,
        maxDelayMs: 4500
      }),
      new ValueInvestor('bot_val_2', 'Horizon Fundamental Fund', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        marginOfSafety: 0.025,
        minDelayMs: 3000,
        maxDelayMs: 5500
      }),
      new ValueInvestor('bot_val_3', 'Berkshire Quant Value', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        marginOfSafety: 0.020,
        minDelayMs: 2600,
        maxDelayMs: 5000
      })
    );

    // 4 Noise / Retail Swarm Traders
    this.traders.push(
      new NoiseTrader('bot_noise_1', 'Retail Swarm Alpha', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 1000,
        maxDelayMs: 2500
      }),
      new NoiseTrader('bot_noise_2', 'Retail Swarm Beta', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 1400,
        maxDelayMs: 3200
      }),
      new NoiseTrader('bot_noise_3', 'Retail Swarm Gamma', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 1200,
        maxDelayMs: 2800
      }),
      new NoiseTrader('bot_noise_4', 'Robinhood Retail Hive', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 1100,
        maxDelayMs: 2600
      })
    );

    // 2 Statistical Arbitrage Traders
    this.traders.push(
      new StatisticalArbitrageTrader('bot_arb_1', 'Citadel StatArb Alpha', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 1200,
        maxDelayMs: 2800
      }),
      new StatisticalArbitrageTrader('bot_arb_2', 'TwoSigma Pair Trader', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 1400,
        maxDelayMs: 3200
      })
    );

    // 2 Iceberg Institutional Whale Bots
    this.traders.push(
      new IcebergWhaleTrader('bot_whale_1', 'BlackRock Execution LP', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 2000,
        maxDelayMs: 4000
      }),
      new IcebergWhaleTrader('bot_whale_2', 'Vanguard Institutional Index', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 2400,
        maxDelayMs: 4500
      })
    );

    // 2 High-Frequency Scalpers
    this.traders.push(
      new ScalperTrader('bot_scalp_1', 'Optiver Micro Scalper', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 600,
        maxDelayMs: 1400
      }),
      new ScalperTrader('bot_scalp_2', 'Virtu High Frequency LP', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 750,
        maxDelayMs: 1600
      })
    );

    // 2 News Sentiment Momentum Reactors
    this.traders.push(
      new NewsReactorTrader('bot_news_1', 'HeadlineSurge FastQuant', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 1200,
        maxDelayMs: 3000
      }),
      new NewsReactorTrader('bot_news_2', 'Catalyst Momentum Alpha', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 1500,
        maxDelayMs: 3500
      })
    );

    // 2 Adversarial Spoofing & Layering Bots
    this.traders.push(
      new SpoofingTrader('bot_spoofer_1', 'Phantom Layer Alpha', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        phantomSize: 1200,
        cancelDelayMs: 180,
        minDelayMs: 2500,
        maxDelayMs: 5000
      }),
      new SpoofingTrader('bot_spoofer_2', 'Predatory Liquidity Hunter', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        phantomSize: 1500,
        cancelDelayMs: 150,
        minDelayMs: 3000,
        maxDelayMs: 6000
      })
    );
  }

  seedPreMarketAuctionOrders() {
    // In pre-market, bots submit crossing and near-touch limit orders for Opening Auction uncrossing
    const companies = this.marketManager.getAllCompanies();
    for (const comp of companies) {
      const price = comp.price;
      const buyerBot = this.traders[4]; // bot_val_1
      const sellerBot = this.traders[7]; // bot_noise_1

      if (buyerBot && sellerBot) {
        buyerBot.submitOrder({
          symbol: comp.symbol,
          side: 'BUY',
          type: 'LIMIT',
          price: +(price * (1 + (Math.random() * 0.005))).toFixed(2),
          quantity: Math.floor(Math.random() * 25 + 10)
        });
        sellerBot.submitOrder({
          symbol: comp.symbol,
          side: 'SELL',
          type: 'LIMIT',
          price: +(price * (1 - (Math.random() * 0.005))).toFixed(2),
          quantity: Math.floor(Math.random() * 25 + 10)
        });
      }
    }
  }

  seedInitialOrderBooks() {
    // Prime the books with realistic initial depth
    const companies = this.marketManager.getAllCompanies();
    for (const comp of companies) {
      const price = comp.price;
      const mm = this.traders[0]; // MM Alpha

      for (let i = 1; i <= 5; i++) {
        const spreadOffset = price * (0.003 * i);
        // Bid
        mm.submitOrder({
          symbol: comp.symbol,
          side: 'BUY',
          type: 'LIMIT',
          price: +(price - spreadOffset).toFixed(2),
          quantity: Math.floor(Math.random() * 20 + 10 * i)
        });
        // Ask
        mm.submitOrder({
          symbol: comp.symbol,
          side: 'SELL',
          type: 'LIMIT',
          price: +(price + spreadOffset).toFixed(2),
          quantity: Math.floor(Math.random() * 20 + 10 * i)
        });
      }
    }
  }

  startAll() {
    this.seedInitialOrderBooks();
    for (const trader of this.traders) {
      trader.start();
    }
  }

  stopAll() {
    for (const trader of this.traders) {
      trader.stop();
    }
  }

  broadcastNews(newsItem) {
    for (const trader of this.traders) {
      if (typeof trader.reactToNews === 'function') {
        try {
          trader.reactToNews(newsItem);
        } catch (err) {
          // Keep resilient
        }
      }
    }
  }
}
