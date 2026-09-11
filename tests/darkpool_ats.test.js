import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchingEngine } from '../engine/matching.js';
import { AccountManager } from '../engine/accounts.js';
import { DarkPoolATS } from '../engine/darkpool.js';

test('1. NBBO sampling & midpoint calculation', () => {
  const accounts = new AccountManager(100000);
  const matching = new MatchingEngine(['AUTO'], accounts);
  const darkPool = new DarkPoolATS(matching, accounts, { minBlockSize: 1 });

  // Initially lit book has no quotes -> one-sided or empty
  const emptyNbbo = darkPool.getNBBO('AUTO');
  assert.equal(emptyNbbo.valid, false);

  // Add lit bid: 100 shares @ $450.00
  accounts.getOrCreateUser('trader_bid', 'Bidder', false);
  matching.submitOrder({
    userId: 'trader_bid',
    userName: 'Bidder',
    symbol: 'AUTO',
    side: 'BUY',
    type: 'LIMIT',
    price: 450.00,
    quantity: 100
  });

  const oneSidedNbbo = darkPool.getNBBO('AUTO');
  assert.equal(oneSidedNbbo.valid, false);

  // Add lit ask: 100 shares @ $454.00
  const seller = accounts.getOrCreateUser('trader_ask', 'Asker', false);
  seller.holdings.set('AUTO', { quantity: 100, avgPrice: 440, lockedQty: 0, shortQuantity: 0, shortAvgPrice: 0, lockedShortQty: 0 });
  matching.submitOrder({
    userId: 'trader_ask',
    userName: 'Asker',
    symbol: 'AUTO',
    side: 'SELL',
    type: 'LIMIT',
    price: 454.00,
    quantity: 100
  });

  // Valid two-sided NBBO: Bid $450.00, Ask $454.00 -> Spread $4.00, Midpoint $452.00
  const nbbo = darkPool.getNBBO('AUTO');
  assert.equal(nbbo.valid, true);
  assert.equal(nbbo.bestBid, 450.00);
  assert.equal(nbbo.bestAsk, 454.00);
  assert.equal(nbbo.spread, 4.00);
  assert.equal(nbbo.midpoint, 452.00);
  assert.equal(nbbo.priceImprovementPerShare, 2.00);
});

test('2. Non-displayed order submission has ZERO pre-trade market impact on lit order book', () => {
  const accounts = new AccountManager(100000);
  const matching = new MatchingEngine(['BYTE'], accounts);
  const darkPool = new DarkPoolATS(matching, accounts, { minBlockSize: 50 });

  // Provide initial lit quotes
  accounts.getOrCreateUser('lit_buyer', 'Lit Buyer', false);
  matching.submitOrder({
    userId: 'lit_buyer',
    userName: 'Lit Buyer',
    symbol: 'BYTE',
    side: 'BUY',
    type: 'LIMIT',
    price: 1000.00,
    quantity: 100
  });

  const litSeller = accounts.getOrCreateUser('lit_seller', 'Lit Seller', false);
  litSeller.holdings.set('BYTE', { quantity: 100, avgPrice: 900, lockedQty: 0, shortQuantity: 0, shortAvgPrice: 0, lockedShortQty: 0 });
  matching.submitOrder({
    userId: 'lit_seller',
    userName: 'Lit Seller',
    symbol: 'BYTE',
    side: 'SELL',
    type: 'LIMIT',
    price: 1010.00,
    quantity: 100
  });

  const litDepthBefore = matching.getDepth('BYTE', 5);
  assert.equal(litDepthBefore.bids.length, 1);
  assert.equal(litDepthBefore.bids[0].quantity, 100);

  // Submit massive non-displayed block buy of 500 shares into dark pool
  const instBuyer = accounts.getOrCreateUser('inst_buyer', 'Inst Buyer', false);
  instBuyer.credits = 1000000; // Institutional capitalized bankroll
  const darkRes = darkPool.submitOrder({
    userId: 'inst_buyer',
    userName: 'Inst Buyer',
    symbol: 'BYTE',
    side: 'BUY',
    type: 'MIDPOINT_PEG',
    quantity: 500
  });

  assert.equal(darkRes.success, true);
  assert.equal(darkRes.order.status, 'RESTING');
  assert.equal(darkRes.order.quantity, 500);

  // Verify lit depth is COMPLETELY UNTOUCHED (zero footprint)
  const litDepthAfter = matching.getDepth('BYTE', 5);
  assert.equal(litDepthAfter.bids.length, 1);
  assert.equal(litDepthAfter.bids[0].quantity, 100);
  assert.equal(litDepthAfter.bids[0].price, 1000.00);

  // Check dark book aggregated depth (privacy preserved)
  const darkDepth = darkPool.getDarkBookDepth('BYTE');
  assert.equal(darkDepth.totalBuyVolume, 500);
  assert.equal(darkDepth.buyOrderCount, 1);
  assert.equal(darkDepth.totalSellVolume, 0);
});

