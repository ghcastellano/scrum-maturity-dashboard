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

export default function ReleasesTab({ credentials, boardId, boardName }) {
  const [releases, setReleases] = useState([]);
  const [selectedRelease, setSelectedRelease] = useState(null);
  const [releaseDetails, setReleaseDetails] = useState(null);
  const [burndownData, setBurndownData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState('');
  const [activeDetailTab, setActiveDetailTab] = useState('overview');

  // Load releases when board changes
  useEffect(() => {
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

  // Burndown chart data
  const burndownChartData = useMemo(() => {
    if (!burndownData || burndownData.length === 0) return null;

    return {
      labels: burndownData.map(d => d.date),
      datasets: [
        {
          label: 'Scope (Story Points)',
          data: burndownData.map(d => d.scopePoints),
          borderColor: 'rgba(156, 163, 175, 0.8)',
          backgroundColor: 'rgba(156, 163, 175, 0.1)',
          fill: true,
          tension: 0.1
        },
        {
          label: 'Remaining',
          data: burndownData.map(d => d.remainingPoints),
          borderColor: 'rgba(59, 130, 246, 1)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.1
        },
        {
          label: 'Completed',
          data: burndownData.map(d => d.completedPoints),
          borderColor: 'rgba(34, 197, 94, 1)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: true,
          tension: 0.1
        }
      ]
    };
  }, [burndownData]);

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
          {/* Executive Summary Card */}
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

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600">Issues</div>
                <div className="text-2xl font-bold text-gray-900">
                  {releaseDetails.executiveSummary.completion.issues}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600">Story Points</div>
                <div className="text-2xl font-bold text-primary-600">
                  {releaseDetails.executiveSummary.completion.storyPoints}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600">Scope Creep</div>
                <div className={`text-2xl font-bold ${
                  releaseDetails.executiveSummary.scopeChanges.scopeCreep > 20 ? 'text-red-600' :
                  releaseDetails.executiveSummary.scopeChanges.scopeCreep > 10 ? 'text-yellow-600' :
                  'text-green-600'
                }`}>
                  {releaseDetails.executiveSummary.scopeChanges.scopeCreep}%
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600">Blocked Items</div>
                <div className={`text-2xl font-bold ${
                  releaseDetails.executiveSummary.blockedItems > 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {releaseDetails.executiveSummary.blockedItems}
                </div>
              </div>
            </div>

            {/* Risks */}
            {releaseDetails.executiveSummary.risks.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-semibold text-red-800 mb-2">Risks & Concerns</h4>
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
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Burndown Chart */}
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-4">Release Burndown</h3>
              {burndownChartData ? (
                <div className="h-64">
                  <Line data={burndownChartData} options={chartOptions} />
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
                />
              )}

              {activeDetailTab === 'added-before' && (
                <IssueTable
                  issues={releaseDetails.addedBeforeStart}
                  credentials={credentials}
                  showDependencies
                  showAddedDate
                  emptyMessage="No issues were added before the release start date"
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

// Issue Table Component
function IssueTable({ issues, credentials, showDependencies, showAddedDate, emptyMessage, highlightColor }) {
  if (issues.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {emptyMessage || 'No issues found'}
      </div>
    );
  }

  const bgColor = highlightColor === 'yellow' ? 'bg-yellow-50' : '';

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-3 py-2 text-left font-medium text-gray-600">Key</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600">Summary</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600">Type</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600">Assignee</th>
          <th className="px-3 py-2 text-center font-medium text-gray-600">SP</th>
          {showAddedDate && <th className="px-3 py-2 text-left font-medium text-gray-600">Added</th>}
          {showDependencies && <th className="px-3 py-2 text-left font-medium text-gray-600">Dependencies</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {issues.map(issue => (
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
            <td className="px-3 py-2 text-gray-600">
              {issue.assignee}
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

// Removed Issues Table
function RemovedIssueTable({ issues, credentials, emptyMessage }) {
  if (issues.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {emptyMessage || 'No issues found'}
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-3 py-2 text-left font-medium text-gray-600">Key</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600">Summary</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600">Type</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600">Moved To</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {issues.map(issue => (
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
