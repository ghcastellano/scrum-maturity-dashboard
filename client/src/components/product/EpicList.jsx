import { useState } from 'react';

const healthConfig = {
  'on-track': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300', dot: 'bg-green-500' },
  'at-risk': { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300', dot: 'bg-yellow-500' },
  'overdue': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300', dot: 'bg-red-500' },
  'stalled': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300', dot: 'bg-orange-500' },
  'done': { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300', dot: 'bg-blue-500' },
  'empty': { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300', dot: 'bg-gray-400' }
};

const healthLabels = (t) => ({
  'on-track': t('pmOnTrack'),
  'at-risk': t('pmAtRisk'),
  'overdue': t('pmOverdue'),
  'stalled': t('pmStalled'),
  'done': t('pmDone'),
  'empty': t('pmEmpty')
});

export default function EpicList({ epics, initiatives, locale, t }) {
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('health');
  const [searchTerm, setSearchTerm] = useState('');

  const labels = healthLabels(t);

  // Filter
  let filtered = epics;
  if (filter === 'active') {
    filtered = epics.filter(e => e.statusCategory !== 'done');
  } else if (filter === 'done') {
    filtered = epics.filter(e => e.statusCategory === 'done');
  }

  // Search
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(e =>
      e.key.toLowerCase().includes(term) ||
      e.summary.toLowerCase().includes(term) ||
      (e.assignee || '').toLowerCase().includes(term) ||
      e.labels.some(l => l.toLowerCase().includes(term))
    );
  }

  // Sort
  const healthOrder = { 'overdue': 0, 'at-risk': 1, 'stalled': 2, 'on-track': 3, 'empty': 4, 'done': 5 };
  if (sortBy === 'health') {
    filtered.sort((a, b) => (healthOrder[a.health] ?? 9) - (healthOrder[b.health] ?? 9));
  } else if (sortBy === 'progress') {
    filtered.sort((a, b) => a.progressPercent - b.progressPercent);
  } else if (sortBy === 'name') {
    filtered.sort((a, b) => a.summary.localeCompare(b.summary));
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return t('pmNoDueDate');
    return new Date(dateStr).toLocaleDateString(locale === 'pt-BR' ? 'pt-BR' : 'en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  return (
    <div>
      {/* Controls */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Filter */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200">
            {[['all', t('pmFilterAll')], ['active', t('pmFilterActive')], ['done', t('pmFilterDone')]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 text-sm font-medium ${filter === key ? 'bg-purple-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="input-field text-sm py-1.5 w-auto"
          >
            <option value="health">{t('pmSortByHealth')}</option>
            <option value="progress">{t('pmSortByProgress')}</option>
            <option value="name">{t('pmSortByName')}</option>
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input-field text-sm py-1.5 flex-1 min-w-48"
          />

          <span className="text-sm text-gray-500">
            {filtered.length} / {epics.length} {t('pmTotalEpics').toLowerCase()}
          </span>
        </div>
      </div>

      {/* Epic cards */}
      <div className="space-y-3">
        {filtered.map(epic => {
          const hc = healthConfig[epic.health] || healthConfig.empty;
          return (
            <div key={epic.key} className={`border ${hc.border} rounded-lg p-4 ${hc.bg} bg-opacity-30`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2.5 h-2.5 rounded-full ${hc.dot}`} />
                    <span className="font-mono text-sm text-gray-500">{epic.key}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${hc.bg} ${hc.text}`}>
                      {labels[epic.health] || epic.health}
                    </span>
                    {epic.priority && epic.priority !== 'None' && (
                      <span className="text-xs text-gray-500">{epic.priority}</span>
                    )}
                  </div>
                  <h4 className="font-semibold text-gray-900 truncate">{epic.summary}</h4>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-600">
                    <span>{epic.status}</span>
                    {epic.assignee && <span>{epic.assignee}</span>}
                    <span>{t('pmDueDate')}: {formatDate(epic.dueDate)}</span>
                    {epic.parent && (
                      <span className="text-purple-600">{epic.parent.key}</span>
                    )}
                  </div>
                  {epic.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {epic.labels.map(label => (
                        <span key={label} className="px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">{label}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Progress */}
                <div className="text-right shrink-0 w-32">
                  <div className="text-lg font-bold text-gray-900">{epic.progressPercent}%</div>
                  <div className="text-xs text-gray-500">
                    {epic.doneChildren}/{epic.totalChildren} {t('pmChildren')}
                  </div>
                  {epic.totalPoints > 0 && (
                    <div className="text-xs text-gray-500">
                      {epic.donePoints}/{epic.totalPoints} {t('pmPoints')}
                    </div>
                  )}
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className={`h-2 rounded-full ${epic.progressPercent >= 100 ? 'bg-blue-500' : epic.progressPercent >= 70 ? 'bg-green-500' : epic.progressPercent >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(epic.progressPercent, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Initiatives section */}
      {initiatives && initiatives.length > 0 && (
        <div className="card mt-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">{t('pmInitiatives')}</h3>
          <div className="space-y-2">
            {initiatives.map(init => (
              <div key={init.key} className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <span className="font-mono text-sm text-purple-600">{init.key}</span>
                <span className="font-medium text-gray-900 flex-1 truncate">{init.summary}</span>
                <span className="text-sm text-gray-500">{init.status}</span>
                {init.assignee && <span className="text-sm text-gray-400">{init.assignee}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
