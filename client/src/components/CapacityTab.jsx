import { useMemo } from 'react';
import { Line, Bar } from 'react-chartjs-2';

const formatNumber = (num, decimals = 1) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Number(num).toFixed(decimals).replace(/\.0$/, '');
};

export default function CapacityTab({ capacityData }) {
  if (!capacityData) {
    return (
      <div className="card text-center py-12">
        <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-1">No Capacity Data Available</h3>
        <p className="text-gray-500">Click "Refresh from Jira" to load capacity and velocity metrics.</p>
      </div>
    );
  }

  const { sprintCapacity = [], workDistribution = [], summary = {} } = capacityData;

  // Velocity chart
  const velocityChartData = useMemo(() => {
    if (sprintCapacity.length === 0) return null;

    const labels = sprintCapacity.map(s => s.sprintName);

    return {
      labels,
      datasets: [
        {
          label: 'Committed (SP)',
          data: sprintCapacity.map(s => s.committedPoints),
          borderColor: 'rgba(156, 163, 175, 0.8)',
          backgroundColor: 'rgba(156, 163, 175, 0.2)',
          borderWidth: 2,
          borderDash: [4, 4],
          tension: 0.3,
          fill: false,
          pointRadius: 4
        },
        {
          label: 'Completed (SP)',
          data: sprintCapacity.map(s => s.completedPoints),
          borderColor: 'rgba(59, 130, 246, 1)',
          backgroundColor: 'rgba(59, 130, 246, 0.15)',
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: 'rgba(59, 130, 246, 1)'
        },
        {
          label: `Avg Velocity (${formatNumber(summary.avgVelocity)} SP)`,
          data: Array(labels.length).fill(summary.avgVelocity),
          borderColor: 'rgba(34, 197, 94, 0.6)',
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        }
      ]
    };
  }, [sprintCapacity, summary]);

  // Throughput chart
  const throughputChartData = useMemo(() => {
    if (sprintCapacity.length === 0) return null;

    const labels = sprintCapacity.map(s => s.sprintName);

    return {
      labels,
      datasets: [
        {
          label: 'Total Issues',
          data: sprintCapacity.map(s => s.totalIssues),
          borderColor: 'rgba(156, 163, 175, 0.8)',
          backgroundColor: 'rgba(156, 163, 175, 0.2)',
          borderWidth: 2,
          borderDash: [4, 4],
          tension: 0.3,
          fill: false,
          pointRadius: 4
        },
        {
          label: 'Completed Issues',
          data: sprintCapacity.map(s => s.completedIssues),
          borderColor: 'rgba(168, 85, 247, 1)',
          backgroundColor: 'rgba(168, 85, 247, 0.15)',
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: 'rgba(168, 85, 247, 1)'
        },
        {
          label: `Avg Throughput (${formatNumber(summary.avgThroughput)} issues)`,
          data: Array(labels.length).fill(summary.avgThroughput),
          borderColor: 'rgba(34, 197, 94, 0.6)',
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        }
      ]
    };
  }, [sprintCapacity, summary]);

  // Work distribution chart (horizontal bar)
  const workDistChartData = useMemo(() => {
    if (workDistribution.length === 0) return null;

    // Show top 10 contributors
    const top = workDistribution.slice(0, 10);

    return {
      labels: top.map(d => d.name.length > 20 ? d.name.substring(0, 18) + '...' : d.name),
      datasets: [
        {
          label: 'Committed SP',
          data: top.map(d => d.committed),
          backgroundColor: 'rgba(156, 163, 175, 0.5)',
          borderRadius: 4
        },
        {
          label: 'Completed SP',
          data: top.map(d => d.completed),
          backgroundColor: 'rgba(59, 130, 246, 0.7)',
          borderRadius: 4
        }
      ]
    };
  }, [workDistribution]);

  // Team size chart
  const teamSizeChartData = useMemo(() => {
    if (sprintCapacity.length === 0) return null;

    const labels = sprintCapacity.map(s => s.sprintName);

    return {
      labels,
      datasets: [
        {
          label: 'Team Size (contributors)',
          data: sprintCapacity.map(s => s.teamSize),
          borderColor: 'rgba(249, 115, 22, 1)',
          backgroundColor: 'rgba(249, 115, 22, 0.15)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: 'rgba(249, 115, 22, 1)'
        }
      ]
    };
  }, [sprintCapacity]);

  // Focus factor chart
  const focusChartData = useMemo(() => {
    if (sprintCapacity.length === 0) return null;

    const labels = sprintCapacity.map(s => s.sprintName);
    const focusFactors = sprintCapacity.map(s =>
      s.committedPoints > 0 ? (s.completedPoints / s.committedPoints) * 100 : 0
    );

    return {
      labels,
      datasets: [
        {
          label: 'Focus Factor (%)',
          data: focusFactors,
          borderColor: 'rgba(34, 197, 94, 1)',
          backgroundColor: 'rgba(34, 197, 94, 0.15)',
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: 'rgba(34, 197, 94, 1)'
        },
        {
          label: 'Target (100%)',
          data: Array(labels.length).fill(100),
          borderColor: 'rgba(156, 163, 175, 0.5)',
          borderDash: [5, 5],
          borderWidth: 1,
          pointRadius: 0,
          fill: false
        }
      ]
    };
  }, [sprintCapacity]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { usePointStyle: true, padding: 12, font: { size: 11 } } }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0, 0, 0, 0.06)' } },
      x: { grid: { color: 'rgba(0, 0, 0, 0.06)' }, ticks: { maxRotation: 45, font: { size: 10 } } }
    }
  };

  const horizontalBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { position: 'top', labels: { usePointStyle: true, padding: 12, font: { size: 11 } } }
    },
    scales: {
      x: { beginAtZero: true, grid: { color: 'rgba(0, 0, 0, 0.06)' } },
      y: { grid: { display: false }, ticks: { font: { size: 11 } } }
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <div className="text-xs text-blue-600 uppercase tracking-wide mb-1">Avg Velocity</div>
          <div className="text-2xl font-bold text-blue-700">{formatNumber(summary.avgVelocity)} SP</div>
          <div className="text-xs text-blue-500 mt-1">
            &plusmn;{formatNumber(summary.velocityStdDev)} std dev
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
          <div className="text-xs text-purple-600 uppercase tracking-wide mb-1">Avg Throughput</div>
          <div className="text-2xl font-bold text-purple-700">{formatNumber(summary.avgThroughput)}</div>
          <div className="text-xs text-purple-500 mt-1">
            issues/sprint &plusmn;{formatNumber(summary.throughputStdDev)}
          </div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200">
          <div className="text-xs text-orange-600 uppercase tracking-wide mb-1">Avg Team Size</div>
          <div className="text-2xl font-bold text-orange-700">{formatNumber(summary.avgTeamSize, 0)}</div>
          <div className="text-xs text-orange-500 mt-1">contributors/sprint</div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
          <div className="text-xs text-green-600 uppercase tracking-wide mb-1">Focus Factor</div>
          <div className="text-2xl font-bold text-green-700">{formatNumber(summary.avgFocusFactor)}%</div>
          <div className="text-xs text-green-500 mt-1">completed / committed</div>
        </div>
        <div className={`rounded-xl p-4 border ${
          summary.velocityTrend > 0
            ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'
            : summary.velocityTrend < 0
              ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
              : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'
        }`}>
          <div className={`text-xs uppercase tracking-wide mb-1 ${
            summary.velocityTrend > 0 ? 'text-green-600' : summary.velocityTrend < 0 ? 'text-red-600' : 'text-gray-600'
          }`}>Velocity Trend</div>
          <div className={`text-2xl font-bold ${
            summary.velocityTrend > 0 ? 'text-green-700' : summary.velocityTrend < 0 ? 'text-red-700' : 'text-gray-700'
          }`}>
            {summary.velocityTrend > 0 ? '+' : ''}{formatNumber(summary.velocityTrend)} SP
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {summary.sprintsAnalyzed} sprints analyzed
          </div>
        </div>
      </div>

      {/* Velocity Chart */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-2 text-gray-800">Velocity</h2>
        <p className="text-sm text-gray-500 mb-6">
          Story points committed vs completed per sprint. The green line shows average velocity.
        </p>
        {velocityChartData ? (
          <div className="h-80">
            <Line data={velocityChartData} options={chartOptions} />
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-400">No data available</div>
        )}
      </div>

      {/* Throughput + Focus Factor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-bold mb-2 text-gray-800">Throughput</h2>
          <p className="text-sm text-gray-500 mb-4">Issues completed per sprint</p>
          {throughputChartData ? (
            <div className="h-72">
              <Line data={throughputChartData} options={chartOptions} />
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">No data available</div>
          )}
        </div>

        <div className="card">
          <h2 className="text-xl font-bold mb-2 text-gray-800">Focus Factor</h2>
          <p className="text-sm text-gray-500 mb-4">% of committed work actually completed</p>
          {focusChartData ? (
            <div className="h-72">
              <Line data={focusChartData} options={{
                ...chartOptions,
                scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, max: Math.max(120, ...(sprintCapacity.map(s => s.committedPoints > 0 ? (s.completedPoints / s.committedPoints) * 100 : 0).map(v => Math.ceil(v / 10) * 10))) } }
              }} />
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">No data available</div>
          )}
        </div>
      </div>

      {/* Team Size */}
      <div className="card">
        <h2 className="text-xl font-bold mb-2 text-gray-800">Team Size</h2>
        <p className="text-sm text-gray-500 mb-4">Number of unique contributors (assignees) per sprint</p>
        {teamSizeChartData ? (
          <div className="h-64">
            <Line data={teamSizeChartData} options={{
              ...chartOptions,
              scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, ticks: { stepSize: 1 } } }
            }} />
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-400">No data available</div>
        )}
      </div>

      {/* Work Distribution */}
      <div className="card">
        <h2 className="text-xl font-bold mb-2 text-gray-800">Work Distribution</h2>
        <p className="text-sm text-gray-500 mb-4">
          Story points by team member across all analyzed sprints (top 10)
        </p>
        {workDistChartData ? (
          <div style={{ height: Math.max(250, workDistribution.slice(0, 10).length * 45) }}>
            <Bar data={workDistChartData} options={horizontalBarOptions} />
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-400">No data available</div>
        )}
      </div>

      {/* Detailed Sprint Capacity Table */}
      {sprintCapacity.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold mb-4 text-gray-800">Sprint Capacity Details</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Sprint</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Committed</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Completed</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Velocity</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Throughput</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Team</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Focus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sprintCapacity.map(sprint => {
                  const focus = sprint.committedPoints > 0
                    ? (sprint.completedPoints / sprint.committedPoints) * 100
                    : 0;
                  return (
                    <tr key={sprint.sprintId} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{sprint.sprintName}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{sprint.committedPoints} SP</td>
                      <td className="px-3 py-2 text-center font-semibold text-blue-600">{sprint.completedPoints} SP</td>
                      <td className="px-3 py-2 text-center font-semibold text-blue-700">{sprint.velocity}</td>
                      <td className="px-3 py-2 text-center text-purple-600">{sprint.throughput} issues</td>
                      <td className="px-3 py-2 text-center text-orange-600">{sprint.teamSize}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          focus >= 90 ? 'bg-green-100 text-green-700' :
                          focus >= 70 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {formatNumber(focus)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
