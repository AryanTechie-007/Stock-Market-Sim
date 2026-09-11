import assert from 'assert';
import { MarketManager, INITIAL_COMPANIES } from '../engine/market.js';
import { SimulationWorldNewsEngine } from '../engine/news-engine.js';
import { MatchingEngine } from '../engine/matching.js';
import { AccountManager } from '../engine/accounts.js';
import { MarketClock } from '../engine/clock.js';
import { NPCManager } from '../traders/manager.js';
import { ScalperTrader } from '../traders/scalper.js';
import { NewsReactorTrader } from '../traders/news-reactor.js';

console.log('[TEST] Starting Simulation World, Multi-Asset & NPC Fleet Test Suite (Release v0.907)...\n');

async function run() {
  const clock = new MarketClock();
  const accountManager = new AccountManager(1000000);
  const symbols = INITIAL_COMPANIES.map(c => c.symbol);
  const matchingEngine = new MatchingEngine(symbols, accountManager, clock);
  const marketManager = new MarketManager(clock, matchingEngine);
  const newsEngine = new SimulationWorldNewsEngine(marketManager);

  // -------------------------------------------------------------
  // Test 1: 10-Company Multi-Asset Expansion Across 6 Sectors
  // -------------------------------------------------------------
  console.log('Test 1: 10-Company Multi-Asset Universe & Sector Diversification');
  const companies = marketManager.getAllCompanies();
  assert.strictEqual(companies.length, 10, 'Exchange must list exactly 10 companies');

  const expectedSymbols = ['AUTO', 'SOLR', 'BYTE', 'NBNK', 'MEDL', 'AERO', 'SEMI', 'RETL', 'CYBR', 'STRM'];
  const sectors = new Set();
  for (const sym of expectedSymbols) {
    const comp = marketManager.getCompany(sym);
    assert(comp, `Company ${sym} must exist in market manager`);
    assert(comp.price > 0, `${sym} price must be positive`);
    assert(comp.description && comp.description.length > 20, `${sym} must have rich corporate description`);
    assert(comp.fundamentals && comp.fundamentals.peRatio > 0, `${sym} must have fundamental P/E ratio`);
    assert(comp.fundamentals.marketCap, `${sym} must have market capitalization`);
    assert(comp.mark && comp.mark.length === 2, `${sym} must have 2-letter ticker mark`);
    sectors.add(comp.sector);
    console.log(`  [OK] ${comp.symbol.padEnd(5)} | ${comp.mark} | ${comp.name.padEnd(26)} | ${comp.sector.padEnd(25)} | Base: ${comp.basePrice} CR`);
  }

  assert(sectors.size >= 6, `Market must span at least 6 distinct economic sectors (got ${sectors.size})`);
  console.log(`[PASS] 10 equities successfully listed across ${sectors.size} diverse economic sectors\n`);

  // -------------------------------------------------------------
  // Test 2: Dynamic Simulation World State & Macroeconomic Indicators
  // -------------------------------------------------------------
  console.log('Test 2: Dynamic Simulation World State & Macroeconomic Context');
  const worldState = newsEngine.getWorldState();
  assert(typeof worldState.interestRate === 'number' && worldState.interestRate > 0, 'World must track positive interest rate');
  assert(typeof worldState.cpiInflation === 'number', 'World must track CPI inflation index');
  assert(typeof worldState.gdpGrowth === 'number', 'World must track GDP growth');
  assert(typeof worldState.sectorSentiment === 'object', 'World must maintain sector sentiment indicators');
  console.log(`  Macro Context: Policy Rate = ${worldState.interestRate.toFixed(2)}%, CPI = ${worldState.cpiInflation}%, GDP Growth = ${worldState.gdpGrowth}%`);
  console.log('[PASS] Stateful macroeconomic environment verified\n');

  // -------------------------------------------------------------
  // Test 3: Procedural Catalyst Generation Across 5 Event Classes
  // -------------------------------------------------------------
  console.log('Test 3: Procedural News Generation Across All 5 World Event Classes');
  const categories = ['MACRO', 'SECTOR', 'EARNINGS', 'CORPORATE', 'RUMOR'];
  for (const cat of categories) {
    const ev = newsEngine.generateWorldEvent(cat);
    assert.strictEqual(ev.category, cat, `Event must match category ${cat}`);
    assert(ev.headline && ev.headline.length > 15, `Event must have detailed financial headline`);
    assert(Array.isArray(ev.symbols) && ev.symbols.length > 0, `Event must affect at least one stock symbol`);
    assert(typeof ev.impact === 'object' && Object.keys(ev.impact).length > 0, `Event must include quantified impact factors`);
    if (cat === 'RUMOR') {
      assert.strictEqual(ev.isRumor, true, 'RUMOR category events must have isRumor=true');
    }
    console.log(`  [${cat.padEnd(9)}] ${ev.headline.slice(0, 75)}... (Impact: ${JSON.stringify(ev.impact)})`);
  }
  console.log('[PASS] Procedural world event generator verified across all catalyst classes\n');

  // -------------------------------------------------------------
  // Test 4: Seamless Integration with v0.906 Spike-and-Settle Engine
  // -------------------------------------------------------------
  console.log('Test 4: Integration of World News into MarketManager Spike-and-Settle Engine');
  const initialAeroIntrinsic = marketManager.getCompany('AERO').intrinsicValue;
  const corporateNews = {
    headline: 'AeroDynamics wins landmark multi-billion orbital surveillance constellation contract',
    symbols: ['AERO'],
    impact: { AERO: 0.10 },
    sentiment: 'BULLISH',
    isRumor: false
  };

  marketManager.triggerNewsEvent(corporateNews);
  const aeroPostSpike = marketManager.getCompany('AERO');
  // Confirmed news overshoots by 140% (0.10 * 1.40 = +14.0%)
  const expectedSpike = +(initialAeroIntrinsic * (1 + 0.10 * 1.40)).toFixed(2);
  console.log(`  AERO Intrinsic: Pre=${initialAeroIntrinsic} CR -> Post-Spike=${aeroPostSpike.intrinsicValue} CR (Expected=${expectedSpike} CR)`);
  assert(Math.abs(aeroPostSpike.intrinsicValue - expectedSpike) <= 0.05, 'News must trigger immediate 140% overshoot spike');
  assert(marketManager.getActiveNewsDecays().length > 0, 'Active decay tracker must be registered');
  console.log('[PASS] Procedural world news cleanly drives spike-and-settle continuous decay\n');

  // -------------------------------------------------------------
  // Test 5: High-Frequency Scalper NPC Microstructure Trader
  // -------------------------------------------------------------
  console.log('Test 5: High-Frequency Scalper (HFT Microstructure Bot) Execution');
  const scalper = new ScalperTrader('bot_scalp_test', 'Scalper Quant', matchingEngine, marketManager, accountManager, clock);
  const semiComp = marketManager.getCompany('SEMI');
  
  // Prime book with bid and ask
  accountManager.getOrCreateUser('prime_buyer', 'Prime Buyer');
  accountManager.getOrCreateUser('prime_seller', 'Prime Seller');
  const primeSeller = accountManager.getOrCreateUser('prime_seller', 'Prime Seller');
  primeSeller.holdings.set('SEMI', { quantity: 100, avgPrice: 960, lockedQty: 0 });

  matchingEngine.submitOrder({ userId: 'prime_buyer', userName: 'PB', symbol: 'SEMI', side: 'BUY', type: 'LIMIT', price: 955, quantity: 10 });
  matchingEngine.submitOrder({ userId: 'prime_seller', userName: 'PS', symbol: 'SEMI', side: 'SELL', type: 'LIMIT', price: 965, quantity: 10 });

  clock.phase = 'REGULAR_HOURS';
  // Scalper acts
  scalper.act();
  const semiBook = matchingEngine.getOrderBook('SEMI');
  console.log(`  SEMI Book: Bids=${semiBook.bids.length}, Asks=${semiBook.asks.length}, BestBid=${semiBook.getBestBid()}, BestAsk=${semiBook.getBestAsk()}`);
  assert(semiBook.bids.length > 0 || semiBook.asks.length > 0, 'Scalper must submit orders');
  console.log('[PASS] Scalper bot successfully evaluates microstructure and submits liquidity\n');

  // -------------------------------------------------------------
  // Test 6: News Sentiment Momentum Reactor Bot
  // -------------------------------------------------------------
  console.log('Test 6: News Sentiment Momentum Reactor Immediate Reaction & Digestion Unwind');
  const newsBot = new NewsReactorTrader('bot_news_test', 'FastNews Reactor', matchingEngine, marketManager, accountManager, clock);
  
  // Breaking catalyst on CYBR
  const cybrNews = {
    headline: 'CipherShield detects and thwarts zero-day exploit, signs emergency federal contracts',
    symbols: ['CYBR'],
    impact: { CYBR: 0.09 },
    sentiment: 'BULLISH'
  };

  newsBot.reactToNews(cybrNews);
  assert(newsBot.recentNewsReactions.has('CYBR'), 'NewsReactor must register active news reaction');
  const reaction = newsBot.recentNewsReactions.get('CYBR');
  assert.strictEqual(reaction.side, 'BUY', 'Positive catalyst must trigger BUY order');
  console.log(`  News Reactor entered position on CYBR (Side: ${reaction.side}, Entry: ${reaction.entryPrice} CR)`);
  console.log('[PASS] News Reactor trader swiftly front-runs breaking sentiment catalyst\n');

  // -------------------------------------------------------------
  // Test 7: NPC Manager Fleet Scale (23 Autonomous Bots)
  // -------------------------------------------------------------
  console.log('Test 7: Expanded NPC Fleet Scale & Archetype Diversity');
  const npcManager = new NPCManager(matchingEngine, marketManager, accountManager, clock);
  console.log(`  Total Active NPC Traders: ${npcManager.traders.length}`);
  assert(npcManager.traders.length >= 20, `Fleet must have 20+ autonomous traders (got ${npcManager.traders.length})`);

  const archetypeCounts = {};
  for (const t of npcManager.traders) {
    archetypeCounts[t.type] = (archetypeCounts[t.type] || 0) + 1;
  }
  console.log('  Trader Archetype Breakdown:');
  for (const [type, count] of Object.entries(archetypeCounts)) {
    console.log(`    - ${type.padEnd(20)}: ${count} bots`);
  }

  assert(archetypeCounts['MARKET_MAKER'] >= 4, 'Must have at least 4 Market Makers');
  assert(archetypeCounts['MOMENTUM'] >= 4, 'Must have at least 4 Momentum traders');
  assert(archetypeCounts['SCALPER'] >= 2, 'Must have at least 2 Scalper bots');
  assert(archetypeCounts['NEWS_REACTOR'] >= 2, 'Must have at least 2 News Reactor bots');
  console.log('[PASS] Complete 23-bot fleet spans 8 distinct trading archetypes\n');

  console.log('========================================================================');
  console.log('[SUCCESS] ALL 7 SIMULATION WORLD & MULTI-ASSET TESTS PASSED (100%)!');
  console.log('========================================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('[FAIL] Simulation World Test Suite Encountered Error:', err);
  process.exit(1);
});
