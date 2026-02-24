class ForecastService {

  // Monte Carlo simulation for epic completion forecasting
  // Uses historical throughput to predict when N remaining items will be completed
  monteCarloForecast(historicalThroughput, remainingItems, simulations = 10000) {
    if (!historicalThroughput || historicalThroughput.length === 0 || remainingItems <= 0) {
      return {
        remainingItems,
        simulations: 0,
        percentiles: {},
        distribution: [],
        message: 'Insufficient data for forecast'
      };
    }

    // Extract throughput values (epics completed per period)
    const throughputValues = historicalThroughput.map(t => t.count);

    // Run simulations
    const completionDays = [];

    for (let sim = 0; sim < simulations; sim++) {
      let itemsLeft = remainingItems;
      let periods = 0;

      while (itemsLeft > 0 && periods < 100) { // cap at 100 periods to prevent infinite loop
        // Random sample from historical throughput
        const randomIdx = Math.floor(Math.random() * throughputValues.length);
        const throughput = throughputValues[randomIdx];
        itemsLeft -= throughput;
        periods++;
      }

      completionDays.push(periods);
    }

    // Sort for percentile calculation
    completionDays.sort((a, b) => a - b);

    const percentile = (arr, p) => {
      const idx = Math.ceil(arr.length * p / 100) - 1;
      return arr[Math.max(0, idx)];
    };

    // Convert periods to dates (assuming monthly throughput)
    const now = new Date();
    const periodToDate = (periods) => {
      const d = new Date(now);
      d.setMonth(d.getMonth() + periods);
      return d.toISOString().split('T')[0];
    };

    const p50 = percentile(completionDays, 50);
    const p85 = percentile(completionDays, 85);
    const p95 = percentile(completionDays, 95);

    // Build distribution histogram
    const maxPeriods = completionDays[completionDays.length - 1];
    const distribution = [];
    for (let p = 1; p <= Math.min(maxPeriods, 24); p++) {
      const count = completionDays.filter(d => d <= p).length;
      const probability = Math.round((count / simulations) * 100);
      distribution.push({
        periods: p,
        date: periodToDate(p),
        probability
      });
    }

    return {
      remainingItems,
      simulations,
      avgThroughput: Math.round(throughputValues.reduce((a, b) => a + b, 0) / throughputValues.length * 10) / 10,
      percentiles: {
        p50: { periods: p50, date: periodToDate(p50), confidence: '50%' },
        p85: { periods: p85, date: periodToDate(p85), confidence: '85%' },
        p95: { periods: p95, date: periodToDate(p95), confidence: '95%' }
      },
      distribution
    };
  }
}

export default new ForecastService();