test('3. Midpoint cross execution at exact NBBO midpoint with price improvement', () => {
  const accounts = new AccountManager(100000);
  const matching = new MatchingEngine(['SOLR'], accounts);
  const darkPool = new DarkPoolATS(matching, accounts, { minBlockSize: 10 });

  // Lit Book: Bid $280.00, Ask $290.00 -> Spread $10.00, Midpoint $285.00
  accounts.getOrCreateUser('lit_buyer_solr', 'Lit Buyer', false);
  matching.submitOrder({
    userId: 'lit_buyer_solr',
    userName: 'Lit Buyer',
    symbol: 'SOLR',
    side: 'BUY',
    type: 'LIMIT',
    price: 280.00,
    quantity: 50
  });

  const litSellerSolr = accounts.getOrCreateUser('lit_seller_solr', 'Lit Seller', false);
  litSellerSolr.holdings.set('SOLR', { quantity: 50, avgPrice: 270, lockedQty: 0, shortQuantity: 0, shortAvgPrice: 0, lockedShortQty: 0 });
  matching.submitOrder({
    userId: 'lit_seller_solr',
    userName: 'Lit Seller',
    symbol: 'SOLR',
    side: 'SELL',
    type: 'LIMIT',
    price: 290.00,
    quantity: 50
  });

  // Resting Dark Buy: 100 shares of SOLR
  accounts.getOrCreateUser('dark_buyer_solr', 'Dark Buyer', false);
  darkPool.submitOrder({
    userId: 'dark_buyer_solr',
    userName: 'Dark Buyer',
    symbol: 'SOLR',
    side: 'BUY',
    type: 'MIDPOINT_PEG',
    quantity: 100
  });

  // Contra Dark Sell: 100 shares of SOLR
  const darkSellerSolr = accounts.getOrCreateUser('dark_seller_solr', 'Dark Seller', false);
  darkSellerSolr.holdings.set('SOLR', { quantity: 100, avgPrice: 275, lockedQty: 0, shortQuantity: 0, shortAvgPrice: 0, lockedShortQty: 0 });
  const sellRes = darkPool.submitOrder({
    userId: 'dark_seller_solr',
    userName: 'Dark Seller',
    symbol: 'SOLR',
    side: 'SELL',
    type: 'MIDPOINT_PEG',
    quantity: 100
  });

  assert.equal(sellRes.success, true);
  assert.equal(sellRes.trades.length, 1);

  const trade = sellRes.trades[0];
  assert.equal(trade.symbol, 'SOLR');
  assert.equal(trade.price, 285.00); // Exact NBBO midpoint ($280 + $290) / 2
  assert.equal(trade.quantity, 100);
  assert.equal(trade.venue, 'DARK_POOL');
  assert.equal(trade.priceImprovement, 5.00); // $5.00 per share savings vs lit spread
  assert.equal(trade.buyerSavings, 500.00); // Buyer saved $500 vs buying at lit ask ($290)
  assert.equal(trade.sellerSavings, 500.00); // Seller gained $500 vs selling at lit bid ($280)
  assert.equal(trade.totalSavings, 1000.00);

  // Check account portfolio positions
  const buyerPortfolio = accounts.getPortfolio('dark_buyer_solr', { SOLR: 285 });
  const solrPos = buyerPortfolio.holdings.find(h => h.symbol === 'SOLR');
  assert.ok(solrPos);
  assert.equal(solrPos.quantity, 100);
  assert.equal(solrPos.avgPrice, 285.00);

  // Check ATS platform stats
  const stats = darkPool.getStats();
  assert.equal(stats.totalTrades, 1);
  assert.equal(stats.totalVolume, 100);
  assert.equal(stats.totalPriceImprovement, 1000.00);
});

