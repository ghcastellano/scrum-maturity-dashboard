import { useState, useEffect } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import api from '../../services/api';

const WIP_LIMIT_DEFAULT = 10;

export default function PortfolioTab({ credentials, selectedBoards }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [wipLimit, setWipLimit] = useState(WIP_LIMIT_DEFAULT);

  const boardIds = selectedBoards.map(b => typeof b === 'object' ? b.id : b);

  useEffect(() => {
    loadPortfolio();
  }, []);

  const loadPortfolio = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getPortfolioView(
        credentials.jiraUrl,
        credentials.email,
        credentials.apiToken,
        boardIds
      );
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.message || 'Failed to load portfolio data');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="card text-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Building portfolio view...</p>
        <p className="text-xs text-gray-400 mt-1">Running Monte Carlo simulation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card bg-red-50 border-red-200">
        <p className="text-red-700 text-sm">{error}</p>
        <button onClick={loadPortfolio} className="mt-2 text-xs text-red-600 underline">Try again</button>
      </div>
    );
  }

  if (!data) return null;

  const { cumulativeFlow, leadCycleTime, wipMetrics, forecast } = data;

  // ===== CFD Chart =====
  const cfdData = {
    labels: cumulativeFlow.map(s => s.week),
    datasets: [
      {
        label: 'Done',
        data: cumulativeFlow.map(s => s.done),
        backgroundColor: 'rgba(34, 197, 94, 0.4)',
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 1,
        fill: true,
        tension: 0.3
      },
      {
        label: 'In Progress',
        data: cumulativeFlow.map(s => s.inProgress),
        backgroundColor: 'rgba(59, 130, 246, 0.4)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
        fill: true,
        tension: 0.3
      },
      {
        label: 'To Do',
        data: cumulativeFlow.map(s => s.todo),
        backgroundColor: 'rgba(156, 163, 175, 0.3)',
        borderColor: 'rgb(156, 163, 175)',
        borderWidth: 1,
        fill: true,
        tension: 0.3
      }
    ]
  };

  const cfdOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true } },
      tooltip: { mode: 'index', intersect: false }
    },
    scales: {
      x: {
        ticks: { font: { size: 10 }, maxRotation: 45 },
        grid: { display: false }
      },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: { font: { size: 11 }, stepSize: 1 },
        grid: { color: 'rgba(0,0,0,0.05)' }
      }
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false }
  };

  // ===== Lead Time Histogram =====
  const histogramData = {
    labels: leadCycleTime.histogram.map(h => h.range),
    datasets: [{
      label: 'Epics',
      data: leadCycleTime.histogram.map(h => h.count),
      backgroundColor: 'rgba(124, 58, 237, 0.6)',
      borderColor: 'rgb(124, 58, 237)',
      borderWidth: 1,
      borderRadius: 4
    }]
  };

  const histogramOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item) => `${item.raw} epic${item.raw !== 1 ? 's' : ''}`
        }
      }
    },
    scales: {
      x: {
        title: { display: true, text: 'Lead Time (days)', font: { size: 11 } },
        ticks: { font: { size: 10 } },
        grid: { display: false }
      },
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1, font: { size: 11 } },
        grid: { color: 'rgba(0,0,0,0.05)' }
      }
    }
  };

  // ===== Monte Carlo Distribution Chart =====
  const forecastChartData = forecast.distribution.length > 0 ? {
    labels: forecast.distribution.map(d => d.date),
    datasets: [{
      label: 'Probability of Completion',
      data: forecast.distribution.map(d => d.probability),
      backgroundColor: forecast.distribution.map(d => {
        if (d.probability >= 85) return 'rgba(34, 197, 94, 0.6)';
        if (d.probability >= 50) return 'rgba(245, 158, 11, 0.6)';
        return 'rgba(239, 68, 68, 0.4)';
      }),
      borderColor: forecast.distribution.map(d => {
        if (d.probability >= 85) return 'rgb(34, 197, 94)';
        if (d.probability >= 50) return 'rgb(245, 158, 11)';
        return 'rgb(239, 68, 68)';
      }),
      borderWidth: 1,
      borderRadius: 4
    }]
  } : null;

  const forecastOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item) => `${item.raw}% chance of completion by this date`
        }
      }
    },
    scales: {
      x: {
        title: { display: true, text: 'Date', font: { size: 11 } },
        ticks: { font: { size: 9 }, maxRotation: 45 },
        grid: { display: false }
      },
      y: {
        title: { display: true, text: 'Probability (%)', font: { size: 11 } },
        beginAtZero: true,
        max: 100,
        ticks: { font: { size: 11 } },
        grid: { color: 'rgba(0,0,0,0.05)' }
      }
    }
  };

  // WIP gauge color
  const wipOverLimit = wipMetrics.totalWIP > wipLimit;

  return (
    <div className="space-y-6">
      {/* Portfolio KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="card text-center">
          <p className={`text-2xl font-bold ${wipOverLimit ? 'text-red-600' : 'text-blue-600'}`}>
            {wipMetrics.totalWIP}
          </p>
          <p className="text-xs text-gray-500 mt-1">WIP Epics</p>
          {wipOverLimit && <p className="text-xs text-red-500">Over limit ({wipLimit})</p>}
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-700">{wipMetrics.avgAge}d</p>
          <p className="text-xs text-gray-500 mt-1">Avg WIP Age</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-purple-600">{leadCycleTime.totalResolved}</p>
          <p className="text-xs text-gray-500 mt-1">Epics Resolved</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-700">{leadCycleTime.average}d</p>
          <p className="text-xs text-gray-500 mt-1">Avg Lead Time</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-amber-600">{leadCycleTime.percentiles.p85}d</p>
          <p className="text-xs text-gray-500 mt-1">p85 Lead Time</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-600">
            {forecast.avgThroughput || '-'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Avg Monthly Throughput</p>
        </div>
      </div>

      {/* Cumulative Flow Diagram */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Epic Cumulative Flow</h3>
        <div style={{ height: '300px' }}>
          <Line data={cfdData} options={cfdOptions} />
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">Weekly snapshot of epic statuses (last 12 weeks)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Time Distribution */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Epic Lead Time Distribution</h3>
          <p className="text-xs text-gray-400 mb-4">From creation to resolution</p>
          {leadCycleTime.histogram.length > 0 ? (
            <>
              <div style={{ height: '220px' }}>
                <Bar data={histogramData} options={histogramOptions} />
              </div>
              <div className="flex justify-center gap-6 mt-3 text-xs">
                <span className="text-gray-500">p50: <strong>{leadCycleTime.percentiles.p50}d</strong></span>
                <span className="text-gray-500">p70: <strong>{leadCycleTime.percentiles.p70}d</strong></span>
                <span className="text-amber-600">p85: <strong>{leadCycleTime.percentiles.p85}d</strong></span>
                <span className="text-red-600">p95: <strong>{leadCycleTime.percentiles.p95}d</strong></span>
              </div>
            </>
          ) : (
            <p className="text-center text-gray-400 text-sm py-8">No resolved epics with date data</p>
          )}
        </div>

        {/* Monte Carlo Forecast */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Monte Carlo Forecast</h3>
          <p className="text-xs text-gray-400 mb-4">
            When will {forecast.remainingItems} remaining epic{forecast.remainingItems !== 1 ? 's' : ''} be completed?
          </p>
          {forecastChartData ? (
            <>
              <div style={{ height: '220px' }}>
                <Bar data={forecastChartData} options={forecastOptions} />
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="text-center p-2 bg-amber-50 rounded">
                  <p className="text-xs text-amber-600 font-medium">50% confidence</p>
                  <p className="text-sm font-bold text-amber-700">{forecast.percentiles.p50?.date || '-'}</p>
                </div>
                <div className="text-center p-2 bg-green-50 rounded">
                  <p className="text-xs text-green-600 font-medium">85% confidence</p>
                  <p className="text-sm font-bold text-green-700">{forecast.percentiles.p85?.date || '-'}</p>
                </div>
                <div className="text-center p-2 bg-blue-50 rounded">
                  <p className="text-xs text-blue-600 font-medium">95% confidence</p>
                  <p className="text-sm font-bold text-blue-700">{forecast.percentiles.p95?.date || '-'}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-center text-gray-400 text-sm py-8">Insufficient throughput data for simulation</p>
          )}
        </div>
      </div>

      {/* WIP Management */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">WIP Management</h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">WIP Limit:</label>
            <input
              type="number"
              value={wipLimit}
              onChange={(e) => setWipLimit(parseInt(e.target.value) || 1)}
              className="w-16 text-xs border border-gray-200 rounded px-2 py-1 text-center"
              min="1"
            />
          </div>
        </div>

        {/* WIP gauge bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">
              {wipMetrics.totalWIP} of {wipLimit} WIP limit
            </span>
            <span className={`text-xs font-medium ${wipOverLimit ? 'text-red-600' : 'text-green-600'}`}>
              {wipOverLimit ? 'OVER LIMIT' : 'Within limit'}
            </span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                wipOverLimit ? 'bg-red-500' : wipMetrics.totalWIP > wipLimit * 0.8 ? 'bg-amber-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min((wipMetrics.totalWIP / wipLimit) * 100, 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* WIP by Assignee */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">WIP by Assignee</h4>
            {wipMetrics.wipByAssignee.length > 0 ? (
              <div className="space-y-2">
                {wipMetrics.wipByAssignee.map(item => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-32 truncate">{item.name}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${(item.count / wipMetrics.totalWIP) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-700 w-6 text-right">{item.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No WIP items</p>
            )}
          </div>

          {/* WIP Aging */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Aging WIP Items</h4>
            {wipMetrics.wipAge.length > 0 ? (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {wipMetrics.wipAge.slice(0, 10).map(item => (
                  <div key={item.key} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50">
                    <span className="text-xs font-medium text-purple-700 w-20">{item.key}</span>
                    <span className="text-xs text-gray-600 flex-1 truncate">{item.summary}</span>
                    <span className={`text-xs font-medium ${
                      item.ageDays > 90 ? 'text-red-600' : item.ageDays > 30 ? 'text-amber-600' : 'text-gray-500'
                    }`}>
                      {item.ageDays}d
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No WIP items</p>
            )}
          </div>
        </div>
      </div>

      {/* Methodology Info */}
      <div className="card bg-purple-50 border-purple-200">
        <h4 className="text-sm font-semibold text-purple-800 mb-2">About these metrics</h4>
        <div className="text-xs text-purple-700 space-y-1">
          <p><strong>Cumulative Flow</strong>: Weekly snapshot of epics by status. Widening bands indicate bottlenecks.</p>
          <p><strong>Lead Time</strong>: Days from epic creation to resolution. Use p85 for SLA commitments.</p>
          <p><strong>Monte Carlo</strong>: {forecast.simulations?.toLocaleString() || '10,000'} simulations using historical monthly throughput to forecast completion dates.</p>
          <p><strong>WIP</strong>: Limiting work-in-progress reduces lead time and improves flow (Little's Law).</p>
        </div>
      </div>
    </div>
  );
}
