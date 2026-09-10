import assert from 'assert';
import { TournamentManager } from '../engine/tournament.js';
import { AccountManager } from '../engine/accounts.js';
import { MarketClock } from '../engine/clock.js';

console.log('[TEST] Starting Competitive Tournament Engine Test Suite...\n');

const accts = new AccountManager(100000);
const clock = new MarketClock();
const tourney = new TournamentManager(accts, clock, 60, 50000);

// Test 1: Participant Enrollment & Standardized Bankroll
console.log('Test 1: Tournament Enrollment with Standardized Bankroll');
const resA = tourney.joinTournament('trader_a', 'Alpha Quant');
const resB = tourney.joinTournament('trader_b', 'Beta Speculator');

assert.strictEqual(resA.success, true);
assert.strictEqual(resA.participant.credits, 50000);
assert.strictEqual(resB.success, true);
assert.strictEqual(tourney.participants.size, 2);
assert.strictEqual(tourney.status, 'COUNTDOWN');
console.log('[PASS] Participants initialized with 50,000 CR standardized tournament bankroll');

// Test 2: Active Round Transition & Trade Recording
console.log('\nTest 2: Round Transition & Trade Settlement');
tourney.startRound();
assert.strictEqual(tourney.status, 'ACTIVE');

// Simulate a trade where trader_a buys 100 shares of AUTO @ 100 CR from bot
tourney.recordTournamentTrade({
  symbol: 'AUTO',
  price: 100,
  quantity: 100,
  buyerId: 'trader_a',
  sellerId: 'market_maker'
});

const partA = tourney.participants.get('trader_a');
assert.strictEqual(partA.credits, 40000); // 50,000 - 10,000
assert.strictEqual(partA.holdings.get('AUTO').quantity, 100);
console.log('[PASS] Tournament trade accurately updated participant cash and inventory');

// Test 3: Leaderboard & Mark-to-Market Valuation
console.log('\nTest 3: Tournament Leaderboard Mark-to-Market');
// Price of AUTO jumps to 150 CR: trader_a net worth = 40k cash + (100 * 150) = 55,000 CR (+10%)
// trader_b has 50k cash (0% return)
const lb = tourney.getLeaderboard({ AUTO: 150 });
assert.strictEqual(lb.length, 2);
assert.strictEqual(lb[0].userId, 'trader_a');
assert.strictEqual(lb[0].totalNetWorth, 55000);
assert.strictEqual(lb[0].returnPercent, 10);
assert.strictEqual(lb[1].userId, 'trader_b');
console.log('[PASS] Tournament leaderboard correctly ranked participant by mark-to-market return');

// Test 4: Tournament Conclusion, Podium, & Prize Distribution
console.log('\nTest 4: Tournament Conclusion & Podium Prizes');
const mainUserA = accts.getOrCreateUser('trader_a', 'Alpha Quant');
const initialCredits = mainUserA.credits;

tourney.concludeTournament({ AUTO: 150 });
assert.strictEqual(tourney.status, 'CONCLUDED');
assert.strictEqual(tourney.lastPodium.podium.length, 2);
assert.strictEqual(tourney.lastPodium.podium[0].userId, 'trader_a');
assert.strictEqual(tourney.lastPodium.podium[0].prizeCredits, 5000);

// Main account should have received the 5,000 CR 1st place gold prize
assert.strictEqual(mainUserA.credits, initialCredits + 5000);
console.log('[PASS] Podium winners crowned and 1st place prize (+5,000 CR) credited to main account');

console.log('\n[SUCCESS] ALL TOURNAMENT ENGINE TESTS PASSED!\n');
process.exit(0);
