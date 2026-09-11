/**
 * Black-Scholes-Merton Derivatives Engine & Options Chain Subsystem
 * Pure ES module, zero external math libraries.
 *
 * Implements:
 * 1. High-precision Standard Normal CDF and PDF (Abramowitz & Stegun formula 26.2.17)
 * 2. Analytical Black-Scholes-Merton Pricing for European Calls and Puts
 * 3. First and Second-Order Greeks (Delta, Gamma, Vega, Theta, Rho)
 * 4. Put-Call Parity Analytical Verification
 * 5. Newton-Raphson & Bisection Implied Volatility (IV) Numerical Solvers
 * 6. Multi-Asset Options Chain Generator and Quote Manager
 */

/**
 * Standard Normal Probability Density Function: N'(x) = (1 / sqrt(2*pi)) * exp(-x^2 / 2)
 */
export function normalPDF(x) {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

/**
 * Standard Normal Cumulative Distribution Function: N(x)
 * Accurate to within 7.5e-8 using Abramowitz & Stegun 26.2.17 rational polynomial approximation.
 */
export function normalCDF(x) {
  if (isNaN(x)) return 0;
  if (x === Infinity) return 1;
  if (x === -Infinity) return 0;

  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;

  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const poly = t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
  const cdf = 1.0 - normalPDF(absX) * poly;

  return x >= 0 ? cdf : 1.0 - cdf;
}

/**
 * Evaluates Black-Scholes d1 and d2 intermediate parameters
 */
export function calculateD1D2(S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return { d1: 0, d2: 0 };
  }
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return { d1, d2 };
}

/**
 * Analytical Black-Scholes-Merton European Call Option Price
 * C(S, K, T, r, sigma) = S * N(d1) - K * exp(-r * T) * N(d2)
 */
export function priceCall(S, K, T, r, sigma) {
  if (T <= 0) return Math.max(0, S - K);
  if (sigma <= 0) return Math.max(0, S - K * Math.exp(-r * T));

  const { d1, d2 } = calculateD1D2(S, K, T, r, sigma);
  const call = S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  return Math.max(0, call);
}

/**
 * Analytical Black-Scholes-Merton European Put Option Price
 * P(S, K, T, r, sigma) = K * exp(-r * T) * N(-d2) - S * N(-d1)
 */
export function pricePut(S, K, T, r, sigma) {
  if (T <= 0) return Math.max(0, K - S);
  if (sigma <= 0) return Math.max(0, K * Math.exp(-r * T) - S);

  const { d1, d2 } = calculateD1D2(S, K, T, r, sigma);
  const put = K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  return Math.max(0, put);
}

/**
 * Computes first and second-order Black-Scholes Greeks
 */
export function calculateGreeks(S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    const isCallITM = S > K;
    return {
      deltaCall: isCallITM ? 1 : 0,
      deltaPut: isCallITM ? 0 : -1,
      gamma: 0,
      vega: 0,
      thetaCall: 0,
      thetaPut: 0,
      rhoCall: 0,
      rhoPut: 0
    };
  }

  const { d1, d2 } = calculateD1D2(S, K, T, r, sigma);
  const sqrtT = Math.sqrt(T);
  const pdfD1 = normalPDF(d1);
  const expNegRT = Math.exp(-r * T);

  // Delta
  const deltaCall = normalCDF(d1);
  const deltaPut = deltaCall - 1.0;

  // Gamma (identical for Call and Put)
  const gamma = pdfD1 / (S * sigma * sqrtT);

  // Vega (change in price per 1% change in volatility = 0.01 * S * sqrt(T) * N'(d1))
  const vega = S * sqrtT * pdfD1 * 0.01;

  // Theta (annualized theta divided by 365 for 1-day decay)
  const thetaCommon = -(S * pdfD1 * sigma) / (2 * sqrtT);
  const thetaCallAnnual = thetaCommon - r * K * expNegRT * normalCDF(d2);
  const thetaPutAnnual = thetaCommon + r * K * expNegRT * normalCDF(-d2);
  const thetaCall = thetaCallAnnual / 365.0;
  const thetaPut = thetaPutAnnual / 365.0;

  // Rho (change in price per 1% change in interest rate = 0.01 * K * T * exp(-r*T) * N(d2))
  const rhoCall = K * T * expNegRT * normalCDF(d2) * 0.01;
  const rhoPut = -K * T * expNegRT * normalCDF(-d2) * 0.01;

  return {
    deltaCall: +deltaCall.toFixed(4),
    deltaPut: +deltaPut.toFixed(4),
    gamma: +gamma.toFixed(5),
    vega: +vega.toFixed(4),
    thetaCall: +thetaCall.toFixed(4),
    thetaPut: +thetaPut.toFixed(4),
    rhoCall: +rhoCall.toFixed(4),
    rhoPut: +rhoPut.toFixed(4)
  };
}

