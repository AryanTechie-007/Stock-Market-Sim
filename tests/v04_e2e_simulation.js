import { io } from 'socket.io-client';
import assert from 'assert';

console.log('[E2E TEST] Starting Tier 3 (v0.4) live WebSocket verification...\n');

const client = io('http://localhost:3000');

client.on('connect', () => {
  console.log('[1/4] Connected to server, sending user:join...');
  client.emit('user:join', { desiredName: 'V04_Tester', existingUserId: 'usr_v04_test' });
});

client.on('init:state', (data) => {
  console.log(`[2/4] Initialized state: User ${data.user.name}, Cash: ${data.portfolio.credits} CR`);
  assert.strictEqual(typeof data.portfolio.marginLoan, 'number');
  assert.strictEqual(typeof data.portfolio.equity, 'number');

  // Place a trailing stop sell order
  console.log('[3/4] Submitting Trailing Stop Order...');
  client.emit('order:place', {
    symbol: 'BYTE',
    side: 'SELL',
    type: 'TRAILING_STOP',
    trailingDelta: 12.5,
    quantity: 5
  }, (res) => {
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.isStop, true);
    console.log('[PASS] Trailing Stop order accepted by engine and resting in queue');

    // Place an OCO Bracket Order
    console.log('[4/4] Submitting OCO Bracket Order...');
    client.emit('order:placeOco', {
      symbol: 'BYTE',
      side: 'SELL',
      quantity: 5,
      limitPrice: 150,
      stopPrice: 80
    }, (ocoRes) => {
      assert.strictEqual(ocoRes.success, true);
      assert.strictEqual(typeof ocoRes.ocoGroupId, 'string');
      console.log(`[PASS] OCO Bracket pair accepted (GroupId: ${ocoRes.ocoGroupId})`);

      console.log('\n[SUCCESS] Tier 3 (v0.4) live WebSocket E2E verification complete!\n');
      client.disconnect();
      process.exit(0);
    });
  });
});
