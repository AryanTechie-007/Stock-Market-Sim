import { io } from 'socket.io-client';

console.log('Testing WebSocket multiplayer simulation...\n');

const clientA = io('http://localhost:3000');
const clientB = io('http://localhost:3000');

let clientAData = null;
let clientBData = null;

clientA.on('connect', () => {
  console.log('Client A connected with socket ID:', clientA.id);
  clientA.emit('user:join', { desiredName: 'Alice_Human', existingUserId: 'usr_alice' });
});

clientA.on('init:state', (data) => {
  clientAData = data;
  console.log(`✅ Client A initialized as ${data.user.name} with ${data.portfolio.credits} Credits`);
  
  // Submit a limit buy order for 15 shares of AUTO at 460 CR
  clientA.emit('order:place', {
    symbol: 'AUTO',
    side: 'BUY',
    type: 'LIMIT',
    price: 460,
    quantity: 15
  }, (res) => {
    console.log('Client A order placement result:', res.success ? 'SUCCESS' : res.error);
  });
});

clientB.on('connect', () => {
  console.log('Client B connected with socket ID:', clientB.id);
  clientB.emit('user:join', { desiredName: 'Bob_Human', existingUserId: 'usr_bob' });
});

clientB.on('init:state', (data) => {
  clientBData = data;
  console.log(`✅ Client B initialized as ${data.user.name} with ${data.portfolio.credits} Credits`);
});

clientA.on('portfolio:update', ({ portfolio, openOrders }) => {
  console.log(`💼 Client A Portfolio Update: Cash: ${portfolio.credits} CR, Locked: ${portfolio.lockedCredits} CR, Open Orders: ${openOrders.length}`);
});

clientA.on('trade:new', (trade) => {
  console.log(`⚡ Market Trade Execution: ${trade.symbol} ${trade.quantity}sh @ ${trade.price} CR (${trade.buyerName} ⇄ ${trade.sellerName})`);
  
  // Close clients after receiving trades
  setTimeout(() => {
    console.log('\n🎉 Multiplayer WebSocket Simulation successfully validated!');
    clientA.disconnect();
    clientB.disconnect();
    process.exit(0);
  }, 2000);
});
