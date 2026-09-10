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
  leverage: 1,
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
  activeTab: 'portfolio',
  activeTimeframe: '5s',
  indicators: {
    sma: false,
    ema: false,
    boll: false,
    vwap: false,
    rsi: false,
    macd: false
  },
  tournament: null,
  joinedTourney: false
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
  indSmaBtn: document.getElementById('indSmaBtn'),
  indEmaBtn: document.getElementById('indEmaBtn'),
  indBollBtn: document.getElementById('indBollBtn'),
  indVwapBtn: document.getElementById('indVwapBtn'),
  indRsiBtn: document.getElementById('indRsiBtn'),
  indMacdBtn: document.getElementById('indMacdBtn'),
  tradesFeedContainer: document.getElementById('tradesFeedContainer'),
  // Order Form
  sideBuyTab: document.getElementById('sideBuyTab'),
  sideSellTab: document.getElementById('sideSellTab'),
  typeLimitBtn: document.getElementById('typeLimitBtn'),
  typeMarketBtn: document.getElementById('typeMarketBtn'),
  typeStopLossBtn: document.getElementById('typeStopLossBtn'),
  typeStopLimitBtn: document.getElementById('typeStopLimitBtn'),
  typeTrailingStopBtn: document.getElementById('typeTrailingStopBtn'),
  typeOcoBtn: document.getElementById('typeOcoBtn'),
  limitPriceField: document.getElementById('limitPriceField'),
  orderPriceInput: document.getElementById('orderPriceInput'),
  useBestPriceBtn: document.getElementById('useBestPriceBtn'),
  stopPriceField: document.getElementById('stopPriceField'),
  orderStopPriceInput: document.getElementById('orderStopPriceInput'),
  useCurrentAsStopBtn: document.getElementById('useCurrentAsStopBtn'),
  trailingDeltaField: document.getElementById('trailingDeltaField'),
  orderTrailingDeltaInput: document.getElementById('orderTrailingDeltaInput'),
  ocoFields: document.getElementById('ocoFields'),
  orderOcoLimitInput: document.getElementById('orderOcoLimitInput'),
  orderOcoStopInput: document.getElementById('orderOcoStopInput'),
  useOcoLimitBestBtn: document.getElementById('useOcoLimitBestBtn'),
  useOcoStopMarketBtn: document.getElementById('useOcoStopMarketBtn'),
  leverageField: document.getElementById('leverageField'),
  leverageModeBadge: document.getElementById('leverageModeBadge'),
  lev1Btn: document.getElementById('lev1Btn'),
  lev2Btn: document.getElementById('lev2Btn'),
  lev5Btn: document.getElementById('lev5Btn'),
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
  metricMarginLoan: document.getElementById('metricMarginLoan'),
  metricMarginLevel: document.getElementById('metricMarginLevel'),
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
  nicknameInput: document.getElementById('nicknameInput'),
  // Tournament Elements (v0.6)
  tourneyBar: document.getElementById('tourneyBar'),
  tourneyTag: document.getElementById('tourneyTag'),
  tourneyTimer: document.getElementById('tourneyTimer'),
  joinTourneyBtn: document.getElementById('joinTourneyBtn'),
  tabBtnTournament: document.getElementById('tabBtnTournament'),
  tourneyBadgeCount: document.getElementById('tourneyBadgeCount'),
  viewTournament: document.getElementById('viewTournament'),
  tourneyHeroBadge: document.getElementById('tourneyHeroBadge'),
  tourneyHeroTitle: document.getElementById('tourneyHeroTitle'),
  tourneyHeroStatus: document.getElementById('tourneyHeroStatus'),
  tourneyHeroTimer: document.getElementById('tourneyHeroTimer'),
  tourneyHeroParticipants: document.getElementById('tourneyHeroParticipants'),
  tourneyJoinHeroBtn: document.getElementById('tourneyJoinHeroBtn'),
  tourneyTableBody: document.getElementById('tourneyTableBody'),
  tourneyPodiumModal: document.getElementById('tourneyPodiumModal'),
  closeTourneyPodiumBtn: document.getElementById('closeTourneyPodiumBtn'),
  dismissTourneyPodiumBtn: document.getElementById('dismissTourneyPodiumBtn'),
  podiumCardsContainer: document.getElementById('podiumCardsContainer'),
  // Quantitative Risk Analytics Elements (v0.6)
  metricSharpe: document.getElementById('metricSharpe'),
  metricMaxDrawdown: document.getElementById('metricMaxDrawdown'),
  metricProfitFactor: document.getElementById('metricProfitFactor'),
  metricWinRate: document.getElementById('metricWinRate'),
  metricWinLossRatio: document.getElementById('metricWinLossRatio'),
  metricPayoffRatio: document.getElementById('metricPayoffRatio')
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

  // Timeframe selector buttons
  document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tf = btn.getAttribute('data-tf');
      if (!tf) return;
      state.activeTimeframe = tf;
      document.querySelectorAll('.tf-btn').forEach(b => b.classList.toggle('on', b === btn));
      loadChartData(state.selectedSymbol);
    });
  });

  // Technical indicator toggle buttons
  function bindIndicator(btn, key) {
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      state.indicators[key] = !state.indicators[key];
      btn.classList.toggle('on', state.indicators[key]);
      drawChart();
    });
  }

  bindIndicator(elements.indSmaBtn, 'sma');
  bindIndicator(elements.indEmaBtn, 'ema');
  bindIndicator(elements.indBollBtn, 'boll');
  bindIndicator(elements.indVwapBtn, 'vwap');
  bindIndicator(elements.indRsiBtn, 'rsi');
  bindIndicator(elements.indMacdBtn, 'macd');

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

  const allCandles = currentCandlesList;
  const visibleCount = Math.min(50, allCandles.length);
  const startIndex = allCandles.length - visibleCount;
  const candles = allCandles.slice(startIndex);

  // Compute full technical indicators across entire candle history for unbroken warmups
  const ind = (typeof window !== 'undefined' && window.Indicators) ? window.Indicators : null;
  const sma20Full = (state.indicators.sma && ind) ? ind.calculateSMA(allCandles, 20) : null;
  const sma50Full = (state.indicators.sma && ind) ? ind.calculateSMA(allCandles, 50) : null;
  const ema9Full = (state.indicators.ema && ind) ? ind.calculateEMA(allCandles, 9) : null;
  const ema21Full = (state.indicators.ema && ind) ? ind.calculateEMA(allCandles, 21) : null;
  const bollFull = (state.indicators.boll && ind) ? ind.calculateBollingerBands(allCandles, 20, 2) : null;
  const vwapFull = (state.indicators.vwap && ind) ? ind.calculateVWAP(allCandles) : null;
  const rsiFull = (state.indicators.rsi && ind) ? ind.calculateRSI(allCandles, 14) : null;
  const macdFull = (state.indicators.macd && ind) ? ind.calculateMACD(allCandles, 12, 26, 9) : null;

  // Slice indicators to align with visible candles window
  const sma20 = sma20Full ? sma20Full.slice(startIndex) : null;
  const sma50 = sma50Full ? sma50Full.slice(startIndex) : null;
  const ema9 = ema9Full ? ema9Full.slice(startIndex) : null;
  const ema21 = ema21Full ? ema21Full.slice(startIndex) : null;
  const boll = bollFull ? bollFull.slice(startIndex) : null;
  const vwap = vwapFull ? vwapFull.slice(startIndex) : null;
  const rsi = rsiFull ? rsiFull.slice(startIndex) : null;
  const macd = macdFull ? macdFull.slice(startIndex) : null;

  // Determine layout dimensions
  const hasOscillator = state.indicators.rsi || state.indicators.macd;
  const oscillatorH = hasOscillator ? Math.floor(75 * dpr) : 0;
  const volumeH = Math.floor(h * 0.16);
  const topPadding = Math.floor(22 * dpr);
  const rightMargin = Math.floor(62 * dpr);
  const chartW = w - rightMargin;
  const priceH = h - topPadding - volumeH - oscillatorH - (hasOscillator ? Math.floor(16 * dpr) : Math.floor(8 * dpr));
  const volumeTop = topPadding + priceH;
  const oscillatorTop = volumeTop + volumeH + Math.floor(8 * dpr);

  // Determine price bounds with indicator envelopes
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let maxVolume = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
    if (c.volume > maxVolume) maxVolume = c.volume;

    if (boll && boll[i]) {
      if (boll[i].lower !== null && boll[i].lower < minPrice) minPrice = boll[i].lower;
      if (boll[i].upper !== null && boll[i].upper > maxPrice) maxPrice = boll[i].upper;
    }
  }
  const pad = (maxPrice - minPrice) * 0.08 || 1;
  minPrice -= pad;
  maxPrice += pad;
  if (maxVolume === 0) maxVolume = 100;

  const candleW = Math.max(3 * dpr, chartW / candles.length);
  const getY = (p) => Math.floor(topPadding + priceH - ((p - minPrice) / (maxPrice - minPrice)) * priceH);
  const getX = (idx) => Math.floor(idx * candleW + candleW / 2);

  // Background gridlines for Price
  ctx.strokeStyle = '#171b20';
  ctx.lineWidth = 1;
  ctx.font = `${Math.floor(9.5 * dpr)}px IBM Plex Mono, monospace`;
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
  ctx.font = `${Math.floor(8 * dpr)}px IBM Plex Mono, monospace`;
  ctx.fillText('VOL', 8 * dpr, volumeTop - (4 * dpr));
  ctx.fillText(maxVolume.toString(), chartW + (6 * dpr), volumeTop + (12 * dpr));

  // Determine hovered candle index
  let hoveredIndex = -1;
  if (chartHover.active && chartHover.x >= 0 && chartHover.x <= chartW) {
    hoveredIndex = Math.min(candles.length - 1, Math.max(0, Math.floor(chartHover.x / candleW)));
    chartHover.candle = candles[hoveredIndex];
  }

  // Draw Candlesticks and Volume Bars
  candles.forEach((c, idx) => {
    const x = getX(idx);
    const isUp = c.close >= c.open;
    const bullColor = '#26a69a';
    const bearColor = '#ef5350';
    const color = isUp ? bullColor : bearColor;

    // Price coords
    const yHigh = getY(c.high);
    const yLow = getY(c.low);
    const yOpen = getY(c.open);
    const yClose = getY(c.close);

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
    const vY = Math.floor(volumeTop + volumeH - vH);
    ctx.fillStyle = isUp ? 'rgba(38, 166, 154, 0.35)' : 'rgba(239, 83, 80, 0.35)';
    ctx.fillRect(Math.floor(x - barW / 2), vY, Math.floor(barW), vH);
  });

  // Helper function to draw continuous line series
  function drawLineSeries(series, color, width = 1.5, dashed = false) {
    if (!series) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, Math.floor(width * dpr));
    if (dashed) ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < series.length; i++) {
      const pt = series[i];
      const val = pt ? (typeof pt === 'number' ? pt : pt.value) : null;
      if (val === null || isNaN(val)) continue;
      const x = getX(i);
      const y = getY(val);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // Draw Bollinger Bands (shaded channel & lines)
  if (boll) {
    ctx.save();
    // Shaded Ribbon
    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.beginPath();
    let ribbonStarted = false;
    for (let i = 0; i < boll.length; i++) {
      if (boll[i].upper === null) continue;
      const x = getX(i);
      const y = getY(boll[i].upper);
      if (!ribbonStarted) {
        ctx.moveTo(x, y);
        ribbonStarted = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    for (let i = boll.length - 1; i >= 0; i--) {
      if (boll[i].lower === null) continue;
      const x = getX(i);
      const y = getY(boll[i].lower);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Upper, Lower, Middle lines
    drawLineSeries(boll.map(b => b.upper), '#60a5fa', 1, true);
    drawLineSeries(boll.map(b => b.lower), '#60a5fa', 1, true);
    drawLineSeries(boll.map(b => b.middle), 'rgba(96, 165, 250, 0.8)', 1.2, false);
    ctx.restore();
  }

  // Draw Moving Averages & VWAP
  if (sma20) drawLineSeries(sma20, '#f59e0b', 1.5);
  if (sma50) drawLineSeries(sma50, '#38bdf8', 1.5);
  if (ema9) drawLineSeries(ema9, '#c084fc', 1.5);
  if (ema21) drawLineSeries(ema21, '#34d399', 1.5);
  if (vwap) drawLineSeries(vwap, '#22d3ee', 1.5);

  // Draw Oscillator Sub-Panel
  if (hasOscillator) {
    ctx.fillStyle = '#0a0d11';
    ctx.fillRect(0, oscillatorTop, chartW, oscillatorH);
    ctx.strokeStyle = '#20262e';
    ctx.beginPath();
    ctx.moveTo(0, oscillatorTop);
    ctx.lineTo(chartW, oscillatorTop);
    ctx.stroke();

    if (state.indicators.rsi && rsi) {
      const rsiY = (val) => Math.floor(oscillatorTop + oscillatorH - (val / 100) * oscillatorH);

      // 70 overbought threshold (red dashed)
      ctx.save();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
      ctx.setLineDash([2 * dpr, 2 * dpr]);
      ctx.beginPath();
      ctx.moveTo(0, rsiY(70));
      ctx.lineTo(chartW, rsiY(70));
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.font = `${Math.floor(8 * dpr)}px IBM Plex Mono, monospace`;
      ctx.fillText('70', chartW + (4 * dpr), rsiY(70) + (3 * dpr));

      // 30 oversold threshold (green dashed)
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
      ctx.beginPath();
      ctx.moveTo(0, rsiY(30));
      ctx.lineTo(chartW, rsiY(30));
      ctx.stroke();
      ctx.fillStyle = '#22c55e';
      ctx.fillText('30', chartW + (4 * dpr), rsiY(30) + (3 * dpr));
      ctx.restore();

      // RSI Curve
      ctx.save();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = Math.max(1, Math.floor(1.5 * dpr));
      ctx.beginPath();
      let rsiStarted = false;
      for (let i = 0; i < rsi.length; i++) {
        if (!rsi[i] || rsi[i].value === null) continue;
        const x = getX(i);
        const y = rsiY(rsi[i].value);
        if (!rsiStarted) {
          ctx.moveTo(x, y);
          rsiStarted = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.restore();

      const lastRsi = rsi[rsi.length - 1]?.value;
      ctx.fillStyle = '#facc15';
      ctx.font = `${Math.floor(9 * dpr)}px IBM Plex Mono, monospace`;
      ctx.fillText(`RSI(14): ${lastRsi !== null && lastRsi !== undefined ? lastRsi.toFixed(1) : '—'}`, 8 * dpr, oscillatorTop + (12 * dpr));

    } else if (state.indicators.macd && macd) {
      let maxAbs = 0.5;
      for (const m of macd) {
        if (m.macd !== null) maxAbs = Math.max(maxAbs, Math.abs(m.macd));
        if (m.signal !== null) maxAbs = Math.max(maxAbs, Math.abs(m.signal));
        if (m.histogram !== null) maxAbs = Math.max(maxAbs, Math.abs(m.histogram));
      }
      maxAbs = maxAbs * 1.25;

      const macdY = (val) => Math.floor(oscillatorTop + (oscillatorH / 2) - (val / maxAbs) * (oscillatorH / 2));
      const zeroY = macdY(0);

      // Zero Axis
      ctx.strokeStyle = '#374151';
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(chartW, zeroY);
      ctx.stroke();

      // Histogram Bars
      for (let i = 0; i < macd.length; i++) {
        const m = macd[i];
        if (m.histogram === null) continue;
        const x = getX(i);
        const y = macdY(m.histogram);
        const barW = Math.max(2 * dpr, candleW * 0.6);
        ctx.fillStyle = m.histogram >= 0 ? 'rgba(38, 166, 154, 0.7)' : 'rgba(239, 83, 80, 0.7)';
        const top = Math.min(zeroY, y);
        const hBar = Math.max(1, Math.abs(y - zeroY));
        ctx.fillRect(Math.floor(x - barW / 2), top, Math.floor(barW), hBar);
      }

      // MACD Line (blue) and Signal Line (orange)
      function drawOscLine(data, color) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, Math.floor(1.2 * dpr));
        ctx.beginPath();
        let st = false;
        for (let i = 0; i < data.length; i++) {
          if (data[i] === null) continue;
          const x = getX(i);
          const y = macdY(data[i]);
          if (!st) { ctx.moveTo(x, y); st = true; }
          else { ctx.lineTo(x, y); }
        }
        ctx.stroke();
        ctx.restore();
      }

      drawOscLine(macd.map(m => m.macd), '#38bdf8');
      drawOscLine(macd.map(m => m.signal), '#f97316');

      const lastM = macd[macd.length - 1];
      ctx.font = `${Math.floor(8.5 * dpr)}px IBM Plex Mono, monospace`;
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`MACD: ${lastM.macd?.toFixed(2) || '—'}`, 8 * dpr, oscillatorTop + (11 * dpr));
      ctx.fillStyle = '#f97316';
      ctx.fillText(`Sig: ${lastM.signal?.toFixed(2) || '—'}`, 80 * dpr, oscillatorTop + (11 * dpr));
      ctx.fillStyle = (lastM.histogram || 0) >= 0 ? '#4ade80' : '#f87171';
      ctx.fillText(`Hist: ${lastM.histogram?.toFixed(2) || '—'}`, 145 * dpr, oscillatorTop + (11 * dpr));
    }
  }

  // Current Price Dashed Reference Line
  const comp = state.companies.get(state.selectedSymbol);
  if (comp) {
    const curY = getY(comp.price);
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
    ctx.font = `${Math.floor(9.5 * dpr)}px IBM Plex Mono, monospace`;
    ctx.fillText(comp.price.toFixed(2), chartW + (5 * dpr), curY + (4 * dpr));
  }

  // Crosshair and Interactive Inspection Tooltip
  if (chartHover.active && chartHover.candle && hoveredIndex !== -1) {
    const hc = chartHover.candle;
    const hx = getX(hoveredIndex);
    const hy = Math.min(Math.floor(topPadding + priceH), Math.max(topPadding, chartHover.y));
    const hoverPrice = maxPrice - ((hy - topPadding) / priceH) * (maxPrice - minPrice);

    // Crosshair Lines
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1;
    ctx.setLineDash([2 * dpr, 2 * dpr]);

    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.lineTo(hx, h - (4 * dpr));
    ctx.stroke();

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

    // Top HUD Bar with OHLCV data & Technical Indicators
    const isUp = hc.close >= hc.open;
    const chgVal = hc.close - hc.open;
    const chgPct = hc.open > 0 ? (chgVal / hc.open) * 100 : 0;
    const sign = chgVal >= 0 ? '+' : '';
    const hudTime = new Date(hc.time * 1000).toLocaleTimeString([], { hour12: false });

    // Build HUD text snippets
    let hudText = `${hudTime}  O:${hc.open.toFixed(2)} H:${hc.high.toFixed(2)} L:${hc.low.toFixed(2)} C:${hc.close.toFixed(2)} (${sign}${chgPct.toFixed(2)}%) V:${hc.volume}`;

    if (sma20 && sma20[hoveredIndex]?.value !== null) hudText += `  SMA20:${sma20[hoveredIndex].value}`;
    if (ema9 && ema9[hoveredIndex]?.value !== null) hudText += `  EMA9:${ema9[hoveredIndex].value}`;
    if (vwap && vwap[hoveredIndex]?.value !== null) hudText += `  VWAP:${vwap[hoveredIndex].value}`;
    if (rsi && rsi[hoveredIndex]?.value !== null) hudText += `  RSI:${rsi[hoveredIndex].value}`;
    if (macd && macd[hoveredIndex]?.macd !== null) hudText += `  MACD:${macd[hoveredIndex].macd}`;

    ctx.font = `${Math.floor(9 * dpr)}px IBM Plex Mono, monospace`;
    const textWidth = ctx.measureText(hudText).width;
    const hudW = Math.min(chartW - (16 * dpr), textWidth + (16 * dpr));

    ctx.fillStyle = 'rgba(13, 16, 20, 0.92)';
    ctx.fillRect(8 * dpr, 4 * dpr, hudW, 18 * dpr);
    ctx.strokeStyle = '#262d38';
    ctx.strokeRect(8 * dpr, 4 * dpr, hudW, 18 * dpr);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText(hudText, 14 * dpr, 16 * dpr);
  }
}

function loadChartData(symbol) {
  const tf = state.activeTimeframe || '5s';
  socket.emit('chart:history', { symbol, timeframe: tf }, (candles) => {
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
  if (elements.metricLocked) elements.metricLocked.textContent = formatCurrency(portfolio.lockedCredits);
  if (elements.metricMarginLoan) elements.metricMarginLoan.textContent = formatCurrency(portfolio.marginLoan || 0);

  if (elements.metricMarginLevel) {
    if (portfolio.isMarginCall) {
      elements.metricMarginLevel.innerHTML = `<span class="badge-margin-call">CALL (${portfolio.marginLevel}%)</span>`;
    } else {
      elements.metricMarginLevel.innerHTML = `<span style="font-family:var(--mono);color:var(--text);">${portfolio.marginLevel >= 999 ? '100% (No Debt)' : portfolio.marginLevel + '% Safe'}</span>`;
    }
  }

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

  // Quantitative Risk Analytics (v0.6)
  if (portfolio.quantitativeMetrics) {
    const q = portfolio.quantitativeMetrics;
    if (elements.metricSharpe) {
      elements.metricSharpe.textContent = q.sharpeRatio.toFixed(2);
      elements.metricSharpe.className = `stat-val quant-val ${q.sharpeRatio >= 1 ? 'up' : q.sharpeRatio < 0 ? 'down' : ''}`;
    }
    if (elements.metricMaxDrawdown) {
      const mdd = q.maxDrawdownPercent !== undefined ? q.maxDrawdownPercent : (q.maxDrawdown || 0);
      elements.metricMaxDrawdown.textContent = `${mdd.toFixed(2)}%`;
      elements.metricMaxDrawdown.className = `stat-val quant-val ${mdd > 15 ? 'down' : ''}`;
    }
    if (elements.metricProfitFactor) {
      elements.metricProfitFactor.textContent = isFinite(q.profitFactor) ? q.profitFactor.toFixed(2) : '—';
      elements.metricProfitFactor.className = `stat-val quant-val ${q.profitFactor >= 1.5 ? 'up' : q.profitFactor < 1 ? 'down' : ''}`;
    }
    if (elements.metricWinRate) {
      elements.metricWinRate.textContent = `${q.winRate.toFixed(1)}%`;
      elements.metricWinRate.className = `stat-val quant-val ${q.winRate >= 50 ? 'up' : 'down'}`;
    }
    if (elements.metricWinLossRatio) {
      const wins = q.winCount !== undefined ? q.winCount : (q.winningTrades || 0);
      const losses = q.lossCount !== undefined ? q.lossCount : (q.losingTrades || 0);
      elements.metricWinLossRatio.textContent = `${wins} / ${losses}`;
    }
    if (elements.metricPayoffRatio) {
      elements.metricPayoffRatio.textContent = isFinite(q.payoffRatio) ? q.payoffRatio.toFixed(2) : '—';
    }
  }

  // Holdings Table
  elements.holdingsTableBody.innerHTML = '';
  if (!portfolio.holdings || portfolio.holdings.length === 0) {
    elements.holdingsTableBody.innerHTML = `<tr class="empty-row"><td colspan="10">No positions yet — select a stock and place your first order.</td></tr>`;
  } else {
    for (const h of portfolio.holdings) {
      const isHProfit = h.unrealizedPnL >= 0;
      const hSign = isHProfit ? '+' : '';
      const hCls = isHProfit ? 'up' : 'down';
      const posBadge = h.positionType === 'SHORT'
        ? `<span class="badge-short">SHORT</span>`
        : `<span class="badge-long">LONG</span>`;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><b style="color:var(--text);font-family:var(--mono)">${h.symbol}</b></td>
        <td>${posBadge}</td>
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
    } else if (ord.type === 'TRAILING_STOP') {
      priceDisplay = `Trail Δ: ${Number(ord.trailingDelta || 0).toFixed(2)} | Stop: ${Number(ord.stopPrice || 0).toFixed(2)}`;
    }

    let typeBadge = ord.type.replace('_', ' ');
    if (ord.type === 'STOP_LOSS' || ord.type === 'STOP_LIMIT' || ord.type === 'TRAILING_STOP') {
      typeBadge = `<span class="badge-tag" style="color:var(--amber);border-color:var(--amber)">${ord.type.replace('_', ' ')}</span>`;
    }
    if (ord.ocoGroupId) {
      typeBadge += ` <span style="font-size:9px;color:var(--text-faint);font-family:var(--mono)">[OCO]</span>`;
    }
    if (ord.isShort) {
      typeBadge += ` <span class="badge-short">SHORT</span>`;
    }

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
  if (elements.typeTrailingStopBtn) elements.typeTrailingStopBtn.classList.toggle('on', type === 'TRAILING_STOP');
  if (elements.typeOcoBtn) elements.typeOcoBtn.classList.toggle('on', type === 'OCO');

  // Limit Price Field visibility
  if (type === 'LIMIT' || type === 'STOP_LIMIT') {
    elements.limitPriceField.classList.remove('hidden');
    elements.limitPriceField.style.display = 'block';
  } else {
    elements.limitPriceField.classList.add('hidden');
    elements.limitPriceField.style.display = 'none';
  }

  // Stop Price Field visibility
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

  // Trailing Delta Field visibility
  if (elements.trailingDeltaField) {
    if (type === 'TRAILING_STOP') {
      elements.trailingDeltaField.classList.remove('hidden');
      elements.trailingDeltaField.style.display = 'block';
      if (!elements.orderTrailingDeltaInput.value) {
        elements.orderTrailingDeltaInput.value = '5.00';
      }
    } else {
      elements.trailingDeltaField.classList.add('hidden');
      elements.trailingDeltaField.style.display = 'none';
    }
  }

  // OCO Fields visibility
  if (elements.ocoFields) {
    if (type === 'OCO') {
      elements.ocoFields.classList.remove('hidden');
      elements.ocoFields.style.display = 'block';
      const comp = state.companies.get(state.selectedSymbol);
      if (comp) {
        if (!elements.orderOcoLimitInput.value) elements.orderOcoLimitInput.value = +(comp.price * 1.05).toFixed(2);
        if (!elements.orderOcoStopInput.value) elements.orderOcoStopInput.value = +(comp.price * 0.95).toFixed(2);
      }
    } else {
      elements.ocoFields.classList.add('hidden');
      elements.ocoFields.style.display = 'none';
    }
  }

  const prettyType = type.replace('_', ' ');
  elements.submitOrderBtn.textContent = `PLACE ${prettyType} ${state.orderSide}`;
  updateCostEstimate();
}

function setLeverage(lev) {
  state.leverage = lev;
  if (elements.lev1Btn) elements.lev1Btn.classList.toggle('on', lev === 1);
  if (elements.lev2Btn) elements.lev2Btn.classList.toggle('on', lev === 2);
  if (elements.lev5Btn) elements.lev5Btn.classList.toggle('on', lev === 5);
  if (elements.leverageModeBadge) {
    elements.leverageModeBadge.textContent = lev === 1 ? '1x Cash' : `${lev}x Margin (${(100/lev).toFixed(0)}% Collateral)`;
  }
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
  } else if (state.orderType === 'OCO') {
    price = parseFloat(elements.orderOcoLimitInput.value) || comp.price;
  }

  const qty = parseInt(elements.orderQtyInput.value, 10) || 0;
  const grossTotal = price * qty;
  const lev = state.leverage || 1;
  const marginReq = +(grossTotal / lev).toFixed(2);

  if (lev > 1) {
    elements.orderEstimatedTotal.textContent = `${formatCurrency(marginReq)} (${lev}x Margin / Tot ${formatCurrency(grossTotal)})`;
  } else {
    elements.orderEstimatedTotal.textContent = formatCurrency(grossTotal);
  }
}

elements.sideBuyTab.addEventListener('click', () => setOrderSide('BUY'));
elements.sideSellTab.addEventListener('click', () => setOrderSide('SELL'));
elements.typeLimitBtn.addEventListener('click', () => setOrderType('LIMIT'));
elements.typeMarketBtn.addEventListener('click', () => setOrderType('MARKET'));
elements.typeStopLossBtn.addEventListener('click', () => setOrderType('STOP_LOSS'));
elements.typeStopLimitBtn.addEventListener('click', () => setOrderType('STOP_LIMIT'));
if (elements.typeTrailingStopBtn) elements.typeTrailingStopBtn.addEventListener('click', () => setOrderType('TRAILING_STOP'));
if (elements.typeOcoBtn) elements.typeOcoBtn.addEventListener('click', () => setOrderType('OCO'));

if (elements.lev1Btn) elements.lev1Btn.addEventListener('click', () => setLeverage(1));
if (elements.lev2Btn) elements.lev2Btn.addEventListener('click', () => setLeverage(2));
if (elements.lev5Btn) elements.lev5Btn.addEventListener('click', () => setLeverage(5));

elements.orderPriceInput.addEventListener('input', updateCostEstimate);
elements.orderStopPriceInput.addEventListener('input', updateCostEstimate);
if (elements.orderTrailingDeltaInput) elements.orderTrailingDeltaInput.addEventListener('input', updateCostEstimate);
if (elements.orderOcoLimitInput) elements.orderOcoLimitInput.addEventListener('input', updateCostEstimate);
if (elements.orderOcoStopInput) elements.orderOcoStopInput.addEventListener('input', updateCostEstimate);
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

if (elements.useOcoLimitBestBtn) {
  elements.useOcoLimitBestBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const depth = state.depths.get(state.selectedSymbol);
    if (!depth) return;
    const px = state.orderSide === 'BUY' ? depth.spread.ask : depth.spread.bid;
    if (px) elements.orderOcoLimitInput.value = px.toFixed(2);
    updateCostEstimate();
  });
}

if (elements.useOcoStopMarketBtn) {
  elements.useOcoStopMarketBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const comp = state.companies.get(state.selectedSymbol);
    if (comp) {
      elements.orderOcoStopInput.value = comp.price.toFixed(2);
      updateCostEstimate();
    }
  });
}

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
    } else if (state.orderType === 'OCO') {
      price = parseFloat(elements.orderOcoLimitInput.value) || comp.price;
    }

    const lev = state.leverage || 1;
    if (state.orderSide === 'BUY') {
      const budget = state.portfolio.availableCredits * pct * lev;
      const maxShares = Math.floor(budget / price);
      elements.orderQtyInput.value = Math.max(1, maxShares);
    } else {
      const holding = state.portfolio.holdings.find(h => h.symbol === state.selectedSymbol && h.positionType === 'LONG');
      const availableShares = holding ? holding.availableQty : 0;
      if (availableShares > 0) {
        elements.orderQtyInput.value = Math.max(1, Math.floor(availableShares * pct));
      } else {
        // Short sell sizing based on available margin
        const budget = state.portfolio.availableCredits * pct * lev;
        const maxShares = Math.floor(budget / price);
        elements.orderQtyInput.value = Math.max(1, maxShares);
      }
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

  const quantity = parseInt(elements.orderQtyInput.value, 10);
  if (!quantity || quantity <= 0) {
    elements.orderErrorMsg.textContent = 'Invalid quantity';
    return;
  }

  // Handle OCO Bracket submission
  if (state.orderType === 'OCO') {
    const ocoLimit = parseFloat(elements.orderOcoLimitInput.value);
    const ocoStop = parseFloat(elements.orderOcoStopInput.value);
    if (!ocoLimit || ocoLimit <= 0) {
      elements.orderErrorMsg.textContent = 'Valid Take-Profit limit price required for OCO';
      return;
    }
    if (!ocoStop || ocoStop <= 0) {
      elements.orderErrorMsg.textContent = 'Valid Stop-Loss trigger price required for OCO';
      return;
    }

    elements.submitOrderBtn.disabled = true;
    elements.submitOrderBtn.textContent = 'ROUTING OCO...';

    socket.emit('order:placeOco', {
      limitOrder: {
        symbol: state.selectedSymbol,
        side: state.orderSide,
        type: 'LIMIT',
        price: ocoLimit,
        quantity,
        leverage: state.leverage || 1
      },
      stopOrder: {
        symbol: state.selectedSymbol,
        side: state.orderSide,
        type: 'STOP_LOSS',
        stopPrice: ocoStop,
        quantity,
        leverage: state.leverage || 1
      }
    }, (response) => {
      elements.submitOrderBtn.disabled = false;
      elements.submitOrderBtn.textContent = `PLACE OCO BRKT ${state.orderSide}`;
      if (!response.success) {
        elements.orderErrorMsg.textContent = response.error || 'OCO order rejected';
      } else {
        elements.orderErrorMsg.textContent = '';
      }
    });
    return;
  }

  // Standard or Conditional Orders
  const price = (state.orderType === 'LIMIT' || state.orderType === 'STOP_LIMIT')
    ? parseFloat(elements.orderPriceInput.value)
    : comp.price;

  const stopPrice = (state.orderType === 'STOP_LOSS' || state.orderType === 'STOP_LIMIT')
    ? parseFloat(elements.orderStopPriceInput.value)
    : undefined;

  const trailingDelta = (state.orderType === 'TRAILING_STOP')
    ? (parseFloat(elements.orderTrailingDeltaInput.value) || 5.0)
    : undefined;

  if ((state.orderType === 'LIMIT' || state.orderType === 'STOP_LIMIT') && (!price || price <= 0)) {
    elements.orderErrorMsg.textContent = 'Valid limit price required';
    return;
  }

  if ((state.orderType === 'STOP_LOSS' || state.orderType === 'STOP_LIMIT') && (!stopPrice || stopPrice <= 0)) {
    elements.orderErrorMsg.textContent = 'Valid stop trigger price required';
    return;
  }

  if (state.orderType === 'TRAILING_STOP' && (!trailingDelta || trailingDelta <= 0)) {
    elements.orderErrorMsg.textContent = 'Valid trailing delta distance required';
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
    trailingDelta,
    leverage: state.leverage || 1,
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
  { btn: elements.tabBtnTournament, view: elements.viewTournament },
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
  if (data.tournament) {
    renderTournamentState(data.tournament);
  }
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

socket.on('margin:liquidation', ({ liquidations }) => {
  showAchievementToast({
    id: 'LIQUIDATION_ALERT',
    title: 'Margin Call Liquidation',
    description: `Equity breached maintenance margin. Liquidated ${liquidations ? liquidations.length : 1} position(s).`,
    rewardCredits: 0,
    icon: '⚠️'
  });
});

socket.on('order:ocoCancelled', ({ symbol, ocoGroupId, cancelledOrderId }) => {
  showStopTriggerToast({
    id: cancelledOrderId,
    symbol,
    type: 'OCO_CANCELLED',
    side: 'CANCEL',
    price: 0
  });
});

// Tournament Arena Logic (v0.6)
function renderTournamentState(tourney) {
  if (!tourney) return;
  state.tournament = tourney;

  const isJoined = tourney.leaderboard && tourney.leaderboard.some(p => p.userId === state.user.id);
  state.joinedTourney = isJoined;

  if (elements.tourneyBadgeCount) {
    elements.tourneyBadgeCount.textContent = tourney.participantsCount || 0;
  }
  if (elements.tourneyHeroParticipants) {
    elements.tourneyHeroParticipants.textContent = tourney.participantsCount || 0;
  }
  if (elements.tourneyHeroStatus) {
    elements.tourneyHeroStatus.textContent = tourney.status;
  }

  // Topbar Timer & Hero Timer
  let timerText = 'IDLE';
  if (tourney.status === 'COUNTDOWN') {
    timerText = `START IN ${tourney.countdownRemaining || 0}s`;
  } else if (tourney.status === 'ACTIVE') {
    const m = Math.floor((tourney.roundRemainingSec || 0) / 60);
    const s = (tourney.roundRemainingSec || 0) % 60;
    timerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  } else if (tourney.status === 'CONCLUDED') {
    timerText = 'CONCLUDED';
  }

  if (elements.tourneyTimer) {
    elements.tourneyTimer.textContent = timerText;
  }
  if (elements.tourneyHeroTimer) {
    elements.tourneyHeroTimer.textContent = timerText;
  }

  // Join buttons state
  const joinBtns = [elements.joinTourneyBtn, elements.tourneyJoinHeroBtn];
  joinBtns.forEach(btn => {
    if (!btn) return;
    if (isJoined) {
      btn.textContent = 'ENROLLED';
      btn.classList.add('joined');
      btn.disabled = true;
    } else {
      btn.textContent = tourney.status === 'ACTIVE' ? 'JOIN ROUND' : 'ENROLL';
      btn.classList.remove('joined');
      btn.disabled = false;
    }
  });

  // Render Table
  if (elements.tourneyTableBody) {
    elements.tourneyTableBody.innerHTML = '';
    if (!tourney.leaderboard || tourney.leaderboard.length === 0) {
      elements.tourneyTableBody.innerHTML = `<tr class="empty-row"><td colspan="8">No participants enrolled yet. Click ENROLL to enter!</td></tr>`;
    } else {
      tourney.leaderboard.forEach((p, idx) => {
        const isMe = p.userId === state.user.id;
        const isProfit = p.netReturn >= 0;
        const sign = isProfit ? '+' : '';
        const pnlCls = isProfit ? 'up' : 'down';

        const row = document.createElement('tr');
        if (isMe) row.style.backgroundColor = '#171b20';

        row.innerHTML = `
          <td>#${idx + 1}</td>
          <td><b>${p.name}</b> ${isMe ? '<span style="color:var(--amber);font-size:9px">(You)</span>' : ''}</td>
          <td><span class="badge-tag">Trader</span></td>
          <td>${formatCurrency(tourney.standardBankroll)}</td>
          <td>${formatCurrency(p.totalNetWorth)}</td>
          <td class="${pnlCls}">${sign}${formatCurrency(p.netReturn)}</td>
          <td class="${pnlCls}">${sign}${p.returnPercent.toFixed(2)}%</td>
          <td>${p.tradesCount}</td>
        `;
        elements.tourneyTableBody.appendChild(row);
      });
    }
  }
}

function joinTournament() {
  socket.emit('tournament:join', {}, (res) => {
    if (res && res.success) {
      state.joinedTourney = true;
      if (elements.joinTourneyBtn) {
        elements.joinTourneyBtn.textContent = 'ENROLLED';
        elements.joinTourneyBtn.classList.add('joined');
      }
      if (elements.tourneyJoinHeroBtn) {
        elements.tourneyJoinHeroBtn.textContent = 'ENROLLED';
        elements.tourneyJoinHeroBtn.classList.add('joined');
      }
    }
  });
}

function handleTournamentConcluded(lastPodium) {
  if (!lastPodium || !lastPodium.podium) return;
  renderTournamentState(state.tournament);

  if (elements.podiumCardsContainer) {
    elements.podiumCardsContainer.innerHTML = '';
    lastPodium.podium.forEach(p => {
      const isProfit = p.netReturn >= 0;
      const sign = isProfit ? '+' : '';
      const pnlCls = isProfit ? 'up' : 'down';
      const card = document.createElement('div');
      card.className = `podium-card rank-${p.rank}`;
      card.innerHTML = `
        <div class="podium-rank-badge">RANK #${p.rank}</div>
        <div class="podium-name">${p.name}</div>
        <div class="podium-return ${pnlCls}">${sign}${p.returnPercent.toFixed(2)}%</div>
        <div class="podium-prize">+${formatCurrency(p.prizeCredits)} PRIZE</div>
      `;
      elements.podiumCardsContainer.appendChild(card);
    });
  }

  if (elements.tourneyPodiumModal) {
    elements.tourneyPodiumModal.classList.remove('hidden');
  }
}

// Tournament UI Event Bindings
if (elements.joinTourneyBtn) {
  elements.joinTourneyBtn.addEventListener('click', joinTournament);
}
if (elements.tourneyJoinHeroBtn) {
  elements.tourneyJoinHeroBtn.addEventListener('click', joinTournament);
}
if (elements.closeTourneyPodiumBtn) {
  elements.closeTourneyPodiumBtn.addEventListener('click', () => {
    elements.tourneyPodiumModal.classList.add('hidden');
  });
}
if (elements.dismissTourneyPodiumBtn) {
  elements.dismissTourneyPodiumBtn.addEventListener('click', () => {
    elements.tourneyPodiumModal.classList.add('hidden');
  });
}

// Tournament Socket Listeners
socket.on('tournament:state', (tourney) => {
  renderTournamentState(tourney);
});

socket.on('tournament:tick', (tourney) => {
  renderTournamentState(tourney);
});

socket.on('tournament:concluded', (podiumData) => {
  handleTournamentConcluded(podiumData);
});

// App Startup
document.addEventListener('DOMContentLoaded', () => {
  initChart();
  initUser();
});
