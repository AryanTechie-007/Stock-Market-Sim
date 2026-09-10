import { MarketArenaClient } from './marketarena.js';

/**
 * Example Algorithmic Trading Bot (Node.js)
 * Connects to MarketArena, fetches order books, checks regime, and places liquidity quotes.
 */
async function runBot() {
  const client = new MarketArenaClient({
    baseUrl: 'http://localhost:3000',
    apiKey: process.env.MARKETARENA_API_KEY || 'test_key',
    apiSecret: process.env.MARKETARENA_API_SECRET || 'test_secret'
  });

  console.log('[BOT] Connecting to MarketArena...');
  const ping = await client.ping();
  console.log(`[BOT] Connected to MarketArena. Phase: ${ping.clock.phase}, Day: ${ping.clock.day}`);

  const regime = await client.getRegime();
  console.log(`[BOT] Active Regime: ${regime.name} (Spread Mult: ${regime.spreadMultiplier}x)`);

  const symbol = 'BYTE';
  const book = await client.getOrderbook(symbol, 5);
  console.log(`[BOT] Top Bid: ${book.bids[0]?.price} | Top Ask: ${book.asks[0]?.price} | Spread: ${book.spread}`);

  // Fetch recent candles for trend
  const candleData = await client.getCandles(symbol, '5s', 10);
  console.log(`[BOT] Retrieved ${candleData.candles.length} candles for ${symbol}`);

  console.log('[BOT] Automated analysis complete.');
}

if (process.argv[1] && process.argv[1].endsWith('example_bot.js')) {
  runBot().catch(console.error);
}
