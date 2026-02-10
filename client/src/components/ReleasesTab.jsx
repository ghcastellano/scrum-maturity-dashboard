import { useState, useEffect, useMemo } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import api from '../services/api';

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const formatNumber = (num) => {
  if (num === null || num === undefined) return '0';
  return Number(num).toFixed(1).replace(/\.0$/, '');
};

// Status workflow order for sorting (early stages first)
const STATUS_ORDER = {
  // Early stages
  'pending triage': 1,
  'triage': 2,
  'pending requirements': 3,
  'requirements': 4,
  'backlog': 5,
  'to do': 6,
  'todo': 6,
  'open': 7,
  'new': 8,
  // In progress stages
  'in development': 10,
  'in progress': 11,
  'development': 12,
  'coding': 13,
  'implementation': 14,
  // Review stages
  'pending review': 20,
  'code review': 21,
  'in review': 22,
  'review': 23,
  // Testing stages
  'ready for qa': 30,
  'in qa': 31,
  'testing': 32,
  'qa': 33,
  // Final stages
  'pending deployment': 40,
  'ready for deployment': 41,
  'deploying': 42,
  'deployed': 43,
  'done': 50,
  'closed': 51,
  'resolved': 52,
  'complete': 53,
  'completed': 54
};

const getStatusOrder = (status) => {
  if (!status) return 999;
  const normalized = status.toLowerCase().trim();
  return STATUS_ORDER[normalized] ?? 25; // Default to middle of workflow
};

