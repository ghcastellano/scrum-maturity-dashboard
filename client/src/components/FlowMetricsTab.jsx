import { useState, useMemo } from 'react';
import { Scatter } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(LinearScale, PointElement, Tooltip, Legend);

const formatNumber = (num, decimals = 1) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Number(num).toFixed(decimals).replace(/\.0$/, '');
};

export default function FlowMetricsTab({ flowMetrics }) {
  if (!flowMetrics) {
    return (
      <div className="card text-center py-12">
        <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-1">No Flow Metrics Available</h3>
        <p className="text-gray-500">Click "Refresh from Jira" to load cycle time and flow metrics.</p>
      </div>
    );
  }

  const summary = flowMetrics.summary || {};
  const scatterData = flowMetrics.scatterData || [];
  const percentiles = summary.percentiles || {};

  // Cycle Time Scatter Plot (like Actionable Agile Metrics for Predictability)
  const scatterChartData = useMemo(() => {
    if (scatterData.length === 0) return null;

    // Unique dates for x-axis mapping
    const uniqueDates = [...new Set(scatterData.map(d => d.completionDate))].sort();
    const dateToIndex = {};
    uniqueDates.forEach((date, i) => { dateToIndex[date] = i; });

    // Group by type with colors matching the book style
    const typeColors = {
      Story: { bg: 'rgba(59, 130, 246, 0.7)', border: 'rgba(59, 130, 246, 1)' },
      Bug: { bg: 'rgba(239, 68, 68, 0.7)', border: 'rgba(239, 68, 68, 1)' },
      Task: { bg: 'rgba(107, 114, 128, 0.7)', border: 'rgba(107, 114, 128, 1)' }
    };

    const typeGroups = {};
    scatterData.forEach(d => {
      if (!typeGroups[d.type]) typeGroups[d.type] = [];
      typeGroups[d.type].push({
        x: dateToIndex[d.completionDate],
        y: d.cycleTime,
        key: d.key,
        summary: d.summary,
        date: d.completionDate
      });
    });

    const datasets = Object.entries(typeGroups).map(([type, points]) => ({
      label: type,
      data: points,
      backgroundColor: typeColors[type]?.bg || 'rgba(107, 114, 128, 0.7)',
      borderColor: typeColors[type]?.border || 'rgba(107, 114, 128, 1)',
      borderWidth: 1,
      pointRadius: 6,
      pointHoverRadius: 9
    }));

    // Add percentile lines as horizontal datasets
    const pLines = [
      { label: '95th %ile', value: percentiles.p95, color: 'rgba(239, 68, 68, 0.6)', dash: [2, 2] },
      { label: '85th %ile', value: percentiles.p85, color: 'rgba(251, 146, 60, 0.6)', dash: [4, 4] },
      { label: '70th %ile', value: percentiles.p70, color: 'rgba(250, 204, 21, 0.6)', dash: [6, 4] },
      { label: '50th %ile', value: percentiles.p50, color: 'rgba(34, 197, 94, 0.6)', dash: [8, 4] }
    ];

    pLines.forEach(p => {
      if (p.value > 0) {
        datasets.push({
          label: `${p.label} (${formatNumber(p.value)}d)`,
          data: [
            { x: 0, y: p.value },
            { x: uniqueDates.length - 1, y: p.value }
          ],
          borderColor: p.color,
          borderWidth: 2,
          borderDash: p.dash,
          pointRadius: 0,
          pointHoverRadius: 0,
          showLine: true,
          fill: false,
          type: 'line'
        });
      }
    });

    return { datasets, uniqueDates };
  }, [scatterData, percentiles]);

  const scatterOptions = useMemo(() => {
    if (!scatterChartData) return {};
    const { uniqueDates } = scatterChartData;

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'point',
        intersect: true
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 12,
            font: { size: 11 },
            filter: (item) => !item.text.includes('%ile')
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const raw = ctx.raw;
              if (raw.key) {
                return [`${raw.key}: ${raw.y} days`, raw.summary?.substring(0, 60)];
              }
              return ctx.dataset.label;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: 'Completion Date',
            font: { size: 12, weight: 'bold' }
          },
          ticks: {
            callback: (value) => {
              const idx = Math.round(value);
              if (idx >= 0 && idx < uniqueDates.length) {
                const d = uniqueDates[idx];
                return d.substring(5); // Show MM-DD
              }
              return '';
            },
            maxRotation: 45,
            font: { size: 10 }
          },
          grid: { color: 'rgba(0, 0, 0, 0.06)' }
        },
        y: {
          title: {
            display: true,
            text: 'Cycle Time (days)',
            font: { size: 12, weight: 'bold' }
          },
          beginAtZero: true,
          grid: { color: 'rgba(0, 0, 0, 0.06)' }
        }
      }
    };
  }, [scatterChartData]);

  return (
    <div className="space-y-6">
      {/* Cycle Time by Type */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">
          Average Cycle Time
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(summary.avgCycleTime || {}).map(([type, time]) => {
            const colors = {
              Story: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800' },
              Bug: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-800' },
              Task: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', badge: 'bg-gray-100 text-gray-800' }
            };
            const c = colors[type] || colors.Task;
            return (
              <div key={type} className={`${c.bg} ${c.border} border rounded-xl p-5`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${c.badge}`}>{type}</span>
                </div>
                <div className={`text-3xl font-bold ${c.text}`}>
                  {time > 0 ? formatNumber(time) : 'N/A'}
                </div>
                <div className="text-xs text-gray-500 mt-1">days average</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Percentile Summary */}
      {percentiles.p50 > 0 && (
        <div className="card">
          <h2 className="text-2xl font-bold mb-2 text-gray-800">
            Cycle Time Percentiles
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Based on {summary.totalItems || 0} completed items - SLE (Service Level Expectation)
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: '50th', value: percentiles.p50, color: 'text-green-600', bg: 'bg-green-50 border-green-200', desc: 'Half of items' },
              { label: '70th', value: percentiles.p70, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', desc: 'Most items' },
              { label: '85th', value: percentiles.p85, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', desc: 'SLE target' },
              { label: '95th', value: percentiles.p95, color: 'text-red-600', bg: 'bg-red-50 border-red-200', desc: 'Nearly all' }
            ].map(p => (
              <div key={p.label} className={`${p.bg} border rounded-xl p-4 text-center`}>
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{p.label} percentile</div>
                <div className={`text-2xl font-bold ${p.color}`}>{formatNumber(p.value)} days</div>
                <div className="text-xs text-gray-400 mt-1">{p.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cycle Time Scatter Plot */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-2 text-gray-800">
          Cycle Time Distribution
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Each dot represents a completed work item. Dashed lines show percentile thresholds.
          Based on "Actionable Agile Metrics for Predictability" by Daniel Vacanti.
        </p>
        {scatterChartData && scatterChartData.datasets.length > 0 ? (
          <div className="h-96">
            <Scatter data={scatterChartData} options={scatterOptions} />
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-400">
            No scatter data available. Click "Refresh from Jira" to load flow metrics.
          </div>
        )}

        {/* Percentile Legend */}
        {percentiles.p50 > 0 && (
          <div className="flex flex-wrap justify-center gap-4 mt-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-6 h-0 border-t-2 border-dashed border-green-500"></span>
              50th %ile ({formatNumber(percentiles.p50)}d)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-6 h-0 border-t-2 border-dashed border-yellow-500"></span>
              70th %ile ({formatNumber(percentiles.p70)}d)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-6 h-0 border-t-2 border-dashed border-orange-500"></span>
              85th %ile ({formatNumber(percentiles.p85)}d)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-6 h-0 border-t-2 border-dashed border-red-500"></span>
              95th %ile ({formatNumber(percentiles.p95)}d)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
