import { io } from 'socket.io-client';
import assert from 'assert';

console.log('[E2E TEST] Starting Tier 2 live WebSocket end-to-end verification...\n');

const client = io('http://localhost:3000');
let userInitData = null;
let achievementReceived = false;

client.on('connect', () => {
  console.log('[1/5] Connected to server, sending user:join...');
  client.emit('user:join', { desiredName: 'Tier2_Tester', existingUserId: `usr_t2_${Date.now()}` });
});

client.on('init:state', (data) => {
  userInitData = data;
  console.log(`[2/5] Initialized state: User ${data.user.name}, Cash: ${data.portfolio.credits} CR`);
  assert.strictEqual(Array.isArray(data.portfolio.allAchievements), true);
  assert.strictEqual(data.portfolio.allAchievements.length, 7);
  console.log('[PASS] All 7 Tier 2 achievement definitions delivered in initial state');

  // Place a Stop-Loss buy order for 5 AUTO at stopPrice 465 (above current ~450)
  console.log('[3/5] Placing STOP_LOSS buy order...');
  client.emit('order:place', {
    symbol: 'AUTO',
    side: 'BUY',
    type: 'STOP_LOSS',
    stopPrice: 465,
    quantity: 5
  }, (res) => {
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.order.type, 'STOP_LOSS');
    assert.strictEqual(res.order.stopPrice, 465);
    console.log('[PASS] Stop-Loss order accepted by matching engine and resting in stop queue');
  });
});

client.on('achievement:unlocked', (ach) => {
  console.log(`[4/5] Received achievement:unlocked event: "${ach.title}" (+${ach.rewardCredits} CR)!`);
  if (ach.id === 'RISK_MANAGER') {
    achievementReceived = true;
    console.log('[PASS] Achievement unlock event received on client socket');

    setTimeout(() => {
      console.log('\n[5/5] All Tier 2 live socket integration checks verified successfully!');
      client.disconnect();
      process.exit(0);
    }, 1000);
  }
});

// Timeout safeguard
setTimeout(() => {
  if (!achievementReceived) {
    console.error('[FAIL] Timed out waiting for achievement unlock event');
    process.exit(1);
  }
}, 8000);
