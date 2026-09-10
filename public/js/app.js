/**
 * MarketArena — Professional Financial Trading Terminal
 */

const state = {
  user: {
    id: localStorage.getItem('marketarena_userid') || null,
    name: localStorage.getItem('marketarena_username') || null
  },
  selectedSymbol: 'AUTO',
  orderSide: 'BUY',
  orderType: 'LIMIT',
  companies: new Map(), // symbol -> company
  depths: new Map(),    // symbol -> depth
  clock: {
    day: 1,
    phase: 'REGULAR_HOURS',
    phaseRemainingSec: 180,
    simulatedTime: '09:30:00',
    isTradingOpen: true
  },
  portfolio: null,
  openOrders: [],
  leaderboard: [],
  newsFeed: [],
  soundEnabled: true,
  activeTab: 'portfolio'
};

// Subtle Web Audio Synthesizer
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTickTone(isBuy) {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isBuy ? 780 : 640, ctx.currentTime);
    gain.gain.setValueAtTime(0.012, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  } catch (e) {
    // Audio restricted prior to user gesture
  }
}

function playTradeFillTone(isBuy) {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    const baseFreq = isBuy ? 587.33 : 440; // D5 for buy, A4 for sell
    osc1.frequency.setValueAtTime(baseFreq, now);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.18);
    osc2.frequency.setValueAtTime(baseFreq * 1.25, now);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.28);
    osc2.stop(now + 0.28);
  } catch (e) {}
}

function playBellTone(isOpening) {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isOpening ? 523.25 : 392.00, now); // C5 or G4

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 1.2);
  } catch (e) {}
}

function playNewsTone() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1174.66, now + 0.08);

    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.22);
  } catch (e) {}
}

function playAchievementTone() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.06, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.35);
    });
  } catch (e) {}
}

function playStopTriggerTone() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(650, now);
    osc.frequency.linearRampToValueAtTime(320, now + 0.25);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  } catch (e) {}
}

// Socket Connection
const socket = io();

// DOM References
const elements = {
  // Top bar
  sessionTag: document.getElementById('sessionTag'),
  clockPhaseText: document.getElementById('clockPhaseText'),
  clockSimTime: document.getElementById('clockSimTime'),
  clockCountdown: document.getElementById('clockCountdown'),
  tickerStrip: document.getElementById('tickerStrip'),
  displayUserName: document.getElementById('displayUserName'),
  displayUserId: document.getElementById('displayUserId'),
  editNameBtn: document.getElementById('editNameBtn'),
  audioToggle: document.getElementById('audioToggle'),
  // News
  newsHeadline: document.getElementById('newsHeadline'),
  // Watchlist & Fundamentals
  watchlistContainer: document.getElementById('watchlistContainer'),
  fundTitle: document.getElementById('fundTitle'),
  fundSector: document.getElementById('fundSector'),
  fundMcap: document.getElementById('fundMcap'),
  fundPE: document.getElementById('fundPE'),
  fundMargin: document.getElementById('fundMargin'),
  fundSentiment: document.getElementById('fundSentiment'),
  // Center Column: Hero & Chart
  heroName: document.getElementById('heroName'),
  heroSymbol: document.getElementById('heroSymbol'),
  heroPrice: document.getElementById('heroPrice'),
  heroChange: document.getElementById('heroChange'),
  heroHigh: document.getElementById('heroHigh'),
  heroLow: document.getElementById('heroLow'),
  heroVolume: document.getElementById('heroVolume'),
  chartCanvas: document.getElementById('marketChartCanvas'),
  chartContainer: document.getElementById('chartContainer'),
  tradesFeedContainer: document.getElementById('tradesFeedContainer'),
  // Order Form
  sideBuyTab: document.getElementById('sideBuyTab'),
  sideSellTab: document.getElementById('sideSellTab'),
  typeLimitBtn: document.getElementById('typeLimitBtn'),
  typeMarketBtn: document.getElementById('typeMarketBtn'),
  typeStopLossBtn: document.getElementById('typeStopLossBtn'),
  typeStopLimitBtn: document.getElementById('typeStopLimitBtn'),
  limitPriceField: document.getElementById('limitPriceField'),
  orderPriceInput: document.getElementById('orderPriceInput'),
  useBestPriceBtn: document.getElementById('useBestPriceBtn'),
  stopPriceField: document.getElementById('stopPriceField'),
  orderStopPriceInput: document.getElementById('orderStopPriceInput'),
  useCurrentAsStopBtn: document.getElementById('useCurrentAsStopBtn'),
  orderQtyInput: document.getElementById('orderQtyInput'),
  orderEstimatedTotal: document.getElementById('orderEstimatedTotal'),
  submitOrderBtn: document.getElementById('submitOrderBtn'),
  orderErrorMsg: document.getElementById('orderErrorMsg'),
  orderForm: document.getElementById('orderForm'),
  // Order Book
  asksContainer: document.getElementById('asksContainer'),
  bidsContainer: document.getElementById('bidsContainer'),
  midPriceText: document.getElementById('midPriceText'),
  bookSpreadText: document.getElementById('bookSpreadText'),
  // Tabs Header
  tabBtnPortfolio: document.getElementById('tabBtnPortfolio'),
  tabBtnOpenOrders: document.getElementById('tabBtnOpenOrders'),
  tabBtnMyTrades: document.getElementById('tabBtnMyTrades'),
  tabBtnAchievements: document.getElementById('tabBtnAchievements'),
  tabBtnLeaderboard: document.getElementById('tabBtnLeaderboard'),
  tabBtnNews: document.getElementById('tabBtnNews'),
  openOrdersBadge: document.getElementById('openOrdersBadge'),
  myTradesBadge: document.getElementById('myTradesBadge'),
  achievementsBadge: document.getElementById('achievementsBadge'),
  newsCountBadge: document.getElementById('newsCountBadge'),
  // Tab Views
  viewPortfolio: document.getElementById('viewPortfolio'),
  viewOpenOrders: document.getElementById('viewOpenOrders'),
  viewMyTrades: document.getElementById('viewMyTrades'),
  viewAchievements: document.getElementById('viewAchievements'),
  viewLeaderboard: document.getElementById('viewLeaderboard'),
  viewNews: document.getElementById('viewNews'),
  // Achievements View
  achievementsScore: document.getElementById('achievementsScore'),
  achievementsGridContainer: document.getElementById('achievementsGridContainer'),
  // Toast Container
  toastContainer: document.getElementById('toastContainer'),
  // End-of-Day Modal
  daySummaryModal: document.getElementById('daySummaryModal'),
  summaryDayBadge: document.getElementById('summaryDayBadge'),
  closeDaySummaryBtn: document.getElementById('closeDaySummaryBtn'),
  dismissDaySummaryBtn: document.getElementById('dismissDaySummaryBtn'),
  summaryDayPnl: document.getElementById('summaryDayPnl'),
  summaryNetWorth: document.getElementById('summaryNetWorth'),
  summaryCash: document.getElementById('summaryCash'),
  summaryStockVal: document.getElementById('summaryStockVal'),
  summaryTradesCount: document.getElementById('summaryTradesCount'),
  summaryVolume: document.getElementById('summaryVolume'),
  summaryTopGainer: document.getElementById('summaryTopGainer'),
  summaryNextDayCountdown: document.getElementById('summaryNextDayCountdown'),
  // Portfolio Stats
  metricNetWorth: document.getElementById('metricNetWorth'),
  metricCash: document.getElementById('metricCash'),
  metricStockVal: document.getElementById('metricStockVal'),
  metricLocked: document.getElementById('metricLocked'),
  metricTotalPnL: document.getElementById('metricTotalPnL'),
  metricRealizedPnL: document.getElementById('metricRealizedPnL'),
  holdingsTableBody: document.getElementById('holdingsTableBody'),
  openOrdersTableBody: document.getElementById('openOrdersTableBody'),
  myTradesTableBody: document.getElementById('myTradesTableBody'),
  leaderboardTableBody: document.getElementById('leaderboardTableBody'),
  newsLogContainer: document.getElementById('newsLogContainer'),
  // Nickname Modal
  nicknameModal: document.getElementById('nicknameModal'),
  nicknameForm: document.getElementById('nicknameForm'),
  nicknameInput: document.getElementById('nicknameInput')
};

