import { useState, useMemo } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { IssueTypeIcon, JiraLink } from './JiraIcons';

const WIP_LIMIT_DEFAULT = 10;

export default function PortfolioTab({ credentials, selectedBoards, portfolioData, epicData }) {
  const jiraBaseUrl = credentials?.jiraUrl?.replace(/\/$/, '') || '';
  const data = portfolioData || null;
  const [wipLimit, setWipLimit] = useState(WIP_LIMIT_DEFAULT);

  if (!data) {
    return (
      <div className="card text-center py-16">
        <p className="text-gray-500">No portfolio data available. Click "Refresh from Jira" to load.</p>
      </div>
    );
  }

  const { cumulativeFlow, leadCycleTime, wipMetrics, forecast, throughput } = data;

  // Initiative-level summary from epicData
  const initiativeSummary = useMemo(() => {
    if (!epicData?.initiatives) return null;
    const inits = epicData.initiatives.filter(i => i.key !== '_unlinked');
    const totalInits = inits.length;
    const completedInits = inits.filter(i => i.progress === 100).length;
    const activeInits = inits.filter(i => i.progress > 0 && i.progress < 100).length;
    const avgProgress = totalInits > 0 ? Math.round(inits.reduce((s, i) => s + i.progress, 0) / totalInits) : 0;
    const totalEpicsInInits = inits.reduce((s, i) => s + i.totalEpics, 0);
    const completedEpicsInInits = inits.reduce((s, i) => s + i.completedEpics, 0);
    return { totalInits, completedInits, activeInits, avgProgress, totalEpicsInInits, completedEpicsInInits, initiatives: inits };
  }, [epicData]);

  // ===== Insights =====
  const insights = useMemo(() => {
    const items = [];
    const latestCFD = cumulativeFlow[cumulativeFlow.length - 1];
    const prevCFD = cumulativeFlow.length > 4 ? cumulativeFlow[cumulativeFlow.length - 5] : null;

    // WIP trend
    if (prevCFD && latestCFD) {
      const wipNow = latestCFD.inProgress;
      const wipBefore = prevCFD.inProgress;
      if (wipNow > wipBefore + 2) {
        items.push({ type: 'warning', text: `WIP increased from ${wipBefore} to ${wipNow} in-progress epics over the last month. Growing WIP leads to longer lead times.` });
      } else if (wipNow < wipBefore - 2) {
        items.push({ type: 'success', text: `WIP decreased from ${wipBefore} to ${wipNow} in-progress epics. Less WIP means better focus and faster delivery.` });
      }
    }

    // Throughput trend
    if (throughput && throughput.length >= 3) {
      const recent = throughput.slice(-3).reduce((s, t) => s + t.count, 0) / 3;
      const older = throughput.slice(-6, -3).reduce((s, t) => s + t.count, 0) / Math.max(throughput.slice(-6, -3).length, 1);
      if (older > 0 && recent > older * 1.2) {
        items.push({ type: 'success', text: `Throughput is trending up: ${recent.toFixed(1)} epics/month (last 3) vs ${older.toFixed(1)} (prior 3).` });
      } else if (older > 0 && recent < older * 0.7) {
        items.push({ type: 'warning', text: `Throughput is declining: ${recent.toFixed(1)} epics/month (last 3) vs ${older.toFixed(1)} (prior 3). Consider reducing WIP or removing blockers.` });
      }
    }

    // Lead time vs age
    if (leadCycleTime.average > 0 && wipMetrics.avgAge > leadCycleTime.average * 1.5) {
      items.push({ type: 'danger', text: `Average WIP age (${wipMetrics.avgAge}d) is much higher than average lead time (${leadCycleTime.average}d). Some epics may be stalled.` });
    }

    // p85 vs p50 spread
    if (leadCycleTime.percentiles.p85 > 0 && leadCycleTime.percentiles.p50 > 0) {
      const spread = leadCycleTime.percentiles.p85 / leadCycleTime.percentiles.p50;
      if (spread > 3) {
        items.push({ type: 'warning', text: `High lead time variability: p85 (${leadCycleTime.percentiles.p85}d) is ${spread.toFixed(1)}x the p50 (${leadCycleTime.percentiles.p50}d). Predictability is low — look for systemic blockers.` });
      }
    }

    // Aging WIP items
    const oldItems = wipMetrics.wipAge.filter(w => w.ageDays > 90);
    if (oldItems.length > 0) {
      items.push({ type: 'danger', text: `${oldItems.length} epic${oldItems.length > 1 ? 's' : ''} in progress for over 90 days: ${oldItems.slice(0, 3).map(w => w.key).join(', ')}${oldItems.length > 3 ? ` and ${oldItems.length - 3} more` : ''}. Consider splitting or deprioritizing.` });
    }

    // Forecast
    if (forecast.percentiles?.p85?.date) {
      items.push({ type: 'info', text: `At current throughput, 85% chance of completing all remaining ${forecast.remainingItems} epics by ${forecast.percentiles.p85.date}.` });
    }

    // Backlog ratio
    if (latestCFD) {
      const total = latestCFD.done + latestCFD.inProgress + latestCFD.todo;
      const doneRatio = total > 0 ? Math.round((latestCFD.done / total) * 100) : 0;
      if (doneRatio < 20) {
        items.push({ type: 'info', text: `Only ${doneRatio}% of epics are completed. ${latestCFD.todo} still in backlog, ${latestCFD.inProgress} in progress.` });
      } else if (doneRatio > 70) {
        items.push({ type: 'success', text: `${doneRatio}% of epics are completed (${latestCFD.done} done). Portfolio is maturing well.` });
      }
    }

    return items;
  }, [cumulativeFlow, leadCycleTime, wipMetrics, forecast, throughput]);

  // ===== CFD Chart (order: To Do bottom, In Progress middle, Done top) =====
  const cfdData = {
    labels: cumulativeFlow.map(s => s.week),
    datasets: [
      {
        label: 'To Do',
        data: cumulativeFlow.map(s => s.todo),
        backgroundColor: 'rgba(156, 163, 175, 0.3)',
        borderColor: 'rgb(156, 163, 175)',
        borderWidth: 1,
        fill: true,
        tension: 0.3,
        order: 3
      },
      {
        label: 'In Progress',
        data: cumulativeFlow.map(s => s.inProgress),
        backgroundColor: 'rgba(59, 130, 246, 0.4)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
        fill: true,
        tension: 0.3,
        order: 2
      },
      {
        label: 'Done',
        data: cumulativeFlow.map(s => s.done),
        backgroundColor: 'rgba(34, 197, 94, 0.4)',
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 1,
        fill: true,
        tension: 0.3,
        order: 1
      }
    ]
  };

  const cfdOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { font: { size: 11 }, usePointStyle: true },
        reverse: true // Show Done first in legend
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        itemSort: (a, b) => a.datasetIndex - b.datasetIndex // To Do, In Progress, Done order in tooltip
      }
    },
    scales: {
      x: {
        ticks: { font: { size: 10 }, maxRotation: 45 },
        grid: { display: false }
      },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: { font: { size: 11 } },
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

  // ===== Throughput Trend =====
  const throughputData = throughput && throughput.length > 0 ? {
    labels: throughput.map(t => t.period),
    datasets: [{
      label: 'Epics Completed',
      data: throughput.map(t => t.count),
      backgroundColor: 'rgba(124, 58, 237, 0.5)',
      borderColor: 'rgb(124, 58, 237)',
      borderWidth: 1.5,
      borderRadius: 4,
      type: 'bar'
    }]
  } : null;

  const throughputOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item) => `${item.raw} epic${item.raw !== 1 ? 's' : ''} completed`
        }
      }
    },
    scales: {
      x: { ticks: { font: { size: 10 }, maxRotation: 45 }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } }
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

  const insightIcon = (type) => {
    switch (type) {
      case 'success': return { icon: 'checkmark', cls: 'bg-green-100 text-green-700 border-green-200' };
      case 'warning': return { icon: 'warning', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'danger': return { icon: 'alert', cls: 'bg-red-50 text-red-700 border-red-200' };
      default: return { icon: 'info', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Initiative Overview */}
      {initiativeSummary && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Initiative Overview</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">{initiativeSummary.totalInits}</p>
              <p className="text-xs text-gray-500">Total Initiatives</p>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{initiativeSummary.activeInits}</p>
              <p className="text-xs text-gray-500">Active Initiatives</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{initiativeSummary.completedInits}</p>
              <p className="text-xs text-gray-500">Completed Initiatives</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-700">{initiativeSummary.avgProgress}%</p>
              <p className="text-xs text-gray-500">Avg Initiative Progress</p>
            </div>
          </div>
          {/* Top initiatives with progress */}
          <div className="space-y-2">
            {initiativeSummary.initiatives
              .sort((a, b) => b.totalEpics - a.totalEpics)
              .slice(0, 8)
              .map(init => (
                <div key={init.key} className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 w-24 shrink-0">
                    <IssueTypeIcon type="Initiative" size={12} />
                    <JiraLink issueKey={init.key} jiraBaseUrl={jiraBaseUrl} className="text-xs font-medium text-purple-700" />
                  </span>
                  <span className="text-xs text-gray-600 flex-1 truncate">{init.summary}</span>
                  <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden shrink-0">
                    <div className={`h-full rounded-full ${init.progress >= 80 ? 'bg-green-500' : init.progress >= 40 ? 'bg-amber-500' : 'bg-blue-500'}`}
                      style={{ width: `${init.progress}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 w-16 text-right shrink-0">
                    {init.completedEpics}/{init.totalEpics} epics
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Epic-Level Portfolio KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="card text-center">
          <p className={`text-2xl font-bold ${wipOverLimit ? 'text-red-600' : 'text-blue-600'}`}>
            {wipMetrics.totalWIP}
          </p>
          <p className="text-xs text-gray-500 mt-1">Epics In Progress (WIP)</p>
          {wipOverLimit && <p className="text-xs text-red-500">Over limit ({wipLimit})</p>}
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-700">{wipMetrics.avgAge}d</p>
          <p className="text-xs text-gray-500 mt-1">Avg Epic WIP Age</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-purple-600">{leadCycleTime.totalResolved}</p>
          <p className="text-xs text-gray-500 mt-1">Epics Resolved</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-700">{leadCycleTime.average}d</p>
          <p className="text-xs text-gray-500 mt-1">Avg Epic Lead Time</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-amber-600">{leadCycleTime.percentiles.p85}d</p>
          <p className="text-xs text-gray-500 mt-1">p85 Epic Lead Time</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-600">
            {forecast.avgThroughput || '-'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Epics/Month (Avg)</p>
        </div>
      </div>

      {/* Insights Panel */}
      {insights.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Portfolio Insights</h3>
          <div className="space-y-2">
            {insights.map((insight, idx) => {
              const style = insightIcon(insight.type);
              return (
                <div key={idx} className={`px-3 py-2 rounded-lg border text-xs ${style.cls}`}>
                  {insight.text}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cumulative Flow Diagram */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Epic Cumulative Flow</h3>
        <div style={{ height: '300px' }}>
          <Line data={cfdData} options={cfdOptions} />
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">Weekly snapshot of epic statuses (last 12 weeks). Widening bands indicate bottlenecks.</p>
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

        {/* Throughput Trend */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Delivery Throughput</h3>
          <p className="text-xs text-gray-400 mb-4">Epics completed per month</p>
          {throughputData ? (
            <div style={{ height: '220px' }}>
              <Bar data={throughputData} options={throughputOptions} />
            </div>
          ) : (
            <p className="text-center text-gray-400 text-sm py-8">No throughput data available</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        {/* Flow Efficiency Summary */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Flow Health Summary</h3>
          <div className="space-y-3">
            {/* Lead Time SLA */}
            <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <div>
                <p className="text-xs font-medium text-gray-700">Lead Time SLA (p85)</p>
                <p className="text-xs text-gray-400">85% of epics complete within this time</p>
              </div>
              <span className={`text-lg font-bold ${
                leadCycleTime.percentiles.p85 <= 60 ? 'text-green-600' :
                leadCycleTime.percentiles.p85 <= 120 ? 'text-amber-600' : 'text-red-600'
              }`}>
                {leadCycleTime.percentiles.p85}d
              </span>
            </div>

            {/* WIP:Throughput ratio (Little's Law) */}
            {forecast.avgThroughput > 0 && (
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div>
                  <p className="text-xs font-medium text-gray-700">WIP / Throughput Ratio</p>
                  <p className="text-xs text-gray-400">Expected lead time via Little's Law</p>
                </div>
                <span className="text-lg font-bold text-purple-600">
                  {Math.round(wipMetrics.totalWIP / forecast.avgThroughput * 30)}d
                </span>
              </div>
            )}

            {/* Predictability */}
            {leadCycleTime.percentiles.p50 > 0 && (
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div>
                  <p className="text-xs font-medium text-gray-700">Predictability</p>
                  <p className="text-xs text-gray-400">p85/p50 ratio (lower = more predictable)</p>
                </div>
                <span className={`text-lg font-bold ${
                  leadCycleTime.percentiles.p85 / leadCycleTime.percentiles.p50 <= 2 ? 'text-green-600' :
                  leadCycleTime.percentiles.p85 / leadCycleTime.percentiles.p50 <= 3 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {(leadCycleTime.percentiles.p85 / leadCycleTime.percentiles.p50).toFixed(1)}x
                </span>
              </div>
            )}

            {/* Total epics resolved */}
            <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <div>
                <p className="text-xs font-medium text-gray-700">Epics Resolved</p>
                <p className="text-xs text-gray-400">Total completed epics in dataset</p>
              </div>
              <span className="text-lg font-bold text-green-600">{leadCycleTime.totalResolved}</span>
            </div>
          </div>
        </div>
      </div>

      {/* WIP Management */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Epic WIP Management</h3>
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
            <h4 className="text-sm font-medium text-gray-700 mb-2">Epics in Progress by Assignee</h4>
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
            <h4 className="text-sm font-medium text-gray-700 mb-2">Oldest Epics in Progress</h4>
            {wipMetrics.wipAge.length > 0 ? (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {wipMetrics.wipAge.slice(0, 10).map(item => (
                  <div key={item.key} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50">
                    <span className="inline-flex items-center gap-1 w-24 shrink-0">
                      <IssueTypeIcon type="Epic" size={12} />
                      <JiraLink issueKey={item.key} jiraBaseUrl={jiraBaseUrl} className="text-xs font-medium text-purple-700" />
                    </span>
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
          <p><strong>Little's Law</strong>: Lead Time = WIP / Throughput. Reducing WIP is the fastest way to reduce lead time.</p>
          <p><strong>Monte Carlo</strong>: {forecast.simulations?.toLocaleString() || '10,000'} simulations using historical monthly throughput to forecast completion dates.</p>
          <p><strong>Predictability</strong>: p85/p50 ratio. Below 2x means predictable delivery; above 3x means high variability.</p>
        </div>
      </div>
    </div>
  );
}