test('4. Immediate-Or-Cancel (IOC_MIDPOINT) execution and remainder cancellation', () => {
  const accounts = new AccountManager(100000);
  const matching = new MatchingEngine(['NBNK'], accounts);
  const darkPool = new DarkPoolATS(matching, accounts, { minBlockSize: 10 });

  // Lit Book: Bid $600.00, Ask $610.00 -> Midpoint $605.00
  accounts.getOrCreateUser('lit_b_nbnk', 'Lit B', false);
  matching.submitOrder({
    userId: 'lit_b_nbnk',
    userName: 'Lit B',
    symbol: 'NBNK',
    side: 'BUY',
    type: 'LIMIT',
    price: 600.00,
    quantity: 100
  });

  const litSNbnk = accounts.getOrCreateUser('lit_s_nbnk', 'Lit S', false);
  litSNbnk.holdings.set('NBNK', { quantity: 100, avgPrice: 590, lockedQty: 0, shortQuantity: 0, shortAvgPrice: 0, lockedShortQty: 0 });
  matching.submitOrder({
    userId: 'lit_s_nbnk',
    userName: 'Lit S',
    symbol: 'NBNK',
    side: 'SELL',
    type: 'LIMIT',
    price: 610.00,
    quantity: 100
  });

  // Resting Dark Sell: 40 shares
  const darkSNbnk = accounts.getOrCreateUser('dark_s_nbnk', 'Dark S', false);
  darkSNbnk.holdings.set('NBNK', { quantity: 40, avgPrice: 595, lockedQty: 0, shortQuantity: 0, shortAvgPrice: 0, lockedShortQty: 0 });
  darkPool.submitOrder({
    userId: 'dark_s_nbnk',
    userName: 'Dark S',
    symbol: 'NBNK',
    side: 'SELL',
    type: 'MIDPOINT_PEG',
    quantity: 40
  });

  // Incoming IOC Buy for 100 shares -> matches 40 shares, remaining 60 shares cancelled immediately
  const darkBNbnk = accounts.getOrCreateUser('dark_b_nbnk', 'Dark B', false);
  const initialCredits = darkBNbnk.credits;

  const iocRes = darkPool.submitOrder({
    userId: 'dark_b_nbnk',
    userName: 'Dark B',
    symbol: 'NBNK',
    side: 'BUY',
    type: 'IOC_MIDPOINT',
    quantity: 100
  });

  assert.equal(iocRes.success, true);
  assert.equal(iocRes.trades.length, 1);
  assert.equal(iocRes.trades[0].quantity, 40);
  assert.equal(iocRes.trades[0].price, 605.00);

  assert.equal(iocRes.order.filledQuantity, 40);
  assert.equal(iocRes.order.status, 'PARTIALLY_FILLED');
  assert.equal(iocRes.order.iocCancelledRemainder, 60);

  // Ensure remaining unexecuted 60 shares do NOT rest in the dark book
  const darkDepth = darkPool.getDarkBookDepth('NBNK');
  assert.equal(darkDepth.totalBuyVolume, 0);
  assert.equal(darkDepth.buyOrderCount, 0);

  // Ensure reserved capital for 60 unexecuted shares was unlocked
  // Cost paid for 40 shares @ 605 = 24,200 credits + maker transaction fee
  assert.equal(darkBNbnk.lockedCredits, 0);
  const tradeFee = iocRes.trades[0].fee || 2.42;
  assert.equal(darkBNbnk.credits, +(initialCredits - 24200 - tradeFee).toFixed(2));
});

