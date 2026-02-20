import { useState, useMemo } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

const formatNumber = (num, decimals = 1) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Number(num).toFixed(decimals).replace(/\.0$/, '');
};

export default function TeamSummaryTab({ metrics, capacityData, flowMetrics, credentials }) {
  const hasCapacity = !!capacityData;
  const hasMetrics = !!metrics;

  if (!hasMetrics && !hasCapacity) {
    return (
      <div className="card text-center py-12">
        <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-1">No Team Summary Data Available</h3>
        <p className="text-gray-500">Click "Refresh from Jira" to load team metrics.</p>
      </div>
    );
  }

  const { sprintCapacity = [], workDistribution = [], summary: capSummary = {} } = capacityData || {};
  const { sprintMetrics = [], aggregated = {} } = metrics || {};
  const jiraBaseUrl = credentials?.jiraUrl?.replace(/\/$/, '') || '';

  // Sprint selector for burndown
  const [selectedSprintIdx, setSelectedSprintIdx] = useState(() => sprintCapacity.length - 1);
  const selectedSprint = sprintCapacity[selectedSprintIdx] || null;

  // ── KPI Calculations ──
  const avgPointsPerDev = capSummary.avgTeamSize > 0
    ? (capSummary.avgVelocity || 0) / capSummary.avgTeamSize
    : 0;

  // ── Sprint Burndown Chart ──
  const burndownData = useMemo(() => {
    if (!selectedSprint || !selectedSprint.issues || selectedSprint.issues.length === 0) return null;

    const start = new Date(selectedSprint.startDate);
    const end = new Date(selectedSprint.endDate);
    if (isNaN(start) || isNaN(end)) return null;

    // Ensure end date includes the full day (timezone-safe)
    const endFullDay = new Date(end);
    endFullDay.setHours(23, 59, 59, 999);

    // Generate working days (Mon-Fri) between start and end
    const days = [];
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(23, 59, 59, 999);
    while (current <= endDay) {
      const dow = current.getDay();
      if (dow !== 0 && dow !== 6) {
        days.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }
    if (days.length === 0) return null;

    const totalCommitted = selectedSprint.committedPoints || 0;
    const issues = selectedSprint.issues || [];
    const lastDayEnd = new Date(days[days.length - 1]);
    lastDayEnd.setHours(23, 59, 59, 999);

    // Determine effective completion date for each issue
    // Issues may be completedInSprint but lack resolutionDate (common in Jira)
    const issueCompletionDates = issues.map(issue => {
      let completionDate = null;

      if (issue.completedInSprint && issue.resolutionDate) {
        completionDate = new Date(issue.resolutionDate);
      } else if (issue.completedInSprint && !issue.resolutionDate) {
        // Completed per Sprint Report API but no resolution date — place at sprint end
        completionDate = lastDayEnd;
      } else if (issue.statusCategory === 'done' && issue.resolutionDate) {
        completionDate = new Date(issue.resolutionDate);
      } else if (issue.statusCategory === 'done' && !issue.resolutionDate) {
        // Done status but no resolution date — place at sprint end
        completionDate = lastDayEnd;
      }

      return { issue, completionDate };
    });

    // For each day, calculate remaining points
    const actualData = days.map(day => {
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);

      let completedByDay = 0;
      issueCompletionDates.forEach(({ issue, completionDate }) => {
        if (completionDate && completionDate <= dayEnd) {
          completedByDay += (issue.points || 0);
        }
      });
      return totalCommitted - completedByDay;
    });

    // Ideal burndown: straight line from totalCommitted to 0
    const idealData = days.map((_, i) => {
      return totalCommitted * (1 - (i / (days.length - 1)));
    });

    // Remaining issues per day (for tooltip)
    const remainingIssuesPerDay = days.map(day => {
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);

      return issueCompletionDates
        .filter(({ completionDate }) => {
          if (!completionDate) return true; // never completed
          return completionDate > dayEnd;   // completed after this day
        })
        .map(({ issue }) => issue);
    });

    const labels = days.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

    return {
      labels,
      actualData,
      idealData,
      remainingIssuesPerDay,
      totalCommitted
    };
  }, [selectedSprint]);

  const burndownChartData = useMemo(() => {
    if (!burndownData) return null;
    return {
      labels: burndownData.labels,
      datasets: [
        {
          label: 'Ideal Burndown',
          data: burndownData.idealData,
          borderColor: 'rgba(156, 163, 175, 0.6)',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          tension: 0
        },
        {
          label: 'Actual Remaining',
          data: burndownData.actualData,
          borderColor: 'rgba(59, 130, 246, 1)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: 'rgba(59, 130, 246, 1)',
          pointHoverRadius: 7,
          fill: true,
          tension: 0.2
        }
      ]
    };
  }, [burndownData]);

  const burndownOptions = useMemo(() => {
    if (!burndownData) return {};
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, padding: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const idx = items[0]?.dataIndex;
              if (idx === undefined || !burndownData.remainingIssuesPerDay[idx]) return [];
              const remaining = burndownData.remainingIssuesPerDay[idx];
              const withPoints = remaining.filter(i => i.points > 0);
              if (withPoints.length === 0) return ['All items completed!'];

              const lines = [
                '',
                `Remaining: ${withPoints.length} items (${withPoints.reduce((s, i) => s + (i.points || 0), 0)} SP)`,
                '───────────────────'
              ];
              withPoints.slice(0, 8).forEach(issue => {
                const summary = issue.summary?.length > 35
                  ? issue.summary.substring(0, 33) + '...'
                  : issue.summary;
                lines.push(`${issue.key} (${issue.points || 0} SP) - ${summary}`);
              });
              if (withPoints.length > 8) {
                lines.push(`... and ${withPoints.length - 8} more`);
              }
              return lines;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Story Points', font: { size: 12, weight: 'bold' } },
          grid: { color: 'rgba(0, 0, 0, 0.06)' }
        },
        x: {
          grid: { color: 'rgba(0, 0, 0, 0.06)' },
          ticks: { maxRotation: 45, font: { size: 10 } }
        }
      }
    };
  }, [burndownData]);

  // ── Committed vs Completed Bar Chart ──
  const comparisonChartData = useMemo(() => {
    if (sprintCapacity.length === 0) return null;
    return {
      labels: sprintCapacity.map(s => s.sprintName),
      datasets: [
        {
          label: 'Committed (SP)',
          data: sprintCapacity.map(s => s.committedPoints),
          backgroundColor: 'rgba(156, 163, 175, 0.5)',
          borderRadius: 4
        },
        {
          label: 'Completed (SP)',
          data: sprintCapacity.map(s => s.completedPoints),
          backgroundColor: 'rgba(59, 130, 246, 0.7)',
          borderRadius: 4
        }
      ]
    };
  }, [sprintCapacity]);

  const barChartOptions = {
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

  // ── Issue Type Breakdown (Doughnut) ──
  const issueTypeData = useMemo(() => {
    if (workDistribution.length === 0) return null;
    const typeCounts = {};
    workDistribution.forEach(d => {
      if (d.types) {
        Object.entries(d.types).forEach(([type, count]) => {
          typeCounts[type] = (typeCounts[type] || 0) + count;
        });
      }
    });
    const labels = Object.keys(typeCounts);
    if (labels.length === 0) return null;

    const colors = {
      Story: 'rgba(59, 130, 246, 0.8)',
      Bug: 'rgba(239, 68, 68, 0.8)',
      Task: 'rgba(107, 114, 128, 0.8)',
      Epic: 'rgba(168, 85, 247, 0.8)',
      'Sub-task': 'rgba(249, 115, 22, 0.8)'
    };

    return {
      labels,
      datasets: [{
        data: labels.map(l => typeCounts[l]),
        backgroundColor: labels.map(l => colors[l] || 'rgba(156, 163, 175, 0.7)'),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    };
  }, [workDistribution]);

  // ── Top Contributors ──
  const topContributors = useMemo(() => {
    return workDistribution
      .filter(d => d.completed > 0)
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 5);
  }, [workDistribution]);

  // ── Rollover label colors ──
  const rolloverLabelColors = {
    'external-blockers': 'bg-red-100 text-red-700',
    'late-discovery': 'bg-amber-100 text-amber-700',
    'resource-constraints': 'bg-orange-100 text-orange-700',
    'internal-blockers': 'bg-rose-100 text-rose-700',
    'req-gap': 'bg-purple-100 text-purple-700',
    'dev-qa-spill': 'bg-blue-100 text-blue-700'
  };

  return (
    <div className="space-y-6">
      {/* ── Section 1: KPI Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <div className="text-xs text-blue-600 uppercase tracking-wide mb-1">Avg Velocity</div>
          <div className="text-2xl font-bold text-blue-700">{formatNumber(capSummary.avgVelocity)} SP</div>
          <div className="text-xs text-blue-500 mt-1">per sprint</div>
        </div>
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-4 border border-indigo-200">
          <div className="text-xs text-indigo-600 uppercase tracking-wide mb-1">SP / Developer</div>
          <div className="text-2xl font-bold text-indigo-700">{formatNumber(avgPointsPerDev)}</div>
          <div className="text-xs text-indigo-500 mt-1">avg per sprint</div>
        </div>
        <div className={`rounded-xl p-4 border ${
          (aggregated.avgSprintGoalAttainment || 0) >= 70
            ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'
            : (aggregated.avgSprintGoalAttainment || 0) >= 50
              ? 'bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200'
              : 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
        }`}>
          <div className={`text-xs uppercase tracking-wide mb-1 ${
            (aggregated.avgSprintGoalAttainment || 0) >= 70 ? 'text-green-600' :
            (aggregated.avgSprintGoalAttainment || 0) >= 50 ? 'text-yellow-600' : 'text-red-600'
          }`}>Completion Rate</div>
          <div className={`text-2xl font-bold ${
            (aggregated.avgSprintGoalAttainment || 0) >= 70 ? 'text-green-700' :
            (aggregated.avgSprintGoalAttainment || 0) >= 50 ? 'text-yellow-700' : 'text-red-700'
          }`}>{formatNumber(aggregated.avgSprintGoalAttainment)}%</div>
          <div className="text-xs text-gray-500 mt-1">commitment met</div>
        </div>
        <div className={`rounded-xl p-4 border ${
          (aggregated.avgSprintHitRate || 0) >= 80
            ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'
            : (aggregated.avgSprintHitRate || 0) >= 60
              ? 'bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200'
              : 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
        }`}>
          <div className={`text-xs uppercase tracking-wide mb-1 ${
            (aggregated.avgSprintHitRate || 0) >= 80 ? 'text-green-600' :
            (aggregated.avgSprintHitRate || 0) >= 60 ? 'text-yellow-600' : 'text-red-600'
          }`}>Hit Rate</div>
          <div className={`text-2xl font-bold ${
            (aggregated.avgSprintHitRate || 0) >= 80 ? 'text-green-700' :
            (aggregated.avgSprintHitRate || 0) >= 60 ? 'text-yellow-700' : 'text-red-700'
          }`}>{formatNumber(aggregated.avgSprintHitRate)}%</div>
          <div className="text-xs text-gray-500 mt-1">issues completed</div>
        </div>
        <div className={`rounded-xl p-4 border ${
          (capSummary.velocityTrend || 0) > 0
            ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'
            : (capSummary.velocityTrend || 0) < 0
              ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
              : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'
        }`}>
          <div className={`text-xs uppercase tracking-wide mb-1 ${
            (capSummary.velocityTrend || 0) > 0 ? 'text-green-600' :
            (capSummary.velocityTrend || 0) < 0 ? 'text-red-600' : 'text-gray-600'
          }`}>Velocity Trend</div>
          <div className={`text-2xl font-bold ${
            (capSummary.velocityTrend || 0) > 0 ? 'text-green-700' :
            (capSummary.velocityTrend || 0) < 0 ? 'text-red-700' : 'text-gray-700'
          }`}>
            {(capSummary.velocityTrend || 0) > 0 ? '+' : ''}{formatNumber(capSummary.velocityTrend)} SP
          </div>
          <div className="text-xs text-gray-500 mt-1">recent trend</div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200">
          <div className="text-xs text-orange-600 uppercase tracking-wide mb-1">Avg Team Size</div>
          <div className="text-2xl font-bold text-orange-700">{formatNumber(capSummary.avgTeamSize, 0)}</div>
          <div className="text-xs text-orange-500 mt-1">contributors/sprint</div>
        </div>
      </div>

      {/* ── Section 2: Sprint Burndown ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold text-gray-800">Sprint Burndown</h2>
          {selectedSprint && (
            <div className="text-sm text-gray-500">
              {selectedSprint.committedPoints} SP committed &middot; {selectedSprint.completedPoints} SP completed
            </div>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Daily remaining story points for the selected sprint. Hover to see which items remain.
        </p>

        {/* Sprint selector buttons */}
        {sprintCapacity.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {sprintCapacity.map((sprint, idx) => (
              <button
                key={sprint.sprintId}
                onClick={() => setSelectedSprintIdx(idx)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  idx === selectedSprintIdx
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {sprint.sprintName}
              </button>
            ))}
          </div>
        )}

        {/* Burndown Chart */}
        {burndownChartData ? (
          <div className="h-80">
            <Line data={burndownChartData} options={burndownOptions} />
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-400">
            {sprintCapacity.length === 0
              ? 'No sprint data available. Click "Refresh from Jira" to load.'
              : 'No issue data available for this sprint to generate a burndown chart.'}
          </div>
        )}
      </div>

      {/* ── Section 3: Sprint Health Overview ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Committed vs Completed */}
        <div className="card">
          <h2 className="text-xl font-bold mb-2 text-gray-800">Committed vs Completed</h2>
          <p className="text-sm text-gray-500 mb-4">Story points per sprint</p>
          {comparisonChartData ? (
            <div className="h-72">
              <Bar data={comparisonChartData} options={barChartOptions} />
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">No data available</div>
          )}
        </div>

        {/* Scope Changes & Rollover Summary */}
        <div className="card">
          <h2 className="text-xl font-bold mb-2 text-gray-800">Sprint Health Indicators</h2>
          <p className="text-sm text-gray-500 mb-4">Scope changes and rollover across sprints</p>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {sprintMetrics.map(sprint => {
              const midSprintPct = sprint.midSprintAdditions?.percentage || 0;
              const rolloverPct = sprint.rolloverRate || 0;
              const rolloverCount = sprint.rolloverIssues?.length || 0;
              return (
                <div key={sprint.sprintId} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="text-sm font-semibold text-gray-800 mb-2">{sprint.sprintName}</div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-gray-500">Mid-Sprint Additions:</span>
                      <span className={`ml-1 font-semibold ${
                        midSprintPct > 25 ? 'text-red-600' : midSprintPct > 10 ? 'text-amber-600' : 'text-green-600'
                      }`}>{formatNumber(midSprintPct)}%</span>
                      <span className="text-gray-400 ml-1">({sprint.midSprintAdditions?.count || 0} items)</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Rollover:</span>
                      <span className={`ml-1 font-semibold ${
                        rolloverPct > 25 ? 'text-red-600' : rolloverPct > 15 ? 'text-amber-600' : 'text-green-600'
                      }`}>{formatNumber(rolloverPct)}%</span>
                      <span className="text-gray-400 ml-1">({rolloverCount} items)</span>
                    </div>
                  </div>
                  {/* Rollover issue badges */}
                  {sprint.rolloverIssues && sprint.rolloverIssues.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {sprint.rolloverIssues.slice(0, 5).map(issue => (
                        <span key={issue.key} className="inline-flex items-center gap-1 text-xs">
                          {jiraBaseUrl ? (
                            <a href={`${jiraBaseUrl}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer"
                              className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded hover:underline font-mono text-[10px]">
                              {issue.key}
                            </a>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded font-mono text-[10px]">{issue.key}</span>
                          )}
                          {issue.reasons?.map(r => (
                            <span key={r} className={`px-1 py-0.5 rounded text-[10px] ${rolloverLabelColors[r] || 'bg-gray-100 text-gray-600'}`}>
                              {r}
                            </span>
                          ))}
                        </span>
                      ))}
                      {sprint.rolloverIssues.length > 5 && (
                        <span className="text-[10px] text-gray-400">+{sprint.rolloverIssues.length - 5} more</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {sprintMetrics.length === 0 && (
              <div className="text-center text-gray-400 py-6">No sprint metrics available</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 4: Team Insights ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Contributors */}
        <div className="card">
          <h2 className="text-xl font-bold mb-2 text-gray-800">Top Contributors</h2>
          <p className="text-sm text-gray-500 mb-4">By completed story points across analyzed sprints</p>
          {topContributors.length > 0 ? (
            <div className="space-y-3">
              {topContributors.map((dev, idx) => {
                const maxCompleted = topContributors[0]?.completed || 1;
                const pct = (dev.completed / maxCompleted) * 100;
                const medal = idx === 0 ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                  : idx === 1 ? 'bg-gray-100 text-gray-700 border-gray-300'
                  : idx === 2 ? 'bg-orange-100 text-orange-800 border-orange-300'
                  : 'bg-white text-gray-600 border-gray-200';
                return (
                  <div key={dev.name} className="flex items-center gap-3">
                    <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold border ${medal}`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-800 truncate">{dev.name}</span>
                        <span className="text-sm font-bold text-blue-600 ml-2">{dev.completed} SP</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-blue-500 rounded-full h-2 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                        <span>{dev.issuesCompleted} issues completed</span>
                        <span>{dev.committed} SP committed</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400">No contributor data</div>
          )}
        </div>

        {/* Issue Type Breakdown */}
        <div className="card">
          <h2 className="text-xl font-bold mb-2 text-gray-800">Work Type Breakdown</h2>
          <p className="text-sm text-gray-500 mb-4">Distribution of issue types across all analyzed sprints</p>
          {issueTypeData ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-64 h-64">
                <Doughnut
                  data={issueTypeData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'right', labels: { usePointStyle: true, padding: 12, font: { size: 11 } } },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                            return `${ctx.label}: ${ctx.raw} issues (${pct}%)`;
                          }
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">No data available</div>
          )}
        </div>
      </div>

      {/* ── Section 5: Sprint Comparison Table ── */}
      {sprintCapacity.length > 0 && sprintMetrics.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold mb-2 text-gray-800">Sprint-over-Sprint Comparison</h2>
          <p className="text-sm text-gray-500 mb-4">Key metrics side by side for retrospective analysis</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Sprint</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Committed</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Completed</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Completion %</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Hit Rate</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Team</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Rollover</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Scope Churn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sprintCapacity.map((sprint, idx) => {
                  const metricsSprint = sprintMetrics.find(m => m.sprintId === sprint.sprintId) || {};
                  const completionPct = sprint.committedPoints > 0
                    ? (sprint.completedPoints / sprint.committedPoints) * 100 : 0;
                  const hitRate = metricsSprint.sprintHitRate || 0;
                  const rollover = metricsSprint.rolloverRate || 0;
                  const scopeChurn = metricsSprint.midSprintAdditions?.percentage || 0;

                  return (
                    <tr key={sprint.sprintId} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{sprint.sprintName}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{sprint.committedPoints} SP</td>
                      <td className="px-3 py-2 text-center font-semibold text-blue-600">{sprint.completedPoints} SP</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          completionPct >= 80 ? 'bg-green-100 text-green-700' :
                          completionPct >= 60 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>{formatNumber(completionPct)}%</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          hitRate >= 80 ? 'bg-green-100 text-green-700' :
                          hitRate >= 60 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>{formatNumber(hitRate)}%</span>
                      </td>
                      <td className="px-3 py-2 text-center text-orange-600">{sprint.teamSize}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          rollover > 25 ? 'bg-red-100 text-red-700' :
                          rollover > 15 ? 'bg-amber-100 text-amber-700' :
                          'bg-green-100 text-green-700'
                        }`}>{formatNumber(rollover)}%</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          scopeChurn > 25 ? 'bg-red-100 text-red-700' :
                          scopeChurn > 10 ? 'bg-amber-100 text-amber-700' :
                          'bg-green-100 text-green-700'
                        }`}>{formatNumber(scopeChurn)}%</span>
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
