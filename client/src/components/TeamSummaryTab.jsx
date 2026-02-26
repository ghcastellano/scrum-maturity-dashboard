import { useState, useMemo, useCallback, Fragment } from 'react';
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

  const { sprintCapacity: rawCapacity = [], workDistribution = [], summary: capSummary = {} } = capacityData || {};
  const { sprintMetrics: rawSprintMetrics = [], aggregated = {} } = metrics || {};

  // Sort chronologically (oldest first) regardless of backend/cache order
  const sprintCapacity = useMemo(() =>
    [...rawCapacity].sort((a, b) => {
      if (a.startDate && b.startDate) return new Date(a.startDate) - new Date(b.startDate);
      return 0;
    }), [rawCapacity]);
  const sprintMetrics = useMemo(() =>
    [...rawSprintMetrics].sort((a, b) => {
      if (a.startDate && b.startDate) return new Date(a.startDate) - new Date(b.startDate);
      return 0;
    }), [rawSprintMetrics]);
  const jiraBaseUrl = credentials?.jiraUrl?.replace(/\/$/, '') || '';

  // Sprint selector: null = "All Sprints" (aggregated), number = specific sprint index
  const [selectedSprintIdx, setSelectedSprintIdx] = useState(null);

  // When "All Sprints", burndown defaults to active/last sprint
  const defaultBurndownIdx = useMemo(() => {
    const activeIdx = sprintCapacity.findIndex(s => s.isActive);
    return activeIdx >= 0 ? activeIdx : sprintCapacity.length - 1;
  }, [sprintCapacity]);

  const burndownSprintIdx = selectedSprintIdx !== null ? selectedSprintIdx : defaultBurndownIdx;
  const selectedSprint = sprintCapacity[burndownSprintIdx] || null;

  // Expandable sprint rows in comparison table
  const [expandedCompSprints, setExpandedCompSprints] = useState(new Set());
  const toggleCompSprint = useCallback((sprintId) => {
    setExpandedCompSprints(prev => {
      const next = new Set(prev);
      if (next.has(sprintId)) next.delete(sprintId); else next.add(sprintId);
      return next;
    });
  }, []);

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

    const isActive = !!selectedSprint.isActive;
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    // Ensure end date includes the full day (timezone-safe)
    const endFullDay = new Date(end);
    endFullDay.setHours(23, 59, 59, 999);

    // Generate working days (Mon-Fri) between start and end
    // For active sprints, generate all days until sprint end (for ideal line)
    // but only show actual data up to today
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

    // For active sprints: find the index of today (or last past day) for truncation
    const todayIdx = isActive
      ? days.findIndex(d => d > today)
      : -1;
    const actualCutoff = isActive && todayIdx >= 0 ? todayIdx : days.length;

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
    // For active sprints, only show actual data up to today (null for future)
    const actualData = days.map((day, i) => {
      if (isActive && i >= actualCutoff) return null; // future day in active sprint
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

    // Ideal burndown: straight line from totalCommitted to 0 (always show full)
    const idealData = days.map((_, i) => {
      return totalCommitted * (1 - (i / (days.length - 1)));
    });

    // Remaining issues per day (for tooltip)
    const remainingIssuesPerDay = days.map((day, i) => {
      if (isActive && i >= actualCutoff) return [];
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);

      return issueCompletionDates
        .filter(({ completionDate }) => {
          if (!completionDate) return true; // never completed
          return completionDate > dayEnd;   // completed after this day
        })
        .map(({ issue }) => issue);
    });

    const labels = days.map((d, i) => {
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (isActive && i === actualCutoff - 1) return `${label} (today)`;
      return label;
    });

    return {
      labels,
      actualData,
      isActive,
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
          borderColor: burndownData.isActive ? 'rgba(34, 197, 94, 1)' : 'rgba(59, 130, 246, 1)',
          backgroundColor: burndownData.isActive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)',
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: burndownData.isActive ? 'rgba(34, 197, 94, 1)' : 'rgba(59, 130, 246, 1)',
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
    const sprints = selectedSprintIdx !== null
      ? [sprintCapacity[selectedSprintIdx]].filter(Boolean)
      : sprintCapacity;
    if (sprints.length === 0) return null;
    return {
      labels: sprints.map(s => s.sprintName),
      datasets: [
        {
          label: 'Committed (SP)',
          data: sprints.map(s => s.committedPoints),
          backgroundColor: 'rgba(156, 163, 175, 0.5)',
          borderRadius: 4
        },
        {
          label: 'Completed (SP)',
          data: sprints.map(s => s.completedPoints),
          backgroundColor: 'rgba(59, 130, 246, 0.7)',
          borderRadius: 4
        }
      ]
    };
  }, [sprintCapacity, selectedSprintIdx]);

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
  const issueTypeColors = {
    Story: 'rgba(59, 130, 246, 0.8)',
    Bug: 'rgba(239, 68, 68, 0.8)',
    Task: 'rgba(107, 114, 128, 0.8)',
    Epic: 'rgba(168, 85, 247, 0.8)',
    'Sub-task': 'rgba(249, 115, 22, 0.8)',
    Improvement: 'rgba(16, 185, 129, 0.8)',
    Request: 'rgba(156, 163, 175, 0.7)'
  };

  const issueTypeData = useMemo(() => {
    const typeCounts = {};

    if (selectedSprintIdx !== null) {
      // Per-sprint: compute from issues array
      const sprint = sprintCapacity[selectedSprintIdx];
      const issues = sprint?.issues || [];
      if (issues.length === 0) return null;
      issues.forEach(issue => {
        const type = issue.issueType || 'Unknown';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });
    } else {
      // Aggregated: from workDistribution
      if (workDistribution.length === 0) return null;
      workDistribution.forEach(d => {
        if (d.types) {
          Object.entries(d.types).forEach(([type, count]) => {
            typeCounts[type] = (typeCounts[type] || 0) + count;
          });
        }
      });
    }

    const labels = Object.keys(typeCounts);
    if (labels.length === 0) return null;

    return {
      labels,
      datasets: [{
        data: labels.map(l => typeCounts[l]),
        backgroundColor: labels.map(l => issueTypeColors[l] || 'rgba(156, 163, 175, 0.7)'),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    };
  }, [workDistribution, sprintCapacity, selectedSprintIdx]);

  // ── Top Contributors ──
  const topContributors = useMemo(() => {
    if (selectedSprintIdx !== null) {
      // Per-sprint: compute from issues array
      const sprint = sprintCapacity[selectedSprintIdx];
      const issues = sprint?.issues || [];
      const byAssignee = {};
      issues.forEach(issue => {
        const name = issue.assignee || 'Unassigned';
        if (!byAssignee[name]) {
          byAssignee[name] = { name, committed: 0, completed: 0, issuesAssigned: 0, issuesCompleted: 0 };
        }
        byAssignee[name].committed += (issue.points || 0);
        byAssignee[name].issuesAssigned += 1;
        if (issue.completedInSprint || issue.statusCategory === 'done') {
          byAssignee[name].completed += (issue.points || 0);
          byAssignee[name].issuesCompleted += 1;
        }
      });
      return Object.values(byAssignee)
        .filter(d => d.completed > 0)
        .sort((a, b) => b.completed - a.completed)
        .slice(0, 5);
    }
    // Aggregated: from workDistribution
    return workDistribution
      .filter(d => d.completed > 0)
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 5);
  }, [workDistribution, sprintCapacity, selectedSprintIdx]);

  // Filtered sprint metrics for health indicators
  const filteredSprintMetrics = useMemo(() => {
    if (selectedSprintIdx !== null) {
      return sprintMetrics.filter(m => m.sprintId === sprintCapacity[selectedSprintIdx]?.sprintId);
    }
    return sprintMetrics;
  }, [sprintMetrics, sprintCapacity, selectedSprintIdx]);

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
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-800">Sprint Burndown</h2>
            {selectedSprint?.isActive && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full border border-green-300">
                In Progress
              </span>
            )}
          </div>
          {selectedSprint && (
            <div className="text-sm text-gray-500">
              {selectedSprint.committedPoints} SP committed &middot; {selectedSprint.completedPoints} SP completed
              {selectedSprint.isActive && ` &middot; ${selectedSprint.totalIssues - selectedSprint.completedIssues} remaining`}
            </div>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Daily remaining story points for the selected sprint. Hover to see which items remain.
        </p>

        {/* Sprint selector buttons */}
        {sprintCapacity.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            <button
              onClick={() => setSelectedSprintIdx(null)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                selectedSprintIdx === null
                  ? 'bg-gray-800 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All Sprints
            </button>
            {sprintCapacity.map((sprint, idx) => (
              <button
                key={sprint.sprintId}
                onClick={() => setSelectedSprintIdx(idx)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  idx === selectedSprintIdx
                    ? sprint.isActive
                      ? 'bg-green-600 text-white shadow-sm'
                      : 'bg-primary-600 text-white shadow-sm'
                    : sprint.isActive
                      ? 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {sprint.sprintName}
                {sprint.isActive && (
                  <span className="ml-1.5 text-[10px] font-bold uppercase">Active</span>
                )}
              </button>
            ))}
          </div>
        )}
        {selectedSprintIdx !== null && (
          <div className="mb-4">
            <span className="text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
              Filtering all charts to: {sprintCapacity[selectedSprintIdx]?.sprintName}
            </span>
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
          <p className="text-sm text-gray-500 mb-4">
            {selectedSprintIdx !== null
              ? `Story points for ${sprintCapacity[selectedSprintIdx]?.sprintName}`
              : 'Story points per sprint'}
          </p>
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
          <p className="text-sm text-gray-500 mb-4">
            {selectedSprintIdx !== null
              ? `Scope changes and rollover for ${sprintCapacity[selectedSprintIdx]?.sprintName}`
              : 'Scope changes and rollover across sprints'}
          </p>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {filteredSprintMetrics.map(sprint => {
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
            {filteredSprintMetrics.length === 0 && (
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
          <p className="text-sm text-gray-500 mb-4">
            {selectedSprintIdx !== null
              ? `By completed story points in ${sprintCapacity[selectedSprintIdx]?.sprintName}`
              : 'By completed story points across analyzed sprints'}
          </p>
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
          <p className="text-sm text-gray-500 mb-4">
            {selectedSprintIdx !== null
              ? `Distribution of issue types in ${sprintCapacity[selectedSprintIdx]?.sprintName}`
              : 'Distribution of issue types across all analyzed sprints'}
          </p>
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
          <p className="text-sm text-gray-500 mb-4">Key metrics side by side for retrospective analysis. Click a sprint to expand details.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Sprint</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Committed</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Completed</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Velocity</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Throughput</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Completion %</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Hit Rate</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Team</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Rollover</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Scope Churn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sprintCapacity.map((sprint) => {
                  const metricsSprint = sprintMetrics.find(m => m.sprintId === sprint.sprintId) || {};
                  const completionPct = sprint.committedPoints > 0
                    ? (sprint.completedPoints / sprint.committedPoints) * 100 : 0;
                  const hitRate = metricsSprint.sprintHitRate || 0;
                  const rollover = metricsSprint.rolloverRate || 0;
                  const scopeChurn = metricsSprint.midSprintAdditions?.percentage || 0;
                  const isExpanded = expandedCompSprints.has(sprint.sprintId);
                  const issues = sprint.issues || [];

                  // Compute team breakdown when expanded
                  const teamBreakdown = isExpanded ? (() => {
                    const byMember = {};
                    issues.forEach(issue => {
                      const name = issue.assignee || 'Unassigned';
                      if (!byMember[name]) byMember[name] = { name, issues: 0, completedIssues: 0, completedSP: 0, committedSP: 0 };
                      byMember[name].issues += 1;
                      byMember[name].committedSP += (issue.points || 0);
                      if (issue.completedInSprint || issue.statusCategory === 'done') {
                        byMember[name].completedIssues += 1;
                        byMember[name].completedSP += (issue.points || 0);
                      }
                    });
                    return Object.values(byMember).sort((a, b) => b.completedSP - a.completedSP);
                  })() : [];

                  return (
                    <Fragment key={sprint.sprintId}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer select-none"
                        onClick={() => toggleCompSprint(sprint.sprintId)}
                      >
                        <td className="px-3 py-2 font-medium text-gray-800">
                          <span className="inline-flex items-center gap-1.5">
                            <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            {sprint.sprintName}
                            {sprint.isActive && (
                              <span className="ml-1 px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-semibold rounded-full">
                                Active
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-gray-600">{sprint.committedPoints} SP</td>
                        <td className="px-3 py-2 text-center font-semibold text-blue-600">{sprint.completedPoints} SP</td>
                        <td className="px-3 py-2 text-center font-semibold text-blue-700">{sprint.velocity || sprint.completedPoints} SP</td>
                        <td className="px-3 py-2 text-center text-purple-600">{sprint.throughput || sprint.completedIssues} issues</td>
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

                      {/* Expanded: Team Breakdown + Sprint Issues */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={10} className="px-0 py-0">
                            <div className="bg-gray-50 border-t border-b border-gray-200 px-4 py-3">
                              {/* Team Breakdown */}
                              {teamBreakdown.length > 0 && (
                                <div className="mb-4">
                                  <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
                                    Team Breakdown ({teamBreakdown.length} members)
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {teamBreakdown.map(member => (
                                      <div key={member.name} className="bg-white rounded-lg px-3 py-2 border border-gray-200 text-xs min-w-[160px]">
                                        <div className="font-medium text-gray-800 truncate">{member.name}</div>
                                        <div className="flex items-center gap-3 text-gray-500 mt-1">
                                          <span>{member.completedIssues}/{member.issues} issues</span>
                                          <span className="font-semibold text-blue-600">{member.completedSP} SP</span>
                                        </div>
                                        {member.committedSP > 0 && (
                                          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1.5">
                                            <div
                                              className="bg-blue-500 rounded-full h-1.5"
                                              style={{ width: `${Math.min(100, (member.completedSP / member.committedSP) * 100)}%` }}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Sprint Issues */}
                              {issues.length > 0 ? (
                                <div>
                                  <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
                                    Sprint Issues ({issues.length})
                                  </div>
                                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="bg-gray-100 text-gray-500 uppercase tracking-wider">
                                          <th className="px-2 py-1.5 text-left font-medium">Key</th>
                                          <th className="px-2 py-1.5 text-left font-medium">Summary</th>
                                          <th className="px-2 py-1.5 text-left font-medium">Type</th>
                                          <th className="px-2 py-1.5 text-left font-medium">Assignee</th>
                                          <th className="px-2 py-1.5 text-center font-medium">SP</th>
                                          <th className="px-2 py-1.5 text-center font-medium">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100 bg-white">
                                        {issues.map(issue => (
                                          <tr key={issue.key} className={`hover:bg-gray-50 ${
                                            issue.statusCategory === 'done' ? 'bg-green-50/40' :
                                            issue.statusCategory === 'indeterminate' ? 'bg-blue-50/30' : ''
                                          }`}>
                                            <td className="px-2 py-1.5 text-left">
                                              {jiraBaseUrl ? (
                                                <a href={`${jiraBaseUrl}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer"
                                                  className="font-mono font-semibold text-blue-600 hover:underline"
                                                  onClick={e => e.stopPropagation()}>
                                                  {issue.key}
                                                </a>
                                              ) : (
                                                <span className="font-mono font-semibold text-gray-800">{issue.key}</span>
                                              )}
                                            </td>
                                            <td className="px-2 py-1.5 text-left text-gray-600 max-w-[300px] truncate" title={issue.summary}>
                                              {issue.summary}
                                            </td>
                                            <td className="px-2 py-1.5 text-left">
                                              <span className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">{issue.issueType}</span>
                                            </td>
                                            <td className="px-2 py-1.5 text-left text-gray-600 truncate max-w-[120px]">{issue.assignee || 'Unassigned'}</td>
                                            <td className="px-2 py-1.5 text-center font-medium">{issue.points || '-'}</td>
                                            <td className="px-2 py-1.5 text-center">
                                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                                issue.statusCategory === 'done' ? 'bg-green-100 text-green-700' :
                                                issue.statusCategory === 'indeterminate' ? 'bg-blue-100 text-blue-700' :
                                                'bg-gray-100 text-gray-600'
                                              }`}>{issue.status}</span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-sm text-gray-400 text-center py-3">
                                  No issue details available for this sprint.
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
