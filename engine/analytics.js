/**
 * Quantitative Financial Risk & Performance Analytics Module
 * MarketArena Trading Engine
 */

export class PerformanceAnalytics {
  /**
   * Calculate comprehensive institutional risk and performance metrics
   * @param {Object} params
   * @param {Array<Object>} params.tradeHistory
   * @param {Array<{time: number, equity: number}>} params.equityCurve
   * @param {number} params.startingNetWorth
   * @param {number} params.currentNetWorth
   * @returns {Object} Quantitative risk metrics
   */
  static calculateMetrics({
    tradeHistory = [],
    equityCurve = [],
    startingNetWorth = 100000,
    currentNetWorth = 100000
  }) {
    // Filter to closed/settled trades with realized P&L
    const closedTrades = tradeHistory.filter(t => t.realizedPnL !== undefined && t.realizedPnL !== null);
    const winningTrades = closedTrades.filter(t => t.realizedPnL > 0);
    const losingTrades = closedTrades.filter(t => t.realizedPnL < 0);
    const breakevenTrades = closedTrades.filter(t => t.realizedPnL === 0);

    const totalClosed = closedTrades.length;
    const winCount = winningTrades.length;
    const lossCount = losingTrades.length;

    // Win Rate (%)
    const winRate = totalClosed > 0 ? +((winCount / totalClosed) * 100).toFixed(2) : 0;

    // Win / Loss Ratio (count ratio)
    const winLossRatio = lossCount > 0 ? +(winCount / lossCount).toFixed(2) : (winCount > 0 ? winCount : 0);

    // Gross Profit & Gross Loss
    const grossProfit = +winningTrades.reduce((sum, t) => sum + t.realizedPnL, 0).toFixed(2);
    const grossLoss = +Math.abs(losingTrades.reduce((sum, t) => sum + t.realizedPnL, 0)).toFixed(2);
    const netRealizedPnL = +(grossProfit - grossLoss).toFixed(2);

    // Profit Factor (Gross Profit / Gross Loss)
    let profitFactor = 0;
    if (grossLoss > 0) {
      profitFactor = +(grossProfit / grossLoss).toFixed(2);
    } else if (grossProfit > 0) {
      profitFactor = 99.99; // Benchmark cap for zero-loss runs
    } else {
      profitFactor = 1.0;
    }

    // Average Win and Average Loss
    const avgWin = winCount > 0 ? +(grossProfit / winCount).toFixed(2) : 0;
    const avgLoss = lossCount > 0 ? +(grossLoss / lossCount).toFixed(2) : 0;
    const payoffRatio = avgLoss > 0 ? +(avgWin / avgLoss).toFixed(2) : (avgWin > 0 ? 99.99 : 0);

    // Maximum Drawdown (MDD %) over equity curve
    let peak = startingNetWorth;
    let maxDrawdownPercent = 0;
    let maxDrawdownValue = 0;

    const fullCurve = [...equityCurve];
    if (fullCurve.length === 0 || fullCurve[fullCurve.length - 1].equity !== currentNetWorth) {
      fullCurve.push({ time: Date.now(), equity: currentNetWorth });
    }

    for (const point of fullCurve) {
      if (point.equity > peak) {
        peak = point.equity;
      }
      const ddValue = peak - point.equity;
      const ddPercent = peak > 0 ? (ddValue / peak) * 100 : 0;

      if (ddPercent > maxDrawdownPercent) {
        maxDrawdownPercent = ddPercent;
        maxDrawdownValue = ddValue;
      }
    }

    // Sharpe Ratio Calculation
    // Computed over closed trade percentage returns: R_i = realizedPnL / tradeCost
    let sharpeRatio = 0;
    if (closedTrades.length >= 2) {
      const returns = closedTrades.map(t => {
        const cost = (t.price * t.quantity) || 1;
        return t.realizedPnL / cost;
      });

      const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1);
      const stdDev = Math.sqrt(variance);

      // Assumed risk-free rate per transaction (equivalent to 2% annual)
      const riskFreePerTrade = 0.0001;

      if (stdDev > 0) {
        // Annualized Sharpe using sqrt(252 trading days * 10 trades/day) = ~50 scaling factor
        sharpeRatio = +(((meanReturn - riskFreePerTrade) / stdDev) * Math.sqrt(252)).toFixed(2);
      }
    }

    return {
      totalClosedTrades: totalClosed,
      winCount,
      lossCount,
      breakevenCount: breakevenTrades.length,
      winRate,
      winLossRatio,
      grossProfit,
      grossLoss,
      netRealizedPnL,
      profitFactor,
      avgWin,
      avgLoss,
      payoffRatio,
      maxDrawdownPercent: +maxDrawdownPercent.toFixed(2),
      maxDrawdownValue: +maxDrawdownValue.toFixed(2),
      sharpeRatio,
      peakNetWorth: +peak.toFixed(2)
    };
  }
}