export default function ReleasesTab({ credentials, boardId, boardName }) {
  const [releases, setReleases] = useState([]);
  const [selectedRelease, setSelectedRelease] = useState(null);
  const [releaseDetails, setReleaseDetails] = useState(null);
  const [burndownData, setBurndownData] = useState(null);
  const [burndownReleaseDate, setBurndownReleaseDate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState('');
  const [activeDetailTab, setActiveDetailTab] = useState('overview');

  // Reset all state and reload when board changes
  useEffect(() => {
    // Reset all release data to prevent stale data from showing
    setReleases([]);
    setSelectedRelease(null);
    setReleaseDetails(null);
    setBurndownData(null);
    setBurndownReleaseDate(null);
    setError('');
    setActiveDetailTab('overview');

    if (credentials && boardId) {
      loadReleases();
    }
  }, [boardId, credentials]);

  const loadReleases = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getReleases(
        credentials.jiraUrl,
        credentials.email,
        credentials.apiToken,
        boardId
      );
      if (result.success) {
        setReleases(result.releases);
        // Auto-select first unreleased release if available
        const unreleased = result.releases.find(r => !r.released);
        if (unreleased) {
          handleReleaseSelect(unreleased);
        } else if (result.releases.length > 0) {
          handleReleaseSelect(result.releases[0]);
        }
      }
    } catch (err) {
      setError(`Failed to load releases: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReleaseSelect = async (release) => {
    setSelectedRelease(release);
    setLoadingDetails(true);
    setError('');

    try {
      // Load details and burndown in parallel
      const [detailsResult, burndownResult] = await Promise.all([
        api.getReleaseDetails(
          credentials.jiraUrl,
          credentials.email,
          credentials.apiToken,
          boardId,
          release.id,
          release.name,
          release.startDate
        ),
        api.getReleaseBurndown(
          credentials.jiraUrl,
          credentials.email,
          credentials.apiToken,
          boardId,
          release.name,
          release.startDate,
          release.releaseDate
        )
      ]);

      if (detailsResult.success) {
        setReleaseDetails(detailsResult.details);
      }
      if (burndownResult.success) {
        setBurndownData(burndownResult.burndown);
        setBurndownReleaseDate(burndownResult.releaseDate);
      }
    } catch (err) {
      setError(`Failed to load release details: ${err.message}`);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Chart configurations
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' }
    }
  };

  // Burndown chart data - proper burndown: remaining goes DOWN from top
  const burndownChartData = useMemo(() => {
    if (!burndownData || burndownData.length === 0) return null;

    const labels = burndownData.map(d => d.date);
    const releaseDateIndex = burndownReleaseDate ? labels.indexOf(burndownReleaseDate) : -1;

    // Calculate ideal burndown line
    // Goes from initial scope at start to 0 at release date (or end of chart)
    const initialScope = burndownData[0]?.scopePoints || 0;
    const idealEndIndex = releaseDateIndex >= 0 ? releaseDateIndex : labels.length - 1;
    const idealBurndownData = burndownData.map((d, i) => {
      if (idealEndIndex === 0) return initialScope;
      if (i > idealEndIndex) return null; // No ideal line after release date
      const progress = i / idealEndIndex;
      return Math.max(0, Math.round((initialScope * (1 - progress)) * 10) / 10);
    });

    // Segment styling: dashed after release date
    const getSegmentStyle = (baseColor, dashPattern = [5, 5]) => ({
      segment: {
        borderDash: ctx => {
          if (releaseDateIndex < 0) return undefined;
          return ctx.p0DataIndex >= releaseDateIndex ? dashPattern : undefined;
        },
        borderColor: ctx => {
          if (releaseDateIndex < 0) return baseColor;
          return ctx.p0DataIndex >= releaseDateIndex
            ? baseColor.replace('1)', '0.5)').replace('0.8)', '0.4)')
            : baseColor;
        }
      }
    });

    const datasets = [
      // Ideal burndown (guideline) - dashed gray line from initial scope to 0
      {
        label: 'Ideal Burndown',
        data: idealBurndownData,
        borderColor: 'rgba(156, 163, 175, 0.6)',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 3,
        fill: false,
        tension: 0
      },
      // Scope (total story points) - thin line showing scope changes
      {
        label: 'Scope',
        data: burndownData.map(d => d.scopePoints),
        borderColor: 'rgba(168, 85, 247, 0.7)',
        backgroundColor: 'rgba(168, 85, 247, 0.05)',
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.1,
        ...getSegmentStyle('rgba(168, 85, 247, 0.7)')
      },
      // Remaining (the actual burndown line) - thick blue, main focus
      {
        label: 'Remaining',
        data: burndownData.map(d => d.remainingPoints),
        borderColor: 'rgba(59, 130, 246, 1)',
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        borderWidth: 3,
        pointRadius: 2,
        pointHoverRadius: 6,
        pointBackgroundColor: 'rgba(59, 130, 246, 1)',
        fill: true,
        tension: 0.1,
        ...getSegmentStyle('rgba(59, 130, 246, 1)')
      }
    ];

    // Add release date vertical annotation
    if (releaseDateIndex >= 0) {
      const maxScope = Math.max(...burndownData.map(d => d.scopePoints), 1);

      // Release date marker (triangle pointing down)
      datasets.push({
        label: `Release Date (${burndownReleaseDate})`,
        data: burndownData.map((d, i) => i === releaseDateIndex ? maxScope * 1.08 : null),
        borderColor: 'rgba(239, 68, 68, 1)',
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        pointRadius: 8,
        pointStyle: 'triangle',
        pointRotation: 180,
        pointBorderWidth: 2,
        showLine: false,
        fill: false
      });
    }

    return { labels, datasets };
  }, [burndownData, burndownReleaseDate]);

  // Burndown chart specific options
  const burndownChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 15,
          font: { size: 11 },
          filter: (item) => item.text !== 'Release Date Marker'
        }
      },
      tooltip: {
        callbacks: {
          title: (items) => {
            const date = items[0]?.label;
            if (!date) return '';
            const isRelease = date === burndownReleaseDate;
            return isRelease ? `${date} (Release Date)` : date;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Story Points',
          font: { size: 12, weight: 'bold' }
        },
        grid: { color: 'rgba(0, 0, 0, 0.06)' }
      },
      x: {
        grid: { color: 'rgba(0, 0, 0, 0.06)' },
        ticks: {
          maxRotation: 45,
          font: { size: 10 }
        }
      }
    }
  }), [burndownReleaseDate]);

  // Status distribution chart
  const statusChartData = useMemo(() => {
    if (!releaseDetails?.executiveSummary?.breakdown?.byStatus) return null;
    const { done, inProgress, todo } = releaseDetails.executiveSummary.breakdown.byStatus;

    return {
      labels: ['Done', 'In Progress', 'To Do'],
      datasets: [{
        data: [done, inProgress, todo],
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(156, 163, 175, 0.8)'
        ],
        borderWidth: 0
      }]
    };
  }, [releaseDetails]);

  // Type distribution chart
  const typeChartData = useMemo(() => {
    if (!releaseDetails?.executiveSummary?.breakdown?.byType) return null;
    const byType = releaseDetails.executiveSummary.breakdown.byType;
    const labels = Object.keys(byType);
    const data = Object.values(byType);

    const colors = {
      Story: 'rgba(59, 130, 246, 0.8)',
      Bug: 'rgba(239, 68, 68, 0.8)',
      Task: 'rgba(156, 163, 175, 0.8)',
      Epic: 'rgba(168, 85, 247, 0.8)',
      'Sub-task': 'rgba(251, 191, 36, 0.8)'
    };

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map(l => colors[l] || 'rgba(107, 114, 128, 0.8)'),
        borderWidth: 0
      }]
    };
  }, [releaseDetails]);

  // Calculate percentages for executive summary
  const statusPercentages = useMemo(() => {
    if (!releaseDetails?.metrics) return { todo: 0, inProgress: 0, done: 0 };
    const { totalIssues, completedIssues, inProgressIssues, todoIssues } = releaseDetails.metrics;
    if (totalIssues === 0) return { todo: 0, inProgress: 0, done: 0 };

    return {
      todo: Math.round((todoIssues / totalIssues) * 100),
      inProgress: Math.round((inProgressIssues / totalIssues) * 100),
      done: Math.round((completedIssues / totalIssues) * 100)
    };
  }, [releaseDetails]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading releases...</span>
      </div>
    );
  }

  if (error && releases.length === 0) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Release Selector */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Releases</h2>
            <p className="text-sm text-gray-500">Select a release to view details</p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedRelease?.id || ''}
              onChange={(e) => {
                const release = releases.find(r => r.id === e.target.value);
                if (release) handleReleaseSelect(release);
              }}
              className="input-field min-w-[250px]"
            >
              <option value="">Select a release...</option>
              <optgroup label="Unreleased">
                {releases.filter(r => !r.released).map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.releaseDate ? `(${formatDate(r.releaseDate)})` : ''}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Released">
                {releases.filter(r => r.released).map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({formatDate(r.releaseDate)})
                  </option>
                ))}
              </optgroup>
            </select>

            <button
              onClick={loadReleases}
              className="btn-secondary flex items-center gap-2"
              disabled={loading}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {loadingDetails && (
        <div className="card flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading release details...</span>
        </div>
      )}

      {selectedRelease && releaseDetails && !loadingDetails && (
        <>
          {/* Executive Summary Card - Enhanced */}
          <div className="card">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">{selectedRelease.name}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedRelease.startDate && `Start: ${formatDate(selectedRelease.startDate)}`}
                  {selectedRelease.startDate && selectedRelease.releaseDate && ' • '}
                  {selectedRelease.releaseDate && `Release: ${formatDate(selectedRelease.releaseDate)}`}
                </p>
              </div>

              {/* Health Status Badge */}
              <div className={`px-4 py-2 rounded-lg font-semibold text-sm ${
                releaseDetails.executiveSummary.healthColor === 'green' ? 'bg-green-100 text-green-800' :
                releaseDetails.executiveSummary.healthColor === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {releaseDetails.executiveSummary.healthStatus}
              </div>
            </div>

            {/* Progress Bar - Visual Status Breakdown */}
            <div className="mb-6">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium text-gray-700">Overall Progress</span>
                <span className="text-gray-500">
                  {releaseDetails.metrics.completedIssues} of {releaseDetails.metrics.totalIssues} issues completed
                </span>
              </div>
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
                {releaseDetails.metrics.totalIssues > 0 && (
                  <>
                    {/* Order: To Do (gray) → In Progress (blue) → Done (green) */}
                    <div
                      className="bg-gray-300 h-full transition-all duration-500"
                      style={{ width: `${statusPercentages.todo}%` }}
                      title={`To Do: ${statusPercentages.todo}%`}
                    />
                    <div
                      className="bg-blue-500 h-full transition-all duration-500"
                      style={{ width: `${statusPercentages.inProgress}%` }}
                      title={`In Progress: ${statusPercentages.inProgress}%`}
                    />
                    <div
                      className="bg-green-500 h-full transition-all duration-500"
                      style={{ width: `${statusPercentages.done}%` }}
                      title={`Done: ${statusPercentages.done}%`}
                    />
                  </>
                )}
              </div>
              {/* Status Legend with Percentages */}
              <div className="flex items-center justify-center gap-6 mt-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-300"></div>
                  <span className="text-sm text-gray-600">
                    To Do <span className="font-semibold text-gray-900">{statusPercentages.todo}%</span>
                    <span className="text-gray-400 ml-1">({releaseDetails.metrics.todoIssues})</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-sm text-gray-600">
                    In Progress <span className="font-semibold text-blue-600">{statusPercentages.inProgress}%</span>
                    <span className="text-gray-400 ml-1">({releaseDetails.metrics.inProgressIssues})</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm text-gray-600">
                    Done <span className="font-semibold text-green-600">{statusPercentages.done}%</span>
                    <span className="text-gray-400 ml-1">({releaseDetails.metrics.completedIssues})</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Key Metrics Grid - Enhanced */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Issues</div>
                <div className="text-2xl font-bold text-gray-900">
                  {releaseDetails.metrics.totalIssues}
                </div>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                <div className="text-xs text-blue-600 uppercase tracking-wide mb-1">Story Points</div>
                <div className="text-2xl font-bold text-blue-700">
                  {releaseDetails.metrics.completedStoryPoints}/{releaseDetails.metrics.totalStoryPoints}
                </div>
                <div className="text-xs text-blue-500 mt-1">
                  {releaseDetails.metrics.storyPointsCompletion}% complete
                </div>
              </div>
              <div className={`rounded-xl p-4 border ${
                releaseDetails.executiveSummary.scopeChanges.scopeCreep > 20
                  ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
                  : releaseDetails.executiveSummary.scopeChanges.scopeCreep > 10
                    ? 'bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200'
                    : 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'
              }`}>
                <div className={`text-xs uppercase tracking-wide mb-1 ${
                  releaseDetails.executiveSummary.scopeChanges.scopeCreep > 20 ? 'text-red-600' :
                  releaseDetails.executiveSummary.scopeChanges.scopeCreep > 10 ? 'text-yellow-600' :
                  'text-green-600'
                }`}>Scope Creep</div>
                <div className={`text-2xl font-bold ${
                  releaseDetails.executiveSummary.scopeChanges.scopeCreep > 20 ? 'text-red-700' :
                  releaseDetails.executiveSummary.scopeChanges.scopeCreep > 10 ? 'text-yellow-700' :
                  'text-green-700'
                }`}>
                  {releaseDetails.executiveSummary.scopeChanges.scopeCreep}%
                </div>
                <div className={`text-xs mt-1 ${
                  releaseDetails.executiveSummary.scopeChanges.scopeCreep > 20 ? 'text-red-500' :
                  releaseDetails.executiveSummary.scopeChanges.scopeCreep > 10 ? 'text-yellow-500' :
                  'text-green-500'
                }`}>
                  +{releaseDetails.executiveSummary.scopeChanges.addedAfterStart} items added
                </div>
              </div>
              <div className={`rounded-xl p-4 border ${
                releaseDetails.executiveSummary.blockedItems > 0
                  ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
                  : 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'
              }`}>
                <div className={`text-xs uppercase tracking-wide mb-1 ${
                  releaseDetails.executiveSummary.blockedItems > 0 ? 'text-red-600' : 'text-green-600'
                }`}>Blocked Items</div>
                <div className={`text-2xl font-bold ${
                  releaseDetails.executiveSummary.blockedItems > 0 ? 'text-red-700' : 'text-green-700'
                }`}>
                  {releaseDetails.executiveSummary.blockedItems}
                </div>
                {releaseDetails.executiveSummary.blockedItems > 0 && (
                  <div className="text-xs text-red-500 mt-1">Needs attention</div>
                )}
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
                <div className="text-xs text-purple-600 uppercase tracking-wide mb-1">Removed</div>
                <div className="text-2xl font-bold text-purple-700">
                  {releaseDetails.executiveSummary.scopeChanges.removed}
                </div>
                <div className="text-xs text-purple-500 mt-1">
                  items removed
                </div>
              </div>
            </div>

            {/* Risks */}
            {releaseDetails.executiveSummary.risks.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Risks & Concerns
                </h4>
                <ul className="space-y-1">
                  {releaseDetails.executiveSummary.risks.map((risk, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-red-700">
                      <span className="text-red-500 mt-0.5">•</span>
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Quick Actions / Insights */}
            {releaseDetails.metrics.totalIssues > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex flex-wrap gap-2">
                  {releaseDetails.metrics.todoIssues > 0 && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                      {releaseDetails.metrics.todoIssues} not started
                    </span>
                  )}
                  {releaseDetails.issues.filter(i => i.assignee === 'Unassigned').length > 0 && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {releaseDetails.issues.filter(i => i.assignee === 'Unassigned').length} unassigned
                    </span>
                  )}
                  {releaseDetails.issues.filter(i => i.priority === 'Highest' || i.priority === 'High').length > 0 && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                      {releaseDetails.issues.filter(i => i.priority === 'Highest' || i.priority === 'High').length} high priority
                    </span>
                  )}
                  {releaseDetails.issues.filter(i => i.type === 'Bug').length > 0 && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {releaseDetails.issues.filter(i => i.type === 'Bug').length} bugs
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Burndown Chart */}
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-4">Release Burndown</h3>
              {burndownChartData ? (
                <div className="h-72">
                  <Line data={burndownChartData} options={burndownChartOptions} />
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">
                  No burndown data available
                </div>
              )}
            </div>

            {/* Status & Type Charts */}
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-4">Distribution</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 text-center mb-2">By Status</p>
                  {statusChartData ? (
                    <div className="h-40">
                      <Doughnut data={statusChartData} options={{ ...chartOptions, plugins: { legend: { display: false } } }} />
                    </div>
                  ) : (
                    <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No data</div>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 text-center mb-2">By Type</p>
                  {typeChartData ? (
                    <div className="h-40">
                      <Doughnut data={typeChartData} options={{ ...chartOptions, plugins: { legend: { display: false } } }} />
                    </div>
                  ) : (
                    <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No data</div>
                  )}
                </div>
              </div>
              {/* Legend */}
              <div className="flex flex-wrap justify-center gap-3 mt-4 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500"></span> Done</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500"></span> In Progress</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-400"></span> To Do</span>
              </div>
            </div>
          </div>

          {/* Detail Tabs */}
          <div className="card">
            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200 mb-6 -mt-2 overflow-x-auto">
              {[
                { id: 'overview', label: 'All Issues', count: releaseDetails.issues.length },
                { id: 'added-before', label: 'Added Before Start', count: releaseDetails.addedBeforeStart.length },
                { id: 'added-after', label: 'Added After Start', count: releaseDetails.addedAfterStart.length },
                { id: 'removed', label: 'Removed', count: releaseDetails.removedIssues.length }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveDetailTab(tab.id)}
                  className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeDetailTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                    activeDetailTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="overflow-x-auto">
              {activeDetailTab === 'overview' && (
                <IssueTable
                  issues={releaseDetails.issues}
                  credentials={credentials}
                  showDependencies
                  showAddedDate
                  defaultSortField="status"
                  defaultSortDir="asc"
                />
              )}

              {activeDetailTab === 'added-before' && (
                <IssueTable
                  issues={releaseDetails.addedBeforeStart}
                  credentials={credentials}
                  showDependencies
                  showAddedDate
                  emptyMessage="No issues were added before the release start date"
                  defaultSortField="status"
                  defaultSortDir="asc"
                />
              )}

              {activeDetailTab === 'added-after' && (
                <IssueTable
                  issues={releaseDetails.addedAfterStart}
                  credentials={credentials}
                  showDependencies
                  showAddedDate
                  emptyMessage="No issues were added after the release start date"
                  highlightColor="yellow"
                  defaultSortField="status"
                  defaultSortDir="asc"
                />
              )}

              {activeDetailTab === 'removed' && (
                <RemovedIssueTable
                  issues={releaseDetails.removedIssues}
                  credentials={credentials}
                  emptyMessage="No issues were removed from this release"
                />
              )}
            </div>
          </div>
        </>
      )}

      {!selectedRelease && !loading && releases.length === 0 && (
        <div className="card text-center py-12">
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No Releases Found</h3>
          <p className="text-gray-500">This project doesn't have any releases/versions configured in Jira.</p>
        </div>
      )}
    </div>
  );
}

// Sortable Issue Table Component
function IssueTable({ issues, credentials, showDependencies, showAddedDate, emptyMessage, highlightColor, defaultSortField = 'status', defaultSortDir = 'asc' }) {
  const [sortField, setSortField] = useState(defaultSortField);
  const [sortDir, setSortDir] = useState(defaultSortDir);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedIssues = useMemo(() => {
    const sorted = [...issues].sort((a, b) => {
      let aVal, bVal;

      switch (sortField) {
        case 'key':
          // Sort by project key then number
          const aMatch = a.key.match(/^([A-Z]+)-(\d+)$/);
          const bMatch = b.key.match(/^([A-Z]+)-(\d+)$/);
          if (aMatch && bMatch) {
            if (aMatch[1] !== bMatch[1]) return aMatch[1].localeCompare(bMatch[1]);
            return parseInt(aMatch[2]) - parseInt(bMatch[2]);
          }
          return a.key.localeCompare(b.key);
        case 'summary':
          return a.summary.localeCompare(b.summary);
        case 'type':
          return a.type.localeCompare(b.type);
        case 'status':
          // Use workflow order
          aVal = getStatusOrder(a.status);
          bVal = getStatusOrder(b.status);
          return aVal - bVal;
        case 'assignee':
          aVal = a.assignee || 'ZZZZZ'; // Unassigned at end
          bVal = b.assignee || 'ZZZZZ';
          return aVal.localeCompare(bVal);
        case 'storyPoints':
          aVal = a.storyPoints || 0;
          bVal = b.storyPoints || 0;
          return aVal - bVal;
        case 'addedDate':
          aVal = new Date(a.addedToVersionDate || 0);
          bVal = new Date(b.addedToVersionDate || 0);
          return aVal - bVal;
        case 'priority':
          const priorityOrder = { 'Highest': 1, 'High': 2, 'Medium': 3, 'Low': 4, 'Lowest': 5 };
          aVal = priorityOrder[a.priority] || 3;
          bVal = priorityOrder[b.priority] || 3;
          return aVal - bVal;
        default:
          return 0;
      }
    });

    return sortDir === 'desc' ? sorted.reverse() : sorted;
  }, [issues, sortField, sortDir]);

  if (issues.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {emptyMessage || 'No issues found'}
      </div>
    );
  }

  const bgColor = highlightColor === 'yellow' ? 'bg-yellow-50' : '';

  const SortHeader = ({ field, children, className = '' }) => (
    <th
      className={`px-3 py-2 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <span className="text-gray-400">
          {sortField === field ? (
            sortDir === 'asc' ? '↑' : '↓'
          ) : (
            <span className="opacity-0 group-hover:opacity-50">↕</span>
          )}
        </span>
      </div>
    </th>
  );

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          <SortHeader field="key">Key</SortHeader>
          <SortHeader field="summary">Summary</SortHeader>
          <SortHeader field="type">Type</SortHeader>
          <SortHeader field="status">Status</SortHeader>
          <SortHeader field="priority">Priority</SortHeader>
          <SortHeader field="assignee">Assignee</SortHeader>
          <SortHeader field="storyPoints" className="text-center">SP</SortHeader>
          {showAddedDate && <SortHeader field="addedDate">Added</SortHeader>}
          {showDependencies && <th className="px-3 py-2 text-left font-medium text-gray-600">Dependencies</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {sortedIssues.map(issue => (
          <tr key={issue.key} className={`hover:bg-gray-50 ${bgColor}`}>
            <td className="px-3 py-2">
              <a
                href={`${credentials.jiraUrl.replace(/\/$/, '')}/browse/${issue.key}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono font-semibold text-blue-600 hover:underline"
              >
                {issue.key}
              </a>
            </td>
            <td className="px-3 py-2 max-w-xs truncate" title={issue.summary}>
              {issue.summary}
            </td>
            <td className="px-3 py-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                issue.type === 'Bug' ? 'bg-red-100 text-red-700' :
                issue.type === 'Story' ? 'bg-blue-100 text-blue-700' :
                issue.type === 'Task' ? 'bg-gray-100 text-gray-700' :
                issue.type === 'Epic' ? 'bg-purple-100 text-purple-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {issue.type}
              </span>
            </td>
            <td className="px-3 py-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                issue.statusCategory === 'done' ? 'bg-green-100 text-green-700' :
                issue.statusCategory === 'indeterminate' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {issue.status}
              </span>
            </td>
            <td className="px-3 py-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                issue.priority === 'Highest' ? 'bg-red-100 text-red-700' :
                issue.priority === 'High' ? 'bg-orange-100 text-orange-700' :
                issue.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                issue.priority === 'Low' ? 'bg-green-100 text-green-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {issue.priority || 'None'}
              </span>
            </td>
            <td className="px-3 py-2 text-gray-600">
              {issue.assignee === 'Unassigned' ? (
                <span className="text-orange-500 italic">Unassigned</span>
              ) : issue.assignee}
            </td>
            <td className="px-3 py-2 text-center font-medium">
              {issue.storyPoints || '-'}
            </td>
            {showAddedDate && (
              <td className="px-3 py-2 text-gray-500 text-xs">
                {formatDate(issue.addedToVersionDate)}
              </td>
            )}
            {showDependencies && (
              <td className="px-3 py-2">
                {issue.dependencies.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {issue.dependencies.slice(0, 3).map((dep, idx) => (
                      <a
                        key={idx}
                        href={`${credentials.jiraUrl.replace(/\/$/, '')}/browse/${dep.linkedIssue?.key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`px-1.5 py-0.5 rounded text-xs ${
                          dep.type === 'Blocks' ? 'bg-red-100 text-red-700' :
                          dep.type === 'Depends' ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-600'
                        }`}
                        title={`${dep.description}: ${dep.linkedIssue?.key}`}
                      >
                        {dep.linkedIssue?.key}
                      </a>
                    ))}
                    {issue.dependencies.length > 3 && (
                      <span className="text-xs text-gray-400">+{issue.dependencies.length - 3}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Sortable Removed Issues Table
function RemovedIssueTable({ issues, credentials, emptyMessage }) {
  const [sortField, setSortField] = useState('key');
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedIssues = useMemo(() => {
    const sorted = [...issues].sort((a, b) => {
      switch (sortField) {
        case 'key':
          return a.key.localeCompare(b.key);
        case 'summary':
          return a.summary.localeCompare(b.summary);
        case 'type':
          return a.type.localeCompare(b.type);
        case 'status':
          return getStatusOrder(a.status) - getStatusOrder(b.status);
        case 'movedTo':
          return (a.movedTo || '').localeCompare(b.movedTo || '');
        default:
          return 0;
      }
    });

    return sortDir === 'desc' ? sorted.reverse() : sorted;
  }, [issues, sortField, sortDir]);

  if (issues.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {emptyMessage || 'No issues found'}
      </div>
    );
  }

  const SortHeader = ({ field, children }) => (
    <th
      className="px-3 py-2 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <span className="text-gray-400">
          {sortField === field ? (
            sortDir === 'asc' ? '↑' : '↓'
          ) : ''}
        </span>
      </div>
    </th>
  );

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          <SortHeader field="key">Key</SortHeader>
          <SortHeader field="summary">Summary</SortHeader>
          <SortHeader field="type">Type</SortHeader>
          <SortHeader field="status">Status</SortHeader>
          <SortHeader field="movedTo">Moved To</SortHeader>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {sortedIssues.map(issue => (
          <tr key={issue.key} className="hover:bg-gray-50 bg-red-50">
            <td className="px-3 py-2">
              <a
                href={`${credentials.jiraUrl.replace(/\/$/, '')}/browse/${issue.key}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono font-semibold text-red-600 hover:underline"
              >
                {issue.key}
              </a>
            </td>
            <td className="px-3 py-2 max-w-xs truncate" title={issue.summary}>
              {issue.summary}
            </td>
            <td className="px-3 py-2">
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                {issue.type}
              </span>
            </td>
            <td className="px-3 py-2 text-gray-600">
              {issue.status}
            </td>
            <td className="px-3 py-2">
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                {issue.movedTo}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