test('5. Minimum Execution Size (MES) constraint and limit price protection', () => {
  const accounts = new AccountManager(100000);
  const matching = new MatchingEngine(['AERO'], accounts);
  const darkPool = new DarkPoolATS(matching, accounts, { minBlockSize: 10 });

  // Lit Book: Bid $340.00, Ask $350.00 -> Midpoint $345.00
  accounts.getOrCreateUser('lit_b_aero', 'Lit B', false);
  matching.submitOrder({
    userId: 'lit_b_aero',
    userName: 'Lit B',
    symbol: 'AERO',
    side: 'BUY',
    type: 'LIMIT',
    price: 340.00,
    quantity: 100
  });

  const litSAero = accounts.getOrCreateUser('lit_s_aero', 'Lit S', false);
  litSAero.holdings.set('AERO', { quantity: 100, avgPrice: 330, lockedQty: 0, shortQuantity: 0, shortAvgPrice: 0, lockedShortQty: 0 });
  matching.submitOrder({
    userId: 'lit_s_aero',
    userName: 'Lit S',
    symbol: 'AERO',
    side: 'SELL',
    type: 'LIMIT',
    price: 350.00,
    quantity: 100
  });

  // Resting Dark Buy: 100 shares with MES = 80 shares (will not execute against small fills < 80)
  accounts.getOrCreateUser('inst_buyer_mes', 'MES Buyer', false);
  darkPool.submitOrder({
    userId: 'inst_buyer_mes',
    userName: 'MES Buyer',
    symbol: 'AERO',
    side: 'BUY',
    type: 'MIDPOINT_PEG',
    quantity: 100,
    minQuantity: 80
  });

  // Contra Dark Sell arrives with only 30 shares (below MES of 80)
  const smallSeller = accounts.getOrCreateUser('small_seller', 'Small Seller', false);
  smallSeller.holdings.set('AERO', { quantity: 30, avgPrice: 335, lockedQty: 0, shortQuantity: 0, shortAvgPrice: 0, lockedShortQty: 0 });
  const smallRes = darkPool.submitOrder({
    userId: 'small_seller',
    userName: 'Small Seller',
    symbol: 'AERO',
    side: 'SELL',
    type: 'MIDPOINT_PEG',
    quantity: 30
  });

  // No match should occur because 30 < 80
  assert.equal(smallRes.trades.length, 0);

  // Contra Dark Sell arrives with 85 shares (satisfies MES >= 80)
  const blockSeller = accounts.getOrCreateUser('block_seller', 'Block Seller', false);
  blockSeller.holdings.set('AERO', { quantity: 85, avgPrice: 335, lockedQty: 0, shortQuantity: 0, shortAvgPrice: 0, lockedShortQty: 0 });
  const blockRes = darkPool.submitOrder({
    userId: 'block_seller',
    userName: 'Block Seller',
    symbol: 'AERO',
    side: 'SELL',
    type: 'MIDPOINT_PEG',
    quantity: 85
  });

  assert.equal(blockRes.trades.length, 1);
  assert.equal(blockRes.trades[0].quantity, 85);
  assert.equal(blockRes.trades[0].price, 345.00);

  // Limit Price Protection: BUY with price cap $344.00 when Midpoint is $345.00 -> skips match
  accounts.getOrCreateUser('cheap_buyer', 'Cheap Buyer', false);
  const cheapRes = darkPool.submitOrder({
    userId: 'cheap_buyer',
    userName: 'Cheap Buyer',
    symbol: 'AERO',
    side: 'BUY',
    type: 'LIMIT_MIDPOINT',
    price: 344.00, // Ceiling below midpoint of $345
    quantity: 20
  });
  assert.equal(cheapRes.trades.length, 0); // No match because midpoint > cap
});

test('6. Dark pool order cancellation and fund unlock verification', () => {
  const accounts = new AccountManager(100000);
  const matching = new MatchingEngine(['MEDL'], accounts);
  const darkPool = new DarkPoolATS(matching, accounts, { minBlockSize: 10 });

  const trader = accounts.getOrCreateUser('cancel_trader', 'Cancel Trader', false);
  const initialCredits = trader.credits;

  const orderRes = darkPool.submitOrder({
    userId: 'cancel_trader',
    userName: 'Cancel Trader',
    symbol: 'MEDL',
    side: 'BUY',
    type: 'MIDPOINT_PEG',
    quantity: 50
  });

  assert.equal(orderRes.success, true);
  assert.ok(trader.lockedCredits > 0);

  // Cancel order
  const cancelRes = darkPool.cancelOrder(orderRes.order.id, 'cancel_trader');
  assert.equal(cancelRes.success, true);
  assert.equal(cancelRes.order.status, 'CANCELLED');

  // Verify credits unlocked completely
  assert.equal(trader.lockedCredits, 0);
  assert.equal(trader.credits, initialCredits);
});

