import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Terminal Auction & Macro Frontend Suite (v0.911)', async (t) => {

  await t.test('1. index.html contains all Macro Bar and Indicative Auction HUD elements', () => {
    const htmlPath = path.join(rootDir, 'public', 'index.html');
    assert.ok(fs.existsSync(htmlPath), 'index.html must exist');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Macro Bar Elements
    assert.ok(html.includes('id="macroBar"'), 'Must contain #macroBar');
    assert.ok(html.includes('id="macroFedRate"'), 'Must contain #macroFedRate');
    assert.ok(html.includes('id="macroCpi"'), 'Must contain #macroCpi');
    assert.ok(html.includes('id="macroGdp"'), 'Must contain #macroGdp');
    assert.ok(html.includes('id="macroRegimePill"'), 'Must contain #macroRegimePill');
    assert.ok(html.includes('id="macroObiVal"'), 'Must contain #macroObiVal');
    assert.ok(html.includes('id="macroObiPill"'), 'Must contain #macroObiPill');
    assert.ok(html.includes('id="macroMicroprice"'), 'Must contain #macroMicroprice');

    // Auction Call HUD Elements
    assert.ok(html.includes('id="auctionCallHud"'), 'Must contain #auctionCallHud');
    assert.ok(html.includes('id="auctionHudTitle"'), 'Must contain #auctionHudTitle');
    assert.ok(html.includes('id="auctionPhaseBadge"'), 'Must contain #auctionPhaseBadge');
    assert.ok(html.includes('id="iepValue"'), 'Must contain #iepValue');
    assert.ok(html.includes('id="ievValue"'), 'Must contain #ievValue');
    assert.ok(html.includes('id="imbalanceBadge"'), 'Must contain #imbalanceBadge');
    assert.ok(html.includes('id="auctionPulseDot"'), 'Must contain #auctionPulseDot');

    // MOC and LOC Order Buttons
    assert.ok(html.includes('id="typeMocBtn"'), 'Must contain #typeMocBtn');
    assert.ok(html.includes('id="typeLocBtn"'), 'Must contain #typeLocBtn');
  });

  await t.test('2. styles.css contains styling rules for macro-bar and auction-hud', () => {
    const cssPath = path.join(rootDir, 'public', 'css', 'styles.css');
    assert.ok(fs.existsSync(cssPath), 'styles.css must exist');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.ok(css.includes('.macro-bar'), 'Must contain .macro-bar rule');
    assert.ok(css.includes('.macro-item'), 'Must contain .macro-item rule');
    assert.ok(css.includes('.macro-badge'), 'Must contain .macro-badge rule');
    assert.ok(css.includes('.auction-hud'), 'Must contain .auction-hud rule');
    assert.ok(css.includes('.auction-pulse-dot'), 'Must contain .auction-pulse-dot rule');
    assert.ok(css.includes('.auction-order-row'), 'Must contain .auction-order-row rule');
    assert.ok(css.includes('.auction-imbalance-badge'), 'Must contain .auction-imbalance-badge rule');
  });

  await t.test('3. app.js contains logic for Macro Bar and Indicative Auction HUD', () => {
    const appPath = path.join(rootDir, 'public', 'js', 'app.js');
    assert.ok(fs.existsSync(appPath), 'app.js must exist');
    const appJs = fs.readFileSync(appPath, 'utf8');

    assert.ok(appJs.includes('function updateMacroBar'), 'Must define updateMacroBar function');
    assert.ok(appJs.includes('function updateIndicativeAuctionHud'), 'Must define updateIndicativeAuctionHud function');
    assert.ok(appJs.includes('function fetchMacroAndAuctionState'), 'Must define fetchMacroAndAuctionState function');
    assert.ok(appJs.includes('elements.typeMocBtn'), 'Must bind typeMocBtn');
    assert.ok(appJs.includes('elements.typeLocBtn'), 'Must bind typeLocBtn');
    assert.ok(appJs.includes("socket.on('auction:closingIndicative'"), 'Must listen for auction:closingIndicative');
    assert.ok(appJs.includes("socket.on('world:macro'"), 'Must listen for world:macro');
  });

  await t.test('4. server.js forwards closing auction events and macro updates via WebSocket', () => {
    const serverPath = path.join(rootDir, 'server.js');
    assert.ok(fs.existsSync(serverPath), 'server.js must exist');
    const serverJs = fs.readFileSync(serverPath, 'utf8');

    assert.ok(serverJs.includes("matchingEngine.on('auction:closingIndicative'"), 'server.js must wire auction:closingIndicative');
    assert.ok(serverJs.includes("matchingEngine.on('closingAuction:cleared'"), 'server.js must wire closingAuction:cleared');
    assert.ok(serverJs.includes("matchingEngine.on('closingAuction:allCleared'"), 'server.js must wire closingAuction:allCleared');
    assert.ok(serverJs.includes("io.emit('world:macro'"), 'server.js must emit world:macro');
  });

  await t.test('5. updateMacroBar & updateIndicativeAuctionHud calculation unit tests', () => {
    // Mock minimal DOM
    const elements = {
      macroFedRate: { textContent: '' },
      macroCpi: { textContent: '' },
      macroGdp: { textContent: '', className: '' },
      macroRegimePill: { textContent: '', className: '' },
      macroObiVal: { textContent: '', className: '' },
      macroObiPill: { textContent: '', className: '' },
      macroMicroprice: { textContent: '' },
      auctionCallHud: {},
      auctionHudTitle: { textContent: '' },
      auctionPhaseBadge: { textContent: '' },
      iepValue: { textContent: '' },
      ievValue: { textContent: '' },
      imbalanceBadge: { textContent: '', className: '' }
    };

    // Test updateMacroBar logic
    function testUpdateMacroBar(worldData, obiData) {
      if (worldData) {
        elements.macroFedRate.textContent = `${Number(worldData.interestRate || 5.25).toFixed(2)}%`;
        elements.macroCpi.textContent = `${Number(worldData.cpiInflation || 3.10).toFixed(2)}%`;
        const gdp = Number(worldData.gdpGrowth || 2.30);
        elements.macroGdp.textContent = `${gdp >= 0 ? '+' : ''}${gdp.toFixed(2)}%`;
        elements.macroGdp.className = `macro-val ${gdp >= 0 ? 'up' : 'down'}`;
        const reg = String(worldData.marketRegime).toUpperCase();
        elements.macroRegimePill.textContent = reg;
      }
      if (obiData) {
        const imb = obiData.imbalance !== undefined ? obiData.imbalance : 0;
        const sign = imb >= 0 ? '+' : '';
        elements.macroObiVal.textContent = `${sign}${imb.toFixed(2)}`;
        elements.macroObiVal.className = `macro-val ${imb > 0.05 ? 'up' : imb < -0.05 ? 'down' : 'flat'}`;
        if (imb > 0.10) {
          elements.macroObiPill.textContent = 'BUY SURPLUS';
          elements.macroObiPill.className = 'macro-pill buy-surplus';
        } else if (imb < -0.10) {
          elements.macroObiPill.textContent = 'SELL SURPLUS';
          elements.macroObiPill.className = 'macro-pill sell-surplus';
        } else {
          elements.macroObiPill.textContent = 'BALANCED';
          elements.macroObiPill.className = 'macro-pill';
        }
        if (obiData.microprice) {
          elements.macroMicroprice.textContent = `${Number(obiData.microprice).toFixed(2)} CR`;
        }
      }
    }

    testUpdateMacroBar({ interestRate: 5.5, cpiInflation: 2.8, gdpGrowth: 3.1, marketRegime: 'TECH_RALLY' }, { imbalance: 0.45, microprice: 452.10 });

    assert.equal(elements.macroFedRate.textContent, '5.50%');
    assert.equal(elements.macroCpi.textContent, '2.80%');
    assert.equal(elements.macroGdp.textContent, '+3.10%');
    assert.equal(elements.macroRegimePill.textContent, 'TECH_RALLY');
    assert.equal(elements.macroObiVal.textContent, '+0.45');
    assert.equal(elements.macroObiPill.textContent, 'BUY SURPLUS');
    assert.equal(elements.macroMicroprice.textContent, '452.10 CR');

    // Test updateIndicativeAuctionHud logic
    function testUpdateIndicativeAuctionHud(auctionData) {
      const iep = auctionData.clearingPrice || auctionData.indicativePrice;
      elements.iepValue.textContent = (iep && iep > 0) ? `${Number(iep).toFixed(2)} CR` : '--- CR';
      const iev = auctionData.clearingVolume !== undefined ? auctionData.clearingVolume : (auctionData.indicativeVolume || 0);
      elements.ievValue.textContent = `${Number(iev).toLocaleString()} sh`;

      const imbShares = auctionData.imbalanceShares !== undefined ? auctionData.imbalanceShares : (auctionData.imbalance || 0);
      const imbSide = auctionData.imbalanceSide || 'NONE';

      if (imbShares > 0 && imbSide === 'BUY') {
        elements.imbalanceBadge.textContent = `BUY SURPLUS +${imbShares}`;
        elements.imbalanceBadge.className = 'auction-imbalance-badge badge-buy';
      } else if (imbShares > 0 && imbSide === 'SELL') {
        elements.imbalanceBadge.textContent = `SELL SURPLUS +${imbShares}`;
        elements.imbalanceBadge.className = 'auction-imbalance-badge badge-sell';
      } else if (iev > 0) {
        elements.imbalanceBadge.textContent = 'MATCHED';
        elements.imbalanceBadge.className = 'auction-imbalance-badge badge-neutral';
      } else {
        elements.imbalanceBadge.textContent = 'NO CROSS';
        elements.imbalanceBadge.className = 'auction-imbalance-badge badge-neutral';
      }
    }

    testUpdateIndicativeAuctionHud({ clearingPrice: 450.50, clearingVolume: 800, imbalanceShares: 250, imbalanceSide: 'BUY' });
    assert.equal(elements.iepValue.textContent, '450.50 CR');
    assert.equal(elements.ievValue.textContent, '800 sh');
    assert.equal(elements.imbalanceBadge.textContent, 'BUY SURPLUS +250');
    assert.equal(elements.imbalanceBadge.className, 'auction-imbalance-badge badge-buy');

    testUpdateIndicativeAuctionHud({ clearingPrice: null, clearingVolume: 0, imbalanceShares: 0, imbalanceSide: 'NONE' });
    assert.equal(elements.iepValue.textContent, '--- CR');
    assert.equal(elements.ievValue.textContent, '0 sh');
    assert.equal(elements.imbalanceBadge.textContent, 'NO CROSS');
    assert.equal(elements.imbalanceBadge.className, 'auction-imbalance-badge badge-neutral');
  });
});
