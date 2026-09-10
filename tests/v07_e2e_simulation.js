import assert from 'assert';
import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import ioClient from 'socket.io-client';
import { MarketClock } from '../engine/clock.js';
import { AccountManager } from '../engine/accounts.js';
import { MatchingEngine } from '../engine/matching.js';
import { MarketManager } from '../engine/market.js';
import { SQLiteStorageManager } from '../engine/sqlite-storage.js';
import { MarketRegimeEngine } from '../engine/regimes.js';
import { NPCManager } from '../traders/manager.js';
import { TournamentManager } from '../engine/tournament.js';

console.log('[TEST] Starting v0.7 Advanced Algorithmic NPCs & Market Regimes E2E Simulation...');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = 4567;

const storage = new SQLiteStorageManager(':memory:');
const clock = new MarketClock();
const accountManager = new AccountManager(100000, storage);
const symbols = ['AUTO', 'SOLR', 'BYTE', 'NBNK', 'MEDL'];
const matchingEngine = new MatchingEngine(symbols, accountManager, clock);
const marketManager = new MarketManager(clock, matchingEngine);
const regimeEngine = new MarketRegimeEngine(clock);
const npcManager = new NPCManager(matchingEngine, marketManager, accountManager, clock, regimeEngine);
const tournamentManager = new TournamentManager(accountManager, clock, 180, 50000, () => marketManager.getCurrentPrices());

regimeEngine.on('regimeChange', (regime) => {
  io.emit('regime:change', regime);
});

io.on('connection', (socket) => {
  let userId = null;
  socket.on('user:join', ({ desiredName }) => {
    userId = `test_u_${Date.now()}`;
    const user = accountManager.getOrCreateUser(userId, desiredName, false);
    
    socket.emit('init:state', {
      user: { id: user.id, name: user.name },
      regime: regimeEngine.getRegime(),
      portfolio: accountManager.getPortfolio(userId, marketManager.getCurrentPrices()),
      tournament: tournamentManager.getState(marketManager.getCurrentPrices())
    });
  });
});

server.listen(PORT, async () => {
  const client = ioClient(`http://localhost:${PORT}`);

  client.on('connect', () => {
    console.log('[CLIENT] Connected to test server, emitting user:join...');
    client.emit('user:join', { desiredName: 'QuantResearcher' });
  });

  client.on('init:state', (data) => {
    console.log('[CLIENT] Received init:state package');
    assert(data.regime, 'Market regime must be present in init:state');
    assert.strictEqual(data.regime.name, 'NORMAL');
    assert.strictEqual(data.regime.spreadMultiplier, 1.0);
    console.log('[PASS] Initial market regime verified in bootstrap package:', data.regime.name);

    // Verify NPC Manager has 10 bots (including StatArb and Iceberg)
    assert.strictEqual(npcManager.traders.length, 10, 'NPC Manager must manage 10 bots');
    const hasStatArb = npcManager.traders.some(t => t.type === 'STAT_ARBITRAGE');
    const hasIceberg = npcManager.traders.some(t => t.type === 'ICEBERG_WHALE');
    assert(hasStatArb, 'Statistical Arbitrage bot must be registered in NPCManager');
    assert(hasIceberg, 'Iceberg Institutional Whale bot must be registered in NPCManager');
    console.log('[PASS] NPC Manager registered 10 autonomous bots including StatArb and Iceberg Whale');

    // Trigger regime shift to HIGH_VOLATILITY
    console.log('[SERVER] Triggering regime shift to HIGH_VOLATILITY...');
    regimeEngine.setRegime('HIGH_VOLATILITY', 45);
  });

  client.on('regime:change', (regime) => {
    console.log('[CLIENT] Received regime:change event over WebSocket:', regime.name);
    assert.strictEqual(regime.name, 'HIGH_VOLATILITY');
    assert(regime.spreadMultiplier >= 2.0, 'Spread multiplier should be at least 2.0x in High Volatility');
    assert(regime.volatilityMultiplier >= 2.0, 'Volatility multiplier should be elevated');
    console.log('[PASS] WebSocket broadcast of regime transition verified:', regime.name, `(${regime.spreadMultiplier}x spread)`);

    // Verify Market Makers updated their internal spread multiplier
    const mmAlpha = npcManager.traders.find(t => t.id === 'bot_mm_alpha');
    assert(mmAlpha, 'MM Alpha bot must exist');
    assert.strictEqual(mmAlpha.regimeMultiplier, regime.spreadMultiplier, 'Market Maker must adjust quotes to regime multiplier');
    console.log('[PASS] Market Makers dynamically adapted quote spreads to match active regime');

    // Teardown
    client.disconnect();
    server.close(() => {
      console.log('[SUCCESS] v0.7 E2E Integration Simulation Passed completely!\n');
      process.exit(0);
    });
  });
});