test('7. REST API Endpoints for Dark Pool & ATS', async () => {
  const baseUrl = 'http://localhost:3000';
  let serverProcess = null;

  // Check if live server is reachable; if not, spin up daemon for test
  let isReachable = false;
  try {
    const ping = await fetch(`${baseUrl}/api/v1/ping`, { signal: AbortSignal.timeout(600) });
    if (ping.ok) isReachable = true;
  } catch (e) {
    isReachable = false;
  }

  if (!isReachable) {
    const { spawn } = await import('node:child_process');
    serverProcess = spawn('node', ['server.js'], { stdio: 'ignore' });
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const ping = await fetch(`${baseUrl}/api/v1/ping`, { signal: AbortSignal.timeout(500) });
        if (ping.ok) {
          isReachable = true;
          break;
        }
      } catch (e) {}
    }
  }

  try {
    assert.ok(isReachable, 'Server must be active on port 3000 for Dark Pool REST API tests');

    // 1. Fetch Dark Pool NBBO
    const nbboRes = await fetch(`${baseUrl}/api/v1/darkpool/nbbo/AUTO`);
    assert.ok(nbboRes.status === 200 || nbboRes.status === 404);

    // 2. Fetch Dark Pool Depth
    const depthRes = await fetch(`${baseUrl}/api/v1/darkpool/depth/AUTO`);
    assert.equal(depthRes.status, 200);
    const depthData = await depthRes.json();
    assert.equal(depthData.symbol, 'AUTO');
    assert.equal(typeof depthData.totalBuyVolume, 'number');
    assert.equal(typeof depthData.totalSellVolume, 'number');

    // 3. Fetch Dark Pool Platform Stats
    const statsRes = await fetch(`${baseUrl}/api/v1/darkpool/stats`);
    assert.equal(statsRes.status, 200);
    const statsData = await statsRes.json();
    assert.equal(typeof statsData.totalTrades, 'number');
    assert.equal(typeof statsData.totalVolume, 'number');
    assert.equal(typeof statsData.totalPriceImprovement, 'number');

    // 4. Fetch Dark Pool Trades History
    const tradesRes = await fetch(`${baseUrl}/api/v1/darkpool/trades`);
    assert.equal(tradesRes.status, 200);
    const tradesData = await tradesRes.json();
    assert.ok(Array.isArray(tradesData.trades));

    // 5. Submit Dark Pool Order via API
    const orderRes = await fetch(`${baseUrl}/api/v1/darkpool/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'api_dark_trader',
        userName: 'API Dark Trader',
        symbol: 'AUTO',
        side: 'BUY',
        type: 'MIDPOINT_PEG',
        quantity: 25
      })
    });
    assert.equal(orderRes.status, 201);
    const orderData = await orderRes.json();
    assert.equal(orderData.success, true);
    assert.equal(orderData.order.venue, 'DARK_POOL');
    assert.equal(orderData.order.symbol, 'AUTO');

    // 6. Query User's Dark Pool Orders
    const userOrdersRes = await fetch(`${baseUrl}/api/v1/darkpool/orders?userId=api_dark_trader`);
    assert.equal(userOrdersRes.status, 200);
    const userOrders = await userOrdersRes.json();
    assert.ok(userOrders.count >= 1);

    // 7. Cancel Dark Pool Order via API
    const cancelRes = await fetch(`${baseUrl}/api/v1/darkpool/orders/${orderData.order.id}?userId=api_dark_trader`, {
      method: 'DELETE'
    });
    assert.equal(cancelRes.status, 200);
    const cancelData = await cancelRes.json();
    assert.equal(cancelData.success, true);
    assert.equal(cancelData.order.status, 'CANCELLED');
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
});