/**
 * Validates Put-Call Parity: C - P = S - K * exp(-r * T)
 */
export function verifyPutCallParity(callPrice, putPrice, S, K, T, r, tolerance = 1e-3) {
  const lhs = callPrice - putPrice;
  const rhs = S - K * Math.exp(-r * T);
  const diff = Math.abs(lhs - rhs);
  return {
    lhs: +lhs.toFixed(4),
    rhs: +rhs.toFixed(4),
    difference: +diff.toFixed(6),
    isValid: diff <= tolerance
  };
}

/**
 * Numerical Implied Volatility Solver via Newton-Raphson with Bisection fallback
 * @param {number} marketPrice Target market option premium
 * @param {number} S Current underlying spot price
 * @param {number} K Strike price
 * @param {number} T Time to expiration in years
 * @param {number} r Annualized risk-free interest rate
 * @param {boolean} [isCall=true] True for Call, false for Put
 * @returns {number|null} Implied volatility as decimal (e.g. 0.25 = 25%)
 */
export function calculateImpliedVolatility(marketPrice, S, K, T, r, isCall = true) {
  if (marketPrice <= 0 || T <= 0 || S <= 0 || K <= 0) return null;

  // Intrinsic value boundary check
  const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
  if (marketPrice < intrinsic) return null;

  // Upper bound check (Call price cannot exceed spot, Put cannot exceed discounted strike)
  if (isCall && marketPrice >= S) return null;
  if (!isCall && marketPrice >= K * Math.exp(-r * T)) return null;

  let sigma = 0.30; // Initial guess 30% vol
  const maxIterations = 60;
  const tolerance = 1e-5;

  for (let i = 0; i < maxIterations; i++) {
    const price = isCall ? priceCall(S, K, T, r, sigma) : pricePut(S, K, T, r, sigma);
    const diff = price - marketPrice;

    if (Math.abs(diff) < tolerance) {
      return +sigma.toFixed(4);
    }

    // Vega derivative: d(Price)/d(sigma) = S * sqrt(T) * N'(d1)
    const { d1 } = calculateD1D2(S, K, T, r, sigma);
    const vega = S * Math.sqrt(T) * normalPDF(d1);

    if (vega < 1e-12) break; // Slope too flat, fall back to bisection

    const step = diff / vega;
    sigma -= step;

    if (sigma <= 0.001 || sigma > 5.0) break; // Diverged, switch to bisection
  }

  // Bisection Fallback
  let low = 0.001;
  let high = 5.0;
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    const price = isCall ? priceCall(S, K, T, r, mid) : pricePut(S, K, T, r, mid);
    const diff = price - marketPrice;

    if (Math.abs(diff) < tolerance) {
      return +mid.toFixed(4);
    }

    if (diff > 0) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return +((low + high) / 2).toFixed(4);
}

/**
 * Options Chain Subsystem Manager
 * Generates and updates standardized option chains across all listed equities.
 */
export class OptionsChainManager {
  constructor(marketManager = null) {
    this.marketManager = marketManager;
    this.defaultRiskFreeRate = 0.0525; // 5.25% baseline central bank rate
    this.chainsCache = new Map(); // symbol -> OptionChainData
  }

  getRiskFreeRate() {
    if (this.marketManager && this.marketManager.simulationNews) {
      const ws = this.marketManager.simulationNews.getWorldState();
      if (ws && ws.interestRate) {
        return ws.interestRate / 100.0;
      }
    }
    return this.defaultRiskFreeRate;
  }

  /**
   * Generates a realistic set of strikes around spot price S
   */
  generateStrikes(spotPrice) {
    let interval = 5.0;
    if (spotPrice >= 1000) interval = 25.0;
    else if (spotPrice >= 500) interval = 10.0;
    else if (spotPrice >= 100) interval = 5.0;
    else interval = 2.5;

    const atmStrike = Math.round(spotPrice / interval) * interval;
    const strikes = [];

    for (let step = -4; step <= 4; step++) {
      const strike = +(atmStrike + step * interval).toFixed(2);
      if (strike > 0) strikes.push(strike);
    }

    return strikes;
  }

  /**
   * Generates standard expiration cycles: 7d, 14d, 30d, 60d
   */
  getExpirations() {
    return [
      { label: '7D (Weekly)', days: 7, T: 7 / 365.0 },
      { label: '14D (Bi-Weekly)', days: 14, T: 14 / 365.0 },
      { label: '30D (Monthly)', days: 30, T: 30 / 365.0 },
      { label: '60D (Quarterly)', days: 60, T: 60 / 365.0 }
    ];
  }

