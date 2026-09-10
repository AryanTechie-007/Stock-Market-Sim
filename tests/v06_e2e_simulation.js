import assert from 'assert';
import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import ioClient from 'socket.io-client';
import { MarketClock } from '../engine/clock.js';
import { AccountManager } from '../engine/accounts.js';
import { MatchingEngine } from '../engine/matching.js';
import { MarketManager } from '../engine/market.js';
import { TournamentManager } from '../engine/tournament.js';
import { SQLiteStorageManager } from '../engine/sqlite-storage.js';

console.log('[TEST] Starting v0.6 Quantitative Analytics & Tournament Mode E2E Simulation...');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = 4321;

const storage = new SQLiteStorageManager(':memory:');
const clock = new MarketClock();
const accountManager = new AccountManager(100000, storage);
const symbols = ['AUTO', 'BYTE'];
const matchingEngine = new MatchingEngine(symbols, accountManager, clock);
const marketManager = new MarketManager(clock, matchingEngine);
const tournamentManager = new TournamentManager(accountManager, clock, 180, 50000, () => marketManager.getCurrentPrices());

matchingEngine.on('trade', (trade) => {
  tournamentManager.recordTournamentTrade(trade);
});

tournamentManager.on('tick', (data) => {
  io.emit('tournament:tick', tournamentManager.getState(marketManager.getCurrentPrices()));
});

io.on('connection', (socket) => {
  let userId = null;
  socket.on('user:join', ({ desiredName }) => {
    userId = `test_u_${Date.now()}`;
    const user = accountManager.getOrCreateUser(userId, desiredName, false);
    
    // Bootstrap package
    socket.emit('init:state', {
      user: { id: user.id, name: user.name },
      portfolio: accountManager.getPortfolio(userId, marketManager.getCurrentPrices()),
      tournament: tournamentManager.getState(marketManager.getCurrentPrices())
    });
  });

  socket.on('tournament:join', (data, cb) => {
    const result = tournamentManager.joinTournament(userId, 'QuantMaster');
    io.emit('tournament:state', tournamentManager.getState(marketManager.getCurrentPrices()));
    if (cb) cb(result);
  });
});

server.listen(PORT, async () => {
  const client = ioClient(`http://localhost:${PORT}`);

  client.on('connect', () => {
    console.log('[CLIENT] Connected to test server, emitting user:join...');
    client.emit('user:join', { desiredName: 'QuantMaster' });
  });

  client.on('init:state', (data) => {
    console.log('[CLIENT] Received init:state package');
    assert(data.portfolio, 'Portfolio should be present');
    assert(data.portfolio.quantitativeMetrics, 'Quantitative metrics must be included in portfolio');
    
    const q = data.portfolio.quantitativeMetrics;
    console.log('[VERIFY] Quantitative metrics:', q);
    assert(typeof q.sharpeRatio === 'number', 'sharpeRatio should be a number');
    assert(typeof q.maxDrawdownPercent === 'number', 'maxDrawdownPercent should be a number');
    assert(typeof q.profitFactor === 'number', 'profitFactor should be a number');
    assert(typeof q.winRate === 'number', 'winRate should be a number');

    assert(data.tournament, 'Tournament state must be included');
    assert.strictEqual(data.tournament.standardBankroll, 50000);
    console.log('[PASS] Bootstrap package verified with quantitative analytics & tournament');

    // Test joining tournament
    client.emit('tournament:join', {}, (res) => {
      console.log('[CLIENT] tournament:join response:', res);
      assert(res.success, 'Enrollment should succeed');
      assert.strictEqual(res.participant.credits, 50000);
    });
  });

  client.on('tournament:state', (tourneyState) => {
    console.log('[CLIENT] Received tournament:state:', tourneyState.status, 'participants:', tourneyState.participantsCount);
    if (tourneyState.participantsCount === 1) {
      assert(tourneyState.leaderboard.length >= 1, 'Leaderboard should include enrolled participant');
      assert.strictEqual(tourneyState.leaderboard[0].name, 'QuantMaster');
      assert.strictEqual(tourneyState.leaderboard[0].totalNetWorth, 50000);
      console.log('[PASS] Tournament enrollment and state broadcast verified!');

      // Clean teardown
      client.disconnect();
      server.close(() => {
        console.log('[SUCCESS] v0.6 E2E Integration Simulation Passed completely!\n');
        process.exit(0);
      });
    }
  });
});
