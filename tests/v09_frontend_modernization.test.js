import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

console.log('[TEST] Starting v0.9 Frontend Modernization & Responsive Layout Test Suite...\n');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

// 1. Verify Responsive CSS Breakpoints and Rules
console.log('Test 1: Responsive Layout Breakpoints & Mobile Bottom Sheet CSS');
const cssContent = fs.readFileSync(path.join(root, 'public', 'css', 'styles.css'), 'utf8');

assert(cssContent.includes('@media (max-width: 1200px)'), 'Should contain 1200px responsive breakpoint');
assert(cssContent.includes('@media (max-width: 992px)'), 'Should contain 992px responsive breakpoint');
assert(cssContent.includes('@media (max-width: 768px)'), 'Should contain 768px mobile breakpoint');
assert(cssContent.includes('@media (max-width: 480px)'), 'Should contain 480px small mobile breakpoint');
assert(cssContent.includes('.mobile-trade-bar'), 'Should contain mobile quick trade floating bar styling');
assert(cssContent.includes('.mobile-drawer-open'), 'Should contain mobile order bottom sheet drawer styling');
console.log('[PASS] All 4 responsive breakpoints and mobile drawer CSS verified\n');

// 2. Verify HTML Workspace & Sound Board Modals
console.log('Test 2: Terminal HTML Structure (Workspace Layout & Sound Board)');
const htmlContent = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

// Header buttons
assert(htmlContent.includes('id="layoutBtn"'), 'Topbar must have layout button');
assert(htmlContent.includes('id="soundBoardBtn"'), 'Topbar must have sound board button');

// Workspace modal and presets
assert(htmlContent.includes('id="workspaceModal"'), 'HTML must have workspace modal');
assert(htmlContent.includes('data-preset="PRO"'), 'Must have PRO preset');
assert(htmlContent.includes('data-preset="CHART_FOCUS"'), 'Must have CHART_FOCUS preset');
assert(htmlContent.includes('data-preset="SPEED"'), 'Must have SPEED preset');
assert(htmlContent.includes('data-preset="ANALYTICS"'), 'Must have ANALYTICS preset');

// Panel IDs
assert(htmlContent.includes('id="colWatchlist"'), 'Must have colWatchlist');
assert(htmlContent.includes('id="colCenter"'), 'Must have colCenter');
assert(htmlContent.includes('id="colOrder"'), 'Must have colOrder');
assert(htmlContent.includes('id="mobileTradeBar"'), 'Must have mobileTradeBar');

// Audio sound board modal
assert(htmlContent.includes('id="soundBoardModal"'), 'HTML must have sound board modal');
assert(htmlContent.includes('id="masterVolSlider"'), 'Must have master volume slider');
assert(htmlContent.includes('data-channel="fills"'), 'Must have fills sound channel');
assert(htmlContent.includes('data-channel="ticks"'), 'Must have ticks sound channel');
assert(htmlContent.includes('data-channel="alerts"'), 'Must have alerts sound channel');
assert(htmlContent.includes('data-channel="bells"'), 'Must have bells sound channel');
assert(htmlContent.includes('data-channel="news"'), 'Must have news sound channel');
assert(htmlContent.includes('data-channel="fanfare"'), 'Must have fanfare sound channel');
console.log('[PASS] Workspace presets, sound board channels, and mobile triggers verified in HTML\n');

// 3. Verify JavaScript Logic in app.js
console.log('Test 3: JavaScript Workspace Manager & Sound Board Engine');
const jsContent = fs.readFileSync(path.join(root, 'public', 'js', 'app.js'), 'utf8');

assert(jsContent.includes('function applyWorkspaceLayout()'), 'Should define applyWorkspaceLayout function');
assert(jsContent.includes('function syncSoundBoardUI()'), 'Should define syncSoundBoardUI function');
assert(jsContent.includes('function updateMobileTradeBar()'), 'Should define updateMobileTradeBar function');
assert(jsContent.includes('function testAuditionSound('), 'Should define testAuditionSound function');
assert(jsContent.includes('getChannelGain('), 'Should compute channel gain with master volume');
console.log('[PASS] JavaScript layout presets, sound board logic, and mobile drawer verified\n');

// 4. Verify JavaScript Compilation & Zero Syntax Errors
console.log('Test 4: JavaScript Syntax & Script Compilation Verification');
try {
  vm.compileFunction(jsContent);
  console.log('[PASS] public/js/app.js parsed and compiled cleanly with zero syntax errors\n');
} catch (syntaxErr) {
  assert.fail(`public/js/app.js has syntax error: ${syntaxErr.message}`);
}


console.log('[SUCCESS] ALL FRONTEND MODERNIZATION TESTS PASSED!\n');
process.exit(0);

