import { MarketMaker } from './market-maker.js';
import { MomentumTrader } from './momentum.js';
import { ValueInvestor } from './value-investor.js';
import { NoiseTrader } from './noise.js';

export class NPCManager {
  constructor(matchingEngine, marketManager, accountManager, clock) {
    this.matchingEngine = matchingEngine;
    this.marketManager = marketManager;
    this.accountManager = accountManager;
    this.clock = clock;
    this.traders = [];

    this._setupTraders();
  }

  _setupTraders() {
    // 2 Market Makers (Primary & Secondary)
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
      })
    );

    // 2 Momentum Traders
    this.traders.push(
      new MomentumTrader('bot_momo_1', 'Velocity Quant Bot', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 1500,
        maxDelayMs: 3500
      }),
      new MomentumTrader('bot_momo_2', 'TrendRider Algorithmic', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 2000,
        maxDelayMs: 4000
      })
    );

    // 2 Value Investors
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
      })
    );

    // 2 Noise / Retail Traders
    this.traders.push(
      new NoiseTrader('bot_noise_1', 'Retail Swarm Alpha', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 1000,
        maxDelayMs: 2500
      }),
      new NoiseTrader('bot_noise_2', 'Retail Swarm Beta', this.matchingEngine, this.marketManager, this.accountManager, this.clock, {
        minDelayMs: 1400,
        maxDelayMs: 3200
      })
    );
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
}