// Formatting Utilities
const formatCurrency = (val) => Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' CR';
const formatNumber = (val) => Number(val || 0).toLocaleString('en-US');

// Canvas Candlestick & Volume Chart Renderer
let currentCandlesList = [];
let chartHover = { active: false, x: 0, y: 0, candle: null };

function initChart() {
  const canvas = elements.chartCanvas;
  if (!canvas) return;

  function handleResize() {
    if (!elements.chartContainer) return;
    const rect = elements.chartContainer.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    drawChart();
  }

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    chartHover.active = true;
    chartHover.x = (e.clientX - rect.left) * dpr;
    chartHover.y = (e.clientY - rect.top) * dpr;
    drawChart();
  });

  canvas.addEventListener('mouseleave', () => {
    chartHover.active = false;
    chartHover.candle = null;
    drawChart();
  });

  window.addEventListener('resize', handleResize);
  setTimeout(handleResize, 50);
}

function drawChart() {
  const canvas = elements.chartCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const dpr = window.devicePixelRatio || 1;

  ctx.clearRect(0, 0, w, h);
  if (!currentCandlesList || currentCandlesList.length === 0) return;

  const candles = currentCandlesList.slice(-50);
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let maxVolume = 0;

  for (const c of candles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
    if (c.volume > maxVolume) maxVolume = c.volume;
  }
  const pad = (maxPrice - minPrice) * 0.12 || 1;
  minPrice -= pad;
  maxPrice += pad;
  if (maxVolume === 0) maxVolume = 100;

  const rightMargin = 64 * dpr;
  const topPadding = 24 * dpr;
  const chartW = w - rightMargin;

  // Split canvas: Price (top 75%), Volume (bottom 20%)
  const volumeH = Math.floor(h * 0.20);
  const priceH = Math.floor(h * 0.72) - topPadding;
  const volumeTop = h - volumeH - (6 * dpr);

  const candleW = Math.max(3 * dpr, chartW / candles.length);

  // Background gridlines for Price
  ctx.strokeStyle = '#171b20';
  ctx.lineWidth = 1;
  ctx.font = `${Math.floor(10 * dpr)}px IBM Plex Mono, monospace`;
  ctx.fillStyle = '#565f6c';

  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const y = Math.floor(topPadding + priceH * (i / gridSteps));
    const priceVal = maxPrice - ((maxPrice - minPrice) * (i / gridSteps));

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(chartW, y);
    ctx.stroke();

    ctx.fillText(priceVal.toFixed(2), chartW + (6 * dpr), y + (4 * dpr));
  }

  // Volume separator line & label
  ctx.strokeStyle = '#20262e';
  ctx.beginPath();
  ctx.moveTo(0, volumeTop);
  ctx.lineTo(chartW, volumeTop);
  ctx.stroke();

  ctx.fillStyle = '#3a424e';
  ctx.font = `${Math.floor(8.5 * dpr)}px IBM Plex Mono, monospace`;
  ctx.fillText('VOL', 8 * dpr, volumeTop - (4 * dpr));
  ctx.fillText(maxVolume.toString(), chartW + (6 * dpr), volumeTop + (12 * dpr));

  // Determine hovered candle index if mouse is active
  let hoveredIndex = -1;
  if (chartHover.active && chartHover.x >= 0 && chartHover.x <= chartW) {
    hoveredIndex = Math.min(candles.length - 1, Math.max(0, Math.floor(chartHover.x / candleW)));
    chartHover.candle = candles[hoveredIndex];
  }

  // Draw Candlesticks and Volume Bars
  candles.forEach((c, idx) => {
    const x = Math.floor(idx * candleW + candleW / 2);
    const isUp = c.close >= c.open;
    const bullColor = '#26a69a';
    const bearColor = '#ef5350';
    const color = isUp ? bullColor : bearColor;

    // Price coords
    const yHigh = Math.floor(topPadding + priceH - ((c.high - minPrice) / (maxPrice - minPrice)) * priceH);
    const yLow = Math.floor(topPadding + priceH - ((c.low - minPrice) / (maxPrice - minPrice)) * priceH);
    const yOpen = Math.floor(topPadding + priceH - ((c.open - minPrice) / (maxPrice - minPrice)) * priceH);
    const yClose = Math.floor(topPadding + priceH - ((c.close - minPrice) / (maxPrice - minPrice)) * priceH);

    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, Math.floor(1 * dpr));
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    // Body
    ctx.fillStyle = color;
    const bodyTop = Math.min(yOpen, yClose);
    const bodyH = Math.max(2 * dpr, Math.abs(yClose - yOpen));
    const barW = Math.max(2 * dpr, candleW * 0.72);
    ctx.fillRect(Math.floor(x - barW / 2), bodyTop, Math.floor(barW), bodyH);

    // Volume Bar
    const vH = Math.max(1, Math.floor((c.volume / maxVolume) * volumeH));
    const vY = Math.floor(h - vH - (4 * dpr));
    ctx.fillStyle = isUp ? 'rgba(38, 166, 154, 0.35)' : 'rgba(239, 83, 80, 0.35)';
    ctx.fillRect(Math.floor(x - barW / 2), vY, Math.floor(barW), vH);
  });

  // Current Price Dashed Reference Line
  const comp = state.companies.get(state.selectedSymbol);
  if (comp) {
    const curY = Math.floor(topPadding + priceH - ((comp.price - minPrice) / (maxPrice - minPrice)) * priceH);
    const isUp = comp.change >= 0;
    ctx.strokeStyle = isUp ? '#26a69a' : '#ef5350';
    ctx.lineWidth = 1;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.beginPath();
    ctx.moveTo(0, curY);
    ctx.lineTo(chartW, curY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Price tag badge on right margin
    ctx.fillStyle = isUp ? '#132c25' : '#331918';
    ctx.fillRect(chartW, curY - (9 * dpr), rightMargin, 18 * dpr);
    ctx.strokeStyle = isUp ? '#26a69a' : '#ef5350';
    ctx.strokeRect(chartW, curY - (9 * dpr), rightMargin, 18 * dpr);
    ctx.fillStyle = isUp ? '#4ade80' : '#f87171';
    ctx.font = `${Math.floor(10 * dpr)}px IBM Plex Mono, monospace`;
    ctx.fillText(comp.price.toFixed(2), chartW + (5 * dpr), curY + (4 * dpr));
  }

  // Crosshair and Interactive Inspection Tooltip
  if (chartHover.active && chartHover.candle) {
    const hc = chartHover.candle;
    const hx = Math.floor(hoveredIndex * candleW + candleW / 2);
    const hy = Math.min(Math.floor(topPadding + priceH), Math.max(topPadding, chartHover.y));
    const hoverPrice = maxPrice - ((hy - topPadding) / priceH) * (maxPrice - minPrice);

    // Crosshair Lines
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1;
    ctx.setLineDash([2 * dpr, 2 * dpr]);

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.lineTo(hx, h - (4 * dpr));
    ctx.stroke();

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(0, hy);
    ctx.lineTo(chartW, hy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Cursor Price Badge on scale
    ctx.fillStyle = '#1e232b';
    ctx.fillRect(chartW, hy - (8 * dpr), rightMargin, 16 * dpr);
    ctx.strokeStyle = '#4b5563';
    ctx.strokeRect(chartW, hy - (8 * dpr), rightMargin, 16 * dpr);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(hoverPrice.toFixed(2), chartW + (5 * dpr), hy + (4 * dpr));

    // Top HUD Bar with OHLCV data
    const isUp = hc.close >= hc.open;
    const chgVal = hc.close - hc.open;
    const chgPct = hc.open > 0 ? (chgVal / hc.open) * 100 : 0;
    const sign = chgVal >= 0 ? '+' : '';
    const hudTime = new Date(hc.time * 1000).toLocaleTimeString([], { hour12: false });

    ctx.fillStyle = 'rgba(13, 16, 20, 0.9)';
    ctx.fillRect(8 * dpr, 4 * dpr, 420 * dpr, 18 * dpr);
    ctx.strokeStyle = '#262d38';
    ctx.strokeRect(8 * dpr, 4 * dpr, 420 * dpr, 18 * dpr);

    ctx.font = `${Math.floor(9.5 * dpr)}px IBM Plex Mono, monospace`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(hudTime, 14 * dpr, 16 * dpr);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`O:`, 78 * dpr, 16 * dpr);
    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(hc.open.toFixed(2), 92 * dpr, 16 * dpr);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`H:`, 144 * dpr, 16 * dpr);
    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(hc.high.toFixed(2), 158 * dpr, 16 * dpr);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`L:`, 210 * dpr, 16 * dpr);
    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(hc.low.toFixed(2), 224 * dpr, 16 * dpr);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`C:`, 276 * dpr, 16 * dpr);
    ctx.fillStyle = isUp ? '#4ade80' : '#f87171';
    ctx.fillText(`${hc.close.toFixed(2)} (${sign}${chgPct.toFixed(2)}%)`, 290 * dpr, 16 * dpr);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`V:`, 375 * dpr, 16 * dpr);
    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(hc.volume.toString(), 389 * dpr, 16 * dpr);
  }
}