  /**
   * Generates or updates the full option chain for a given equity symbol
   * @param {string} symbol Listed equity symbol (e.g. 'AUTO', 'BYTE')
   * @returns {Object} Complete Option Chain with strikes, quotes, and Greeks
   */
  getOptionChain(symbol) {
    const sym = (symbol || '').toUpperCase();
    const comp = this.marketManager ? this.marketManager.getCompany(sym) : null;
    const spot = comp ? comp.price : 100.0;
    const sigma = comp ? (comp.annualVolatility || 0.25) : 0.25;
    const r = this.getRiskFreeRate();

    const strikes = this.generateStrikes(spot);
    const expirations = this.getExpirations();

    const expirationChains = expirations.map(exp => {
      const rows = strikes.map(K => {
        const callTheo = priceCall(spot, K, exp.T, r, sigma);
        const putTheo = pricePut(spot, K, exp.T, r, sigma);
        const greeks = calculateGreeks(spot, K, exp.T, r, sigma);

        // Realistic market maker bid/ask spread around theoretical value
        const halfSpreadCall = Math.max(0.05, +(callTheo * 0.02 + 0.05).toFixed(2));
        const callBid = Math.max(0.01, +(callTheo - halfSpreadCall).toFixed(2));
        const callAsk = +(callTheo + halfSpreadCall).toFixed(2);

        const halfSpreadPut = Math.max(0.05, +(putTheo * 0.02 + 0.05).toFixed(2));
        const putBid = Math.max(0.01, +(putTheo - halfSpreadPut).toFixed(2));
        const putAsk = +(putTheo + halfSpreadPut).toFixed(2);

        // Synthetic Open Interest & Volume based on moneyness proximity
        const moneyness = Math.abs(spot - K) / spot;
        const openInterestCall = Math.max(10, Math.round(1500 * Math.exp(-10 * moneyness)));
        const openInterestPut = Math.max(10, Math.round(1400 * Math.exp(-10 * moneyness)));

        return {
          strike: K,
          moneyness: +(spot / K).toFixed(3),
          call: {
            symbol: `${sym}_${exp.days}D_C_${K}`,
            theoretical: +callTheo.toFixed(2),
            bid: callBid,
            ask: callAsk,
            iv: +sigma.toFixed(4),
            delta: greeks.deltaCall,
            gamma: greeks.gamma,
            vega: greeks.vega,
            theta: greeks.thetaCall,
            rho: greeks.rhoCall,
            openInterest: openInterestCall,
            volume: Math.round(openInterestCall * 0.15)
          },
          put: {
            symbol: `${sym}_${exp.days}D_P_${K}`,
            theoretical: +putTheo.toFixed(2),
            bid: putBid,
            ask: putAsk,
            iv: +sigma.toFixed(4),
            delta: greeks.deltaPut,
            gamma: greeks.gamma,
            vega: greeks.vega,
            theta: greeks.thetaPut,
            rho: greeks.rhoPut,
            openInterest: openInterestPut,
            volume: Math.round(openInterestPut * 0.15)
          }
        };
      });

      return {
        expiration: exp.label,
        daysToExpiry: exp.days,
        timeToExpiryYears: +exp.T.toFixed(4),
        strikes: rows
      };
    });

    const chainData = {
      symbol: sym,
      underlyingPrice: +spot.toFixed(2),
      annualVolatility: +sigma.toFixed(4),
      riskFreeRate: +(r * 100).toFixed(2), // in %
      timestamp: Date.now(),
      expirations: expirationChains
    };

    this.chainsCache.set(sym, chainData);
    return chainData;
  }

  /**
   * Evaluates arbitrary Black-Scholes price & Greeks request
   */
  priceCustomOption({ spot, strike, days, rate, volatility, isCall = true }) {
    const S = parseFloat(spot);
    const K = parseFloat(strike);
    const T = (parseFloat(days) || 30) / 365.0;
    const r = (parseFloat(rate) !== undefined ? parseFloat(rate) : (this.getRiskFreeRate() * 100)) / 100.0;
    const sigma = parseFloat(volatility) || 0.25;

    const theo = isCall ? priceCall(S, K, T, r, sigma) : pricePut(S, K, T, r, sigma);
    const greeks = calculateGreeks(S, K, T, r, sigma);
    const parity = verifyPutCallParity(
      priceCall(S, K, T, r, sigma),
      pricePut(S, K, T, r, sigma),
      S, K, T, r
    );

    return {
      type: isCall ? 'CALL' : 'PUT',
      spot: S,
      strike: K,
      daysToExpiry: parseFloat(days) || 30,
      timeYears: +T.toFixed(4),
      riskFreeRatePct: +(r * 100).toFixed(2),
      volatilityPct: +(sigma * 100).toFixed(2),
      theoreticalPrice: +theo.toFixed(4),
      greeks: {
        delta: isCall ? greeks.deltaCall : greeks.deltaPut,
        gamma: greeks.gamma,
        vega: greeks.vega,
        theta: isCall ? greeks.thetaCall : greeks.thetaPut,
        rho: isCall ? greeks.rhoCall : greeks.rhoPut
      },
      parity
    };
  }
}
