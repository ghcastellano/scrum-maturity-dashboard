import { useState, Fragment } from 'react';
import { Bar } from 'react-chartjs-2';
import EpicTimelineChart from './EpicTimelineChart';
import DependencyMatrix from './DependencyMatrix';
import { IssueTypeIcon, JiraLink } from './JiraIcons';

const HEALTH_COLORS = {
  'on-track': { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  'at-risk': { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  'blocked': { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  'done': { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' },
  'no-data': { bg: 'bg-gray-50', text: 'text-gray-400', dot: 'bg-gray-300' }
};

export default function EpicIntelligenceTab({ epicData, loading, credentials }) {
  const [viewMode, setViewMode] = useState('epics'); // 'epics' | 'initiatives'
  const [expandedEpic, setExpandedEpic] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');

  if (!epicData) return null;

  const { epics, initiatives, throughput, summary } = epicData;
  const jiraBaseUrl = credentials?.jiraUrl?.replace(/\/$/, '') || '';

  // Apply filters
  const filteredEpics = epics.filter(e => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'active' && (e.statusCategory === 'done' || e.statusCategory === 'new')) return false;
      if (statusFilter === 'done' && e.statusCategory !== 'done') return false;
      if (statusFilter === 'todo' && e.statusCategory !== 'new') return false;
    }
    if (healthFilter !== 'all' && e.health !== healthFilter) return false;
    return true;
  });

  // Throughput chart data
  const throughputChartData = {
    labels: throughput.map(t => t.period),
    datasets: [{
      label: 'Epics Completed',
      data: throughput.map(t => t.count),
      backgroundColor: 'rgba(124, 58, 237, 0.6)',
      borderColor: 'rgb(124, 58, 237)',
      borderWidth: 1,
      borderRadius: 4
    }]
  };

  const throughputOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => items[0].label,
          label: (item) => `${item.raw} epic${item.raw !== 1 ? 's' : ''} completed`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1, font: { size: 11 } },
        grid: { color: 'rgba(0,0,0,0.05)' }
      },
      x: {
        ticks: { font: { size: 10 }, maxRotation: 45 },
        grid: { display: false }
      }
    }
  };

  const healthBadge = (health) => {
    const colors = HEALTH_COLORS[health] || HEALTH_COLORS['no-data'];
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`}></span>
        {health === 'no-data' ? 'no children' : health.replace('-', ' ')}
      </span>
    );
  };

  const progressBar = (progress) => (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            progress >= 80 ? 'bg-green-500' : progress >= 40 ? 'bg-amber-500' : 'bg-red-400'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{progress}%</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="card text-center">
          <p className="text-2xl font-bold text-purple-600">{initiatives.filter(i => i.key !== '_unlinked').length}</p>
          <p className="text-xs text-gray-500 mt-1">Initiatives</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
          <p className="text-xs text-gray-500 mt-1">Total Epics</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-600">{summary.done}</p>
          <p className="text-xs text-gray-500 mt-1">Epics Completed</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-blue-600">{summary.inProgress}</p>
          <p className="text-xs text-gray-500 mt-1">Epics In Progress</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-amber-600">{summary.atRisk}</p>
          <p className="text-xs text-gray-500 mt-1">Epics At Risk</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-red-600">{summary.blocked}</p>
          <p className="text-xs text-gray-500 mt-1">Epics Blocked</p>
        </div>
      </div>

      {/* Epic Timeline */}
      <EpicTimelineChart epics={epics} initiatives={initiatives} jiraBaseUrl={jiraBaseUrl} />

      {/* View Toggle + Filters */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('epics')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'epics' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                By Epic ({filteredEpics.length})
              </button>
              {initiatives.length > 0 && (
                <button
                  onClick={() => setViewMode('initiatives')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    viewMode === 'initiatives' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  By Initiative ({initiatives.length})
                </button>
              )}
            </div>

            {/* Filters */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 text-gray-600"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active (In Progress)</option>
              <option value="todo">To Do</option>
              <option value="done">Done</option>
            </select>

            <select
              value={healthFilter}
              onChange={(e) => setHealthFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 text-gray-600"
            >
              <option value="all">All Health</option>
              <option value="on-track">On Track</option>
              <option value="at-risk">At Risk</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
          <span className="text-xs text-gray-400">
            {filteredEpics.length} of {epics.length} epics
          </span>
        </div>

        {/* Epic Table View */}
        {viewMode === 'epics' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase w-16">Key</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Epic</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase w-24">Status</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase w-24">Health</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase w-36">Progress</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-gray-500 uppercase w-16">Issues</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-gray-500 uppercase w-12">SP</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase w-24">Assignee</th>
                </tr>
              </thead>
              <tbody>
                {filteredEpics.map(epic => (
                  <Fragment key={epic.key}>
                    <tr
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedEpic(expandedEpic === epic.key ? null : epic.key)}
                    >
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center gap-1">
                          <IssueTypeIcon type="Epic" size={14} />
                          <JiraLink issueKey={epic.key} jiraBaseUrl={jiraBaseUrl} className="font-medium text-purple-700 text-xs" />
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{expandedEpic === epic.key ? '▼' : '▶'}</span>
                          <span className="text-gray-800">
                            {epic.summary.length > 55 ? epic.summary.substring(0, 55) + '...' : epic.summary}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          epic.statusCategory === 'done' ? 'bg-green-100 text-green-700' :
                          epic.statusCategory === 'indeterminate' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {epic.status}
                        </span>
                      </td>
                      <td className="py-2 px-3">{healthBadge(epic.health)}</td>
                      <td className="py-2 px-3">{progressBar(epic.progress)}</td>
                      <td className="py-2 px-3 text-center">
                        <span className="text-xs text-gray-600">
                          {epic.children.done}/{epic.children.total}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="text-xs text-gray-600">{epic.children.totalPoints || '-'}</span>
                      </td>
                      <td className="py-2 px-3">
                        <span className="text-xs text-gray-500">{epic.assignee}</span>
                      </td>
                    </tr>

                    {/* Expanded child issues */}
                    {expandedEpic === epic.key && epic.children.issues.length > 0 && (
                      <tr>
                        <td colSpan={8} className="bg-gray-50 px-6 py-3">
                          <div className="text-xs text-gray-500 mb-2 font-medium">
                            Child Issues ({epic.children.total}) — {epic.children.done} done, {epic.children.inProgress} in progress, {epic.children.todo} to do
                          </div>
                          <div className="grid gap-1">
                            {epic.children.issues.map(child => (
                              <div key={child.key} className="flex items-center gap-3 py-1 px-2 rounded hover:bg-gray-100">
                                <span className="inline-flex items-center gap-1 w-24">
                                  <IssueTypeIcon type={child.type} size={12} />
                                  <JiraLink issueKey={child.key} jiraBaseUrl={jiraBaseUrl} className="text-purple-600 font-medium text-xs" />
                                </span>
                                <span className={`w-2 h-2 rounded-full ${
                                  child.statusCategory === 'done' ? 'bg-green-500' :
                                  child.statusCategory === 'indeterminate' ? 'bg-blue-500' :
                                  'bg-gray-300'
                                }`}></span>
                                <span className="text-gray-700 text-xs flex-1">{child.summary}</span>
                                <span className="text-gray-400 text-xs w-16">{child.type}</span>
                                <span className="text-gray-400 text-xs w-6 text-right">{child.storyPoints || '-'}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Initiative View */}
        {viewMode === 'initiatives' && (
          <div className="space-y-4">
            {initiatives.map(initiative => (
              <div key={initiative.key} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {initiative.key !== '_unlinked' && (
                        <span className="inline-flex items-center gap-1">
                          <IssueTypeIcon type="Initiative" size={14} />
                          <JiraLink issueKey={initiative.key} jiraBaseUrl={jiraBaseUrl} className="text-xs font-medium text-purple-700" />
                        </span>
                      )}
                      <span className="font-medium text-gray-900">{initiative.summary}</span>
                    </div>
                    {initiative.key !== '_unlinked' && (
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>Status: {initiative.status}</span>
                        <span>Assignee: {initiative.assignee}</span>
                        {initiative.dueDate && <span>Due: {new Date(initiative.dueDate).toLocaleDateString()}</span>}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-purple-600">{initiative.progress}%</span>
                    <p className="text-xs text-gray-500">
                      {initiative.completedEpics}/{initiative.totalEpics} epics
                    </p>
                  </div>
                </div>

                {/* Initiative progress bar */}
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all"
                    style={{ width: `${initiative.progress}%` }}
                  />
                </div>

                {/* Epics under this initiative */}
                <div className="grid gap-2">
                  {initiative.epics.map(epic => (
                    <div key={epic.key} className="flex items-center gap-3 py-1.5 px-3 bg-gray-50 rounded">
                      <span className="inline-flex items-center gap-1 w-24">
                        <IssueTypeIcon type="Epic" size={12} />
                        <JiraLink issueKey={epic.key} jiraBaseUrl={jiraBaseUrl} className="text-xs font-medium text-purple-700" />
                      </span>
                      <span className="text-xs text-gray-700 flex-1">{epic.summary}</span>
                      {healthBadge(epic.health)}
                      <div className="w-20">{progressBar(epic.progress)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dependencies */}
      <DependencyMatrix epics={epics} jiraBaseUrl={jiraBaseUrl} />

      {/* Delivery Throughput */}
      {throughput.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Delivery Throughput</h3>
          <div style={{ height: '250px' }}>
            <Bar data={throughputChartData} options={throughputOptions} />
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">Epics completed per month</p>
        </div>
      )}
    </div>
  );
}