function loadChartData(symbol) {
  socket.emit('chart:history', { symbol }, (candles) => {
    currentCandlesList = candles || [];
    drawChart();
  });
}

// User Profile Handling
function initUser() {
  if (!state.user.name) {
    elements.nicknameModal.classList.remove('hidden');
    elements.nicknameInput.focus();
  } else {
    joinMarket(state.user.name, state.user.id);
  }

  elements.nicknameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = elements.nicknameInput.value.trim();
    if (name) {
      elements.nicknameModal.classList.add('hidden');
      joinMarket(name, state.user.id);
    }
  });

  elements.editNameBtn.addEventListener('click', () => {
    elements.nicknameInput.value = state.user.name || '';
    elements.nicknameModal.classList.remove('hidden');
    elements.nicknameInput.focus();
  });

  elements.audioToggle.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    elements.audioToggle.textContent = state.soundEnabled ? 'MUTE' : 'UNMUTE';
    elements.audioToggle.style.color = state.soundEnabled ? 'var(--text-dim)' : 'var(--amber)';
  });
}

function joinMarket(name, existingId) {
  state.user.name = name;
  localStorage.setItem('marketarena_username', name);

  socket.emit('user:join', { desiredName: name, existingUserId: existingId });
}

// Render Functions
function renderClock(clk) {
  state.clock = clk;

  elements.clockPhaseText.textContent = clk.phase.replace('_', ' ');
  elements.clockSimTime.textContent = clk.simulatedTime;

  const mins = Math.floor(clk.phaseRemainingSec / 60);
  const secs = clk.phaseRemainingSec % 60;
  elements.clockCountdown.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function renderWatchlist() {
  elements.watchlistContainer.innerHTML = '';
  elements.tickerStrip.innerHTML = '';

  for (const comp of state.companies.values()) {
    const isUp = comp.change > 0;
    const isDown = comp.change < 0;
    const chgCls = isUp ? 'up' : isDown ? 'down' : 'flat';
    const sign = isUp ? '+' : '';
    const mark = comp.mark || comp.symbol.slice(0, 2);

    // Watchlist row
    const row = document.createElement('div');
    row.className = `watch-row ${comp.symbol === state.selectedSymbol ? 'active' : ''}`;
    row.id = `watchRow_${comp.symbol}`;
    row.innerHTML = `
      <div class="watch-mark">${mark}</div>
      <div>
        <div class="watch-sym">${comp.symbol}</div>
        <div class="watch-co">${comp.name}</div>
      </div>
      <div>
        <div class="watch-px" id="watchPx_${comp.symbol}">${comp.price.toFixed(2)}</div>
        <div class="watch-chg ${chgCls}" id="watchChg_${comp.symbol}">${sign}${comp.change.toFixed(2)}</div>
      </div>
    `;
    row.addEventListener('click', () => selectSymbol(comp.symbol));
    elements.watchlistContainer.appendChild(row);

    // Ticker strip item
    const ticker = document.createElement('div');
    ticker.className = `ticker ${comp.symbol === state.selectedSymbol ? 'active' : ''}`;
    ticker.id = `tickerItem_${comp.symbol}`;
    ticker.innerHTML = `
      <div class="ticker-row1">
        <span class="ticker-sym">${comp.symbol}</span>
        <span class="ticker-px" id="tickerPx_${comp.symbol}">${comp.price.toFixed(2)}</span>
      </div>
      <div class="ticker-chg ${chgCls}" id="tickerChg_${comp.symbol}">${sign}${comp.changePercent.toFixed(2)}%</div>
    `;
    ticker.addEventListener('click', () => selectSymbol(comp.symbol));
    elements.tickerStrip.appendChild(ticker);
  }
}

function selectSymbol(symbol) {
  state.selectedSymbol = symbol;
  const comp = state.companies.get(symbol);
  if (!comp) return;

  // Update active watchlist and ticker
  document.querySelectorAll('.watch-row').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.ticker').forEach(el => el.classList.remove('active'));

  const activeRow = document.getElementById(`watchRow_${symbol}`);
  if (activeRow) activeRow.classList.add('active');

  const activeTicker = document.getElementById(`tickerItem_${symbol}`);
  if (activeTicker) activeTicker.classList.add('active');

  // Update Center Hero
  elements.heroName.textContent = comp.name;
  elements.heroSymbol.textContent = comp.symbol;
  elements.heroPrice.textContent = comp.price.toFixed(2);

  const isUp = comp.change > 0;
  const isDown = comp.change < 0;
  const chgCls = isUp ? 'up' : isDown ? 'down' : 'flat';
  const sign = isUp ? '+' : '';

  elements.heroChange.textContent = `${sign}${comp.change.toFixed(2)} (${sign}${comp.changePercent.toFixed(2)}%)`;
  elements.heroChange.className = `chart-px-meta ${chgCls}`;

  elements.heroHigh.textContent = comp.highPrice.toFixed(2);
  elements.heroLow.textContent = comp.lowPrice.toFixed(2);
  elements.heroVolume.textContent = formatNumber(comp.volume);

  // Update Fundamentals Box
  elements.fundTitle.textContent = `${comp.symbol} fundamentals`;
  elements.fundSector.textContent = comp.sector;
  elements.fundMcap.textContent = comp.fundamentals.marketCap + ' CR';
  elements.fundPE.textContent = comp.fundamentals.peRatio;
  elements.fundMargin.textContent = comp.fundamentals.profitMargin;

  const sent = comp.sentiment;
  const sentText = sent > 0.1 ? 'Bullish' : sent < -0.1 ? 'Bearish' : 'Neutral';
  const sentDotColor = sent > 0.1 ? 'var(--green)' : sent < -0.1 ? 'var(--red)' : 'var(--text-dim)';
  elements.fundSentiment.innerHTML = `<span class="dot" style="background:${sentDotColor}"></span>${sentText}`;

  // Default Limit Order input to current price if empty
  if (!elements.orderPriceInput.value || elements.orderPriceInput.value == 0) {
    elements.orderPriceInput.value = comp.price.toFixed(2);
  }

  updateCostEstimate();

  // Load candles
  loadChartData(symbol);

  // Render Depth
  renderOrderBook(state.depths.get(symbol));
}

function renderOrderBook(depth) {
  if (!depth) {
    elements.asksContainer.innerHTML = '<div class="empty-row" style="padding:10px;text-align:center;font-size:10px;color:var(--text-faint)">Awaiting depth...</div>';
    elements.bidsContainer.innerHTML = '';
    return;
  }

  let maxVol = 1;
  const asks = depth.asks || [];
  const bids = depth.bids || [];
  asks.forEach(a => { if (a.total > maxVol) maxVol = a.total; });
  bids.forEach(b => { if (b.total > maxVol) maxVol = b.total; });

  // Render Asks (reversed so lowest ask is adjacent to mid-line)
  const asksSorted = [...asks].slice(0, 5).reverse();
  elements.asksContainer.innerHTML = '';
  asksSorted.forEach(item => {
    const pct = Math.min(100, Math.round((item.total / maxVol) * 100));
    const row = document.createElement('div');
    row.className = 'depth-row';
    row.innerHTML = `
      <div class="depth-fill" style="width:${pct}%;background:#2a1815;"></div>
      <span class="down">${item.price.toFixed(2)}</span>
      <span style="text-align:right;">${item.quantity}</span>
      <span style="text-align:right;">${item.total}</span>
    `;
    row.addEventListener('click', () => {
      elements.orderPriceInput.value = item.price.toFixed(2);
      updateCostEstimate();
    });
    elements.asksContainer.appendChild(row);
  });

  // Render Mid
  const spread = depth.spread;
  if (spread && spread.bid && spread.ask) {
    elements.midPriceText.textContent = spread.mid.toFixed(2);
    elements.bookSpreadText.textContent = `spread ${spread.spread.toFixed(2)}`;
  } else {
    elements.midPriceText.textContent = '---';
    elements.bookSpreadText.textContent = 'spread ---';
  }

  // Render Bids
  const bidsSorted = [...bids].slice(0, 5);
  elements.bidsContainer.innerHTML = '';
  bidsSorted.forEach(item => {
    const pct = Math.min(100, Math.round((item.total / maxVol) * 100));
    const row = document.createElement('div');
    row.className = 'depth-row';
    row.innerHTML = `
      <div class="depth-fill" style="width:${pct}%;background:#16261d;"></div>
      <span class="up">${item.price.toFixed(2)}</span>
      <span style="text-align:right;">${item.quantity}</span>
      <span style="text-align:right;">${item.total}</span>
    `;
    row.addEventListener('click', () => {
      elements.orderPriceInput.value = item.price.toFixed(2);
      updateCostEstimate();
    });
    elements.bidsContainer.appendChild(row);
  });
}

function renderPortfolio(portfolio) {
  if (!portfolio) return;
  state.portfolio = portfolio;

  elements.metricNetWorth.textContent = formatCurrency(portfolio.totalNetWorth);
  elements.metricCash.textContent = formatCurrency(portfolio.availableCredits);
  elements.metricStockVal.textContent = formatCurrency(portfolio.stockValue);
  elements.metricLocked.textContent = formatCurrency(portfolio.lockedCredits);

  const isProfit = portfolio.totalPnL >= 0;
  const sign = isProfit ? '+' : '';
  const pnlCls = isProfit ? 'up' : 'down';
  elements.metricTotalPnL.textContent = `${sign}${formatCurrency(portfolio.totalPnL)} (${sign}${portfolio.totalPnLPercent.toFixed(2)}%)`;
  elements.metricTotalPnL.className = `stat-val ${pnlCls}`;

  const isRealizedProfit = portfolio.realizedPnL >= 0;
  const rSign = isRealizedProfit ? '+' : '';
  const rCls = isRealizedProfit ? 'up' : 'down';
  elements.metricRealizedPnL.textContent = `${rSign}${formatCurrency(portfolio.realizedPnL)}`;
  elements.metricRealizedPnL.className = `stat-val ${rCls}`;

  // Holdings Table
  elements.holdingsTableBody.innerHTML = '';
  if (!portfolio.holdings || portfolio.holdings.length === 0) {
    elements.holdingsTableBody.innerHTML = `<tr class="empty-row"><td colspan="9">No positions yet — select a stock and place your first order.</td></tr>`;
  } else {
    for (const h of portfolio.holdings) {
      const isHProfit = h.unrealizedPnL >= 0;
      const hSign = isHProfit ? '+' : '';
      const hCls = isHProfit ? 'up' : 'down';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><b style="color:var(--text);font-family:var(--mono)">${h.symbol}</b></td>
        <td>${h.quantity}</td>
        <td>${h.availableQty} ${h.lockedQty > 0 ? `<span style="color:var(--amber);font-size:9px">(${h.lockedQty} locked)</span>` : ''}</td>
        <td>${h.avgPrice.toFixed(2)}</td>
        <td>${h.currentPrice.toFixed(2)}</td>
        <td>${formatCurrency(h.currentValue)}</td>
        <td class="${hCls}">${hSign}${formatCurrency(h.unrealizedPnL)}</td>
        <td class="${hCls}">${hSign}${h.pnlPercent.toFixed(2)}%</td>
        <td style="text-align:right">
          <button class="btn-subtle" onclick="quickTradeHolding('${h.symbol}')">TRADE</button>
        </td>
      `;
      elements.holdingsTableBody.appendChild(row);
    }
  }

  // Achievements Rack
  if (portfolio.allAchievements) {
    renderAchievements(portfolio.allAchievements, portfolio.achievements || []);
  }

  // My Trades Table
  renderMyTrades(portfolio.tradeHistory);
}

window.quickTradeHolding = function(symbol) {
  selectSymbol(symbol);
  setOrderSide('SELL');
};

function renderAchievements(allAchievements, unlockedList) {
  if (!allAchievements || !elements.achievementsGridContainer) return;
  const unlockedIds = new Set((unlockedList || []).map(a => a.id));

  if (elements.achievementsBadge) {
    elements.achievementsBadge.textContent = `${unlockedIds.size}/${allAchievements.length}`;
  }
  if (elements.achievementsScore) {
    elements.achievementsScore.textContent = `${unlockedIds.size} / ${allAchievements.length} UNLOCKED`;
  }

  elements.achievementsGridContainer.innerHTML = '';

  for (const ach of allAchievements) {
    const isUnlocked = unlockedIds.has(ach.id);
    const card = document.createElement('div');
    card.className = `achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`;
    card.innerHTML = `
      <div class="ach-badge-icon">${ach.icon || '🏆'}</div>
      <div class="ach-info">
        <div class="ach-title">${ach.title}</div>
        <div class="ach-desc">${ach.description}</div>
        <div class="ach-reward">+${ach.rewardCredits} CR REWARD</div>
      </div>
      <div class="ach-status">${isUnlocked ? 'UNLOCKED' : 'LOCKED'}</div>
    `;
    elements.achievementsGridContainer.appendChild(card);
  }
}

function renderOpenOrders(openOrders) {
  state.openOrders = openOrders || [];
  elements.openOrdersBadge.textContent = state.openOrders.length;
  elements.openOrdersTableBody.innerHTML = '';

  if (state.openOrders.length === 0) {
    elements.openOrdersTableBody.innerHTML = `<tr class="empty-row"><td colspan="9">No resting limit or stop orders in the book.</td></tr>`;
    return;
  }

  for (const ord of state.openOrders) {
    const isBuy = ord.side === 'BUY';
    const sideCls = isBuy ? 'up' : 'down';
    const row = document.createElement('tr');

    let priceDisplay = `${Number(ord.price || 0).toFixed(2)} CR`;
    if (ord.type === 'STOP_LOSS') {
      priceDisplay = `Stop: ${ord.stopPrice ? Number(ord.stopPrice).toFixed(2) : '—'} CR`;
    } else if (ord.type === 'STOP_LIMIT') {
      priceDisplay = `Stop: ${ord.stopPrice ? Number(ord.stopPrice).toFixed(2) : '—'} | Lmt: ${Number(ord.price).toFixed(2)}`;
    }

    const typeBadge = (ord.type === 'STOP_LOSS' || ord.type === 'STOP_LIMIT')
      ? `<span class="badge-tag" style="color:var(--amber);border-color:var(--amber)">${ord.type.replace('_', ' ')}</span>`
      : ord.type;

    row.innerHTML = `
      <td style="font-size:10px;color:var(--text-faint)">${ord.id.slice(-8)}</td>
      <td><b>${ord.symbol}</b></td>
      <td class="${sideCls}">${ord.side}</td>
      <td>${typeBadge}</td>
      <td>${priceDisplay}</td>
      <td>${ord.originalQuantity}</td>
      <td>${ord.quantity}</td>
      <td>${new Date(ord.timestamp).toLocaleTimeString()}</td>
      <td style="text-align:right">
        <button class="btn-cancel" onclick="cancelOrder('${ord.symbol}', '${ord.id}')">CANCEL</button>
      </td>
    `;
    elements.openOrdersTableBody.appendChild(row);
  }
}

window.cancelOrder = function(symbol, orderId) {
  socket.emit('order:cancel', { symbol, orderId }, (res) => {
    // Acknowledged
  });
};

function renderMyTrades(tradeHistory) {
  state.myTrades = tradeHistory || [];
  if (elements.myTradesBadge) {
    elements.myTradesBadge.textContent = state.myTrades.length;
  }
  if (!elements.myTradesTableBody) return;

  elements.myTradesTableBody.innerHTML = '';
  if (state.myTrades.length === 0) {
    elements.myTradesTableBody.innerHTML = `<tr class="empty-row"><td colspan="10">No executed trades recorded yet for your account.</td></tr>`;
    return;
  }

  for (const tr of state.myTrades) {
    const isBuy = tr.side === 'BUY';
    const sideCls = isBuy ? 'up' : 'down';
    const row = document.createElement('tr');
    const timeStr = new Date(tr.timestamp).toLocaleTimeString([], { hour12: false });

    let pnlHtml = '<span style="color:var(--text-faint)">—</span>';
    if (!isBuy && tr.realizedPnL !== undefined) {
      const isProfit = tr.realizedPnL >= 0;
      const sign = isProfit ? '+' : '';
      const cls = isProfit ? 'up' : 'down';
      pnlHtml = `<span class="${cls}">${sign}${formatCurrency(tr.realizedPnL)}</span>`;
    }

    const roleBadge = tr.role === 'MAKER'
      ? `<span class="badge-tag" style="color:var(--amber);border-color:var(--amber)">MAKER</span>`
      : `<span class="badge-tag" style="color:var(--text-dim)">TAKER</span>`;

    row.innerHTML = `
      <td style="font-size:10px;color:var(--text-faint)">${tr.id.slice(-8)}</td>
      <td>${timeStr}</td>
      <td><b>${tr.symbol}</b></td>
      <td class="${sideCls}"><b>${tr.side}</b></td>
      <td>${roleBadge}</td>
      <td>${Number(tr.price).toFixed(2)} CR</td>
      <td>${tr.quantity}</td>
      <td>${formatCurrency(tr.totalValue)}</td>
      <td>${pnlHtml}</td>
      <td style="color:var(--text-dim);font-size:10px">${tr.counterparty || 'Market'}</td>
    `;
    elements.myTradesTableBody.appendChild(row);
  }
}

function renderLeaderboard(leaderboard) {
  state.leaderboard = leaderboard || [];
  elements.leaderboardTableBody.innerHTML = '';

  state.leaderboard.forEach((user, idx) => {
    const isProfit = user.totalPnL >= 0;
    const sign = isProfit ? '+' : '';
    const pnlCls = isProfit ? 'up' : 'down';
    const isMe = user.userId === state.user.id;

    const row = document.createElement('tr');
    if (isMe) row.style.backgroundColor = '#171b20';

    row.innerHTML = `
      <td>#${idx + 1}</td>
      <td><b>${user.name}</b> ${isMe ? '<span style="color:var(--amber);font-size:9px">(You)</span>' : ''}</td>
      <td><span class="badge-tag">${user.isNpc ? 'Bot' : 'Human'}</span></td>
      <td>${formatCurrency(user.totalNetWorth)}</td>
      <td class="${pnlCls}">${sign}${formatCurrency(user.totalPnL)}</td>
      <td class="${pnlCls}">${sign}${user.totalPnLPercent.toFixed(2)}%</td>
      <td>${user.tradesCount}</td>
    `;
    elements.leaderboardTableBody.appendChild(row);
  });
}

function appendTradeToFeed(trade) {
  const row = document.createElement('div');
  const isBuy = trade.takerSide === 'BUY';
  const sideCls = isBuy ? 'up' : 'down';
  row.className = 'tape-row';

  const timeStr = new Date(trade.timestamp).toLocaleTimeString([], { hour12: false });
  row.innerHTML = `
    <span>${timeStr}</span>
    <span class="sym">${trade.symbol}</span>
    <span class="${sideCls}">${trade.price.toFixed(2)}</span>
    <span>${trade.quantity} sh</span>
    <span class="tape-fill">${trade.buyerName} → ${trade.sellerName}</span>
  `;

  elements.tradesFeedContainer.insertBefore(row, elements.tradesFeedContainer.firstChild);

  if (elements.tradesFeedContainer.children.length > 40) {
    elements.tradesFeedContainer.removeChild(elements.tradesFeedContainer.lastChild);
  }

  playTickTone(isBuy);
}

function handleBreakingNews(newsItem) {
  state.newsFeed.unshift(newsItem);
  elements.newsCountBadge.textContent = state.newsFeed.length;
  elements.newsHeadline.textContent = (newsItem.isRumor ? '[RUMOR] ' : '') + newsItem.headline;

  const logItem = document.createElement('div');
  logItem.className = 'news-history-item';
  logItem.innerHTML = `
    <div>
      <span class="news-tag">${newsItem.isRumor ? 'RUMOR' : 'NEWS'}</span>
      <span style="color:var(--text);margin-left:6px">${newsItem.headline}</span>
    </div>
    <span class="news-history-time">${new Date(newsItem.timestamp).toLocaleTimeString()}</span>
  `;
  elements.newsLogContainer.insertBefore(logItem, elements.newsLogContainer.firstChild);
  playNewsTone();
}

// Order Form UI Controls
function setOrderSide(side) {
  state.orderSide = side;
  const prettyType = state.orderType.replace('_', ' ');
  if (side === 'BUY') {
    elements.sideBuyTab.className = 'side-btn buy on';
    elements.sideSellTab.className = 'side-btn sell';
    elements.submitOrderBtn.className = 'place-btn';
    elements.submitOrderBtn.textContent = `PLACE ${prettyType} BUY`;
  } else {
    elements.sideBuyTab.className = 'side-btn buy';
    elements.sideSellTab.className = 'side-btn sell on';
    elements.submitOrderBtn.className = 'place-btn sell-mode';
    elements.submitOrderBtn.textContent = `PLACE ${prettyType} SELL`;
  }
  updateCostEstimate();
}

function setOrderType(type) {
  state.orderType = type;
  elements.typeLimitBtn.classList.toggle('on', type === 'LIMIT');
  elements.typeMarketBtn.classList.toggle('on', type === 'MARKET');
  elements.typeStopLossBtn.classList.toggle('on', type === 'STOP_LOSS');
  elements.typeStopLimitBtn.classList.toggle('on', type === 'STOP_LIMIT');

  if (type === 'LIMIT' || type === 'STOP_LIMIT') {
    elements.limitPriceField.classList.remove('hidden');
    elements.limitPriceField.style.display = 'block';
  } else {
    elements.limitPriceField.classList.add('hidden');
    elements.limitPriceField.style.display = 'none';
  }

  if (type === 'STOP_LOSS' || type === 'STOP_LIMIT') {
    elements.stopPriceField.classList.remove('hidden');
    elements.stopPriceField.style.display = 'block';
    if (!elements.orderStopPriceInput.value) {
      const comp = state.companies.get(state.selectedSymbol);
      if (comp) elements.orderStopPriceInput.value = comp.price.toFixed(2);
    }
  } else {
    elements.stopPriceField.classList.add('hidden');
    elements.stopPriceField.style.display = 'none';
  }

  const prettyType = type.replace('_', ' ');
  elements.submitOrderBtn.textContent = `PLACE ${prettyType} ${state.orderSide}`;
  updateCostEstimate();
}

function updateCostEstimate() {
  const comp = state.companies.get(state.selectedSymbol);
  if (!comp) return;

  let price = comp.price;
  if (state.orderType === 'LIMIT' || state.orderType === 'STOP_LIMIT') {
    price = parseFloat(elements.orderPriceInput.value) || comp.price;
  } else if (state.orderType === 'STOP_LOSS') {
    price = parseFloat(elements.orderStopPriceInput.value) || comp.price;
  }

  const qty = parseInt(elements.orderQtyInput.value, 10) || 0;
  const total = price * qty;
  elements.orderEstimatedTotal.textContent = formatCurrency(total);
}

elements.sideBuyTab.addEventListener('click', () => setOrderSide('BUY'));
elements.sideSellTab.addEventListener('click', () => setOrderSide('SELL'));
elements.typeLimitBtn.addEventListener('click', () => setOrderType('LIMIT'));
elements.typeMarketBtn.addEventListener('click', () => setOrderType('MARKET'));
elements.typeStopLossBtn.addEventListener('click', () => setOrderType('STOP_LOSS'));
elements.typeStopLimitBtn.addEventListener('click', () => setOrderType('STOP_LIMIT'));

elements.orderPriceInput.addEventListener('input', updateCostEstimate);
elements.orderStopPriceInput.addEventListener('input', updateCostEstimate);
elements.orderQtyInput.addEventListener('input', updateCostEstimate);

elements.useBestPriceBtn.addEventListener('click', (e) => {
  e.preventDefault();
  const depth = state.depths.get(state.selectedSymbol);
  if (!depth) return;
  if (state.orderSide === 'BUY' && depth.spread && depth.spread.ask) {
    elements.orderPriceInput.value = depth.spread.ask.toFixed(2);
  } else if (state.orderSide === 'SELL' && depth.spread && depth.spread.bid) {
    elements.orderPriceInput.value = depth.spread.bid.toFixed(2);
  }
  updateCostEstimate();
});

elements.useCurrentAsStopBtn.addEventListener('click', (e) => {
  e.preventDefault();
  const comp = state.companies.get(state.selectedSymbol);
  if (comp) {
    elements.orderStopPriceInput.value = comp.price.toFixed(2);
    updateCostEstimate();
  }
});

// Quick Quantity Percentage Buttons
document.querySelectorAll('.pct-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const pct = parseFloat(btn.getAttribute('data-pct'));
    const comp = state.companies.get(state.selectedSymbol);
    if (!comp || !state.portfolio) return;

    let price = comp.price;
    if (state.orderType === 'LIMIT' || state.orderType === 'STOP_LIMIT') {
      price = parseFloat(elements.orderPriceInput.value) || comp.price;
    } else if (state.orderType === 'STOP_LOSS') {
      price = parseFloat(elements.orderStopPriceInput.value) || comp.price;
    }

    if (state.orderSide === 'BUY') {
      const budget = state.portfolio.availableCredits * pct;
      const maxShares = Math.floor(budget / price);
      elements.orderQtyInput.value = Math.max(1, maxShares);
    } else {
      const holding = state.portfolio.holdings.find(h => h.symbol === state.selectedSymbol);
      const availableShares = holding ? holding.availableQty : 0;
      elements.orderQtyInput.value = Math.max(0, Math.floor(availableShares * pct));
    }
    updateCostEstimate();
  });
});

// Order Submission
elements.orderForm.addEventListener('submit', (e) => {
  e.preventDefault();
  elements.orderErrorMsg.textContent = '';

  const comp = state.companies.get(state.selectedSymbol);
  if (!comp) return;

  const price = (state.orderType === 'LIMIT' || state.orderType === 'STOP_LIMIT')
    ? parseFloat(elements.orderPriceInput.value)
    : comp.price;

  const stopPrice = (state.orderType === 'STOP_LOSS' || state.orderType === 'STOP_LIMIT')
    ? parseFloat(elements.orderStopPriceInput.value)
    : undefined;

  const quantity = parseInt(elements.orderQtyInput.value, 10);

  if (!quantity || quantity <= 0) {
    elements.orderErrorMsg.textContent = 'Invalid quantity';
    return;
  }

  if ((state.orderType === 'LIMIT' || state.orderType === 'STOP_LIMIT') && (!price || price <= 0)) {
    elements.orderErrorMsg.textContent = 'Valid limit price required';
    return;
  }

  if ((state.orderType === 'STOP_LOSS' || state.orderType === 'STOP_LIMIT') && (!stopPrice || stopPrice <= 0)) {
    elements.orderErrorMsg.textContent = 'Valid stop trigger price required';
    return;
  }

  elements.submitOrderBtn.disabled = true;
  elements.submitOrderBtn.textContent = 'ROUTING...';

  const prettyType = state.orderType.replace('_', ' ');

  socket.emit('order:place', {
    symbol: state.selectedSymbol,
    side: state.orderSide,
    type: state.orderType,
    price,
    stopPrice,
    quantity
  }, (response) => {
    elements.submitOrderBtn.disabled = false;
    elements.submitOrderBtn.textContent = `PLACE ${prettyType} ${state.orderSide}`;

    if (!response.success) {
      elements.orderErrorMsg.textContent = response.error || 'Order rejected';
    } else {
      elements.orderErrorMsg.textContent = '';
    }
  });
});

// Center Bottom Tabs Switching
const tabMapping = [
  { btn: elements.tabBtnPortfolio, view: elements.viewPortfolio },
  { btn: elements.tabBtnOpenOrders, view: elements.viewOpenOrders },
  { btn: elements.tabBtnMyTrades, view: elements.viewMyTrades },
  { btn: elements.tabBtnAchievements, view: elements.viewAchievements },
  { btn: elements.tabBtnLeaderboard, view: elements.viewLeaderboard },
  { btn: elements.tabBtnNews, view: elements.viewNews }
];

tabMapping.forEach(({ btn, view }) => {
  btn.addEventListener('click', () => {
    tabMapping.forEach(t => {
      t.btn.classList.remove('active');
      t.view.classList.remove('active');
    });
    btn.classList.add('active');
    view.classList.add('active');
  });
});

// Toast Notifications
function showAchievementToast(achievement) {
  playAchievementTone();

  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.innerHTML = `
    <div class="toast-icon">${achievement.icon || '🏆'}</div>
    <div class="toast-body">
      <div class="toast-header">Achievement Unlocked</div>
      <div class="toast-title">${achievement.title}</div>
      <div class="toast-desc">${achievement.description}</div>
      <div class="toast-reward">+${achievement.rewardCredits} CR REWARD AWARDED</div>
    </div>
  `;

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 5000);
}

function showStopTriggerToast(order) {
  playStopTriggerTone();

  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.style.borderColor = 'var(--amber)';
  toast.innerHTML = `
    <div class="toast-icon">⚡</div>
    <div class="toast-body">
      <div class="toast-header" style="color:var(--amber)">Stop Order Triggered</div>
      <div class="toast-title">${order.side} ${order.quantity} ${order.symbol}</div>
      <div class="toast-desc">Market price reached ${order.triggeredAtPrice ? order.triggeredAtPrice.toFixed(2) : 'trigger threshold'}. Converted to ${order.type === 'STOP_LIMIT' ? 'LIMIT' : 'MARKET'} order.</div>
    </div>
  `;

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 4500);
}

// Day Summary Rendering
function renderDaySummary(data) {
  if (!data || !data.userSummary) return;

  elements.summaryDayBadge.textContent = `DAY ${data.day}`;
  const isProfit = data.userSummary.dayPnL >= 0;
  const sign = isProfit ? '+' : '';
  const cls = isProfit ? 'up' : 'down';

  elements.summaryDayPnl.textContent = `${sign}${formatCurrency(data.userSummary.dayPnL)} (${sign}${data.userSummary.dayPnLPercent.toFixed(2)}%)`;
  elements.summaryDayPnl.className = `summary-hero-val ${cls}`;

  elements.summaryNetWorth.textContent = formatCurrency(data.userSummary.netWorth);
  elements.summaryCash.textContent = formatCurrency(data.userSummary.cash);
  elements.summaryStockVal.textContent = formatCurrency(data.userSummary.stockValue);
  elements.summaryTradesCount.textContent = data.userSummary.tradesToday;
  elements.summaryVolume.textContent = formatCurrency(data.userSummary.volumeToday);

  if (data.marketPerformance && data.marketPerformance.topGainer) {
    const tg = data.marketPerformance.topGainer;
    elements.summaryTopGainer.textContent = `${tg.symbol} (+${tg.changePercent.toFixed(2)}%)`;
  } else {
    elements.summaryTopGainer.textContent = '---';
  }

  // Open modal
  elements.daySummaryModal.classList.remove('hidden');

  let remaining = data.postMarketSec || 25;
  const timer = setInterval(() => {
    remaining--;
    const s = Math.max(0, remaining % 60);
    const m = Math.max(0, Math.floor(remaining / 60));
    elements.summaryNextDayCountdown.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    if (remaining <= 0) {
      clearInterval(timer);
    }
  }, 1000);
}

elements.closeDaySummaryBtn.addEventListener('click', () => {
  elements.daySummaryModal.classList.add('hidden');
});

elements.dismissDaySummaryBtn.addEventListener('click', () => {
  elements.daySummaryModal.classList.add('hidden');
});

// Socket Event Handlers
socket.on('init:state', (data) => {
  state.user.id = data.user.id;
  state.user.name = data.user.name;
  localStorage.setItem('marketarena_userid', state.user.id);
  localStorage.setItem('marketarena_username', state.user.name);

  elements.displayUserName.textContent = state.user.name;
  elements.displayUserId.textContent = `ID ${state.user.id.slice(-6).toUpperCase()}`;

  renderClock(data.clock);

  // Companies
  state.companies.clear();
  data.companies.forEach(c => state.companies.set(c.symbol, c));
  renderWatchlist();

  // Depths
  if (data.depths) {
    for (const [sym, d] of Object.entries(data.depths)) {
      state.depths.set(sym, d);
    }
  }

  selectSymbol(state.selectedSymbol);

  // Feed
  if (data.recentTrades) {
    elements.tradesFeedContainer.innerHTML = '';
    data.recentTrades.forEach(t => appendTradeToFeed(t));
  }

  // News
  if (data.news && data.news.length > 0) {
    data.news.forEach(n => handleBreakingNews(n));
  }

  // Portfolio & Leaderboard
  renderPortfolio(data.portfolio);
  renderOpenOrders(data.openOrders);
  renderLeaderboard(data.leaderboard);
});

socket.on('clock:tick', (clk) => {
  renderClock(clk);
});

socket.on('price:update', (data) => {
  const comp = state.companies.get(data.symbol);
  if (!comp) return;

  const prevPrice = comp.price;
  comp.price = data.price;
  comp.change = data.change;
  comp.changePercent = data.changePercent;
  comp.highPrice = data.high;
  comp.lowPrice = data.low;
  comp.volume = data.volume;

  // Flash rows
  const row = document.getElementById(`watchRow_${data.symbol}`);
  const pxEl = document.getElementById(`watchPx_${data.symbol}`);
  const chgEl = document.getElementById(`watchChg_${data.symbol}`);
  const tickerPx = document.getElementById(`tickerPx_${data.symbol}`);
  const tickerChg = document.getElementById(`tickerChg_${data.symbol}`);

  const isUp = data.price > prevPrice;
  const isDown = data.price < prevPrice;
  const chgCls = isUp ? 'up' : isDown ? 'down' : 'flat';
  const sign = comp.change > 0 ? '+' : '';

  if (row) {
    row.classList.remove('flash-up', 'flash-down');
    void row.offsetWidth;
    row.classList.add(isUp ? 'flash-up' : 'flash-down');
  }

  if (pxEl) pxEl.textContent = data.price.toFixed(2);
  if (chgEl) {
    chgEl.textContent = `${sign}${comp.change.toFixed(2)}`;
    chgEl.className = `watch-chg ${chgCls}`;
  }

  if (tickerPx) tickerPx.textContent = data.price.toFixed(2);
  if (tickerChg) {
    tickerChg.textContent = `${sign}${comp.changePercent.toFixed(2)}%`;
    tickerChg.className = `ticker-chg ${chgCls}`;
  }

  // If currently viewed symbol
  if (data.symbol === state.selectedSymbol) {
    elements.heroPrice.textContent = data.price.toFixed(2);
    elements.heroChange.textContent = `${sign}${comp.change.toFixed(2)} (${sign}${comp.changePercent.toFixed(2)}%)`;
    elements.heroChange.className = `chart-px-meta ${chgCls}`;
    elements.heroHigh.textContent = data.high.toFixed(2);
    elements.heroLow.textContent = data.low.toFixed(2);
    elements.heroVolume.textContent = formatNumber(data.volume);

    // Update active candle in memory and redraw
    if (currentCandlesList.length > 0) {
      const last = currentCandlesList[currentCandlesList.length - 1];
      last.close = data.price;
      last.high = Math.max(last.high, data.price);
      last.low = Math.min(last.low, data.price);
    }
    drawChart();
  }
});

socket.on('orderbook:update', ({ symbol, depth }) => {
  state.depths.set(symbol, depth);
  if (symbol === state.selectedSymbol) {
    renderOrderBook(depth);
  }
});

socket.on('trade:new', (trade) => {
  appendTradeToFeed(trade);
});

socket.on('portfolio:update', ({ portfolio, openOrders }) => {
  renderPortfolio(portfolio);
  renderOpenOrders(openOrders);
});

socket.on('leaderboard:update', (leaderboard) => {
  renderLeaderboard(leaderboard);
});

socket.on('news:breaking', (newsItem) => {
  handleBreakingNews(newsItem);
});

socket.on('bell:ring', (data) => {
  playBellTone(data && data.bell === 'OPENING_BELL');
});

socket.on('trade:personal', (trade) => {
  playTradeFillTone(trade && trade.mySide === 'BUY');
});

socket.on('companies:update', (companies) => {
  companies.forEach(c => state.companies.set(c.symbol, c));
  renderWatchlist();
  if (state.selectedSymbol) {
    selectSymbol(state.selectedSymbol);
  }
});

socket.on('achievement:unlocked', (achievement) => {
  showAchievementToast(achievement);
});

socket.on('order:stopTriggered', (order) => {
  showStopTriggerToast(order);
});

socket.on('market:daySummary', (summaryData) => {
  renderDaySummary(summaryData);
});

socket.on('market:newDay', () => {
  elements.daySummaryModal.classList.add('hidden');
});

// App Startup
document.addEventListener('DOMContentLoaded', () => {
  initChart();
  initUser();
});
