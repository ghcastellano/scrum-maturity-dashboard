export default function EpicHealthSummary({ summary, t }) {
  if (!summary || summary.total === 0) return null;

  const healthColors = {
    'on-track': 'bg-green-100 text-green-800',
    'at-risk': 'bg-yellow-100 text-yellow-800',
    'overdue': 'bg-red-100 text-red-800',
    'stalled': 'bg-orange-100 text-orange-800',
    'done': 'bg-blue-100 text-blue-800',
    'empty': 'bg-gray-100 text-gray-600'
  };

  const healthLabels = {
    'on-track': t('pmOnTrack'),
    'at-risk': t('pmAtRisk'),
    'overdue': t('pmOverdue'),
    'stalled': t('pmStalled'),
    'done': t('pmDone'),
    'empty': t('pmEmpty')
  };

  return (
    <div className="card mb-6">
      <h3 className="text-lg font-bold text-gray-800 mb-4">{t('pmEpicHealth')}</h3>

      {/* Key metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-700">{summary.total}</div>
          <div className="text-xs text-purple-600">{t('pmTotalEpics')}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-700">{summary.avgProgress}%</div>
          <div className="text-xs text-blue-600">{t('pmAvgProgress')}</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-700">{summary.totalChildren}</div>
          <div className="text-xs text-gray-600">{t('pmTotalStories')}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-700">{summary.totalDoneChildren}</div>
          <div className="text-xs text-green-600">{t('pmStoriesDone')}</div>
        </div>
      </div>

      {/* Health distribution */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('pmHealthDistribution')}</h4>
        <div className="flex flex-wrap gap-2">
          {Object.entries(summary.byHealth || {}).map(([health, count]) => {
            if (count === 0) return null;
            return (
              <span key={health} className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${healthColors[health] || 'bg-gray-100 text-gray-600'}`}>
                {healthLabels[health] || health}: {count}
              </span>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
            {summary.byHealth?.done > 0 && (
              <div className="bg-blue-500" style={{ width: `${(summary.byHealth.done / summary.total) * 100}%` }} />
            )}
            {summary.byHealth?.['on-track'] > 0 && (
              <div className="bg-green-500" style={{ width: `${(summary.byHealth['on-track'] / summary.total) * 100}%` }} />
            )}
            {summary.byHealth?.['at-risk'] > 0 && (
              <div className="bg-yellow-500" style={{ width: `${(summary.byHealth['at-risk'] / summary.total) * 100}%` }} />
            )}
            {summary.byHealth?.stalled > 0 && (
              <div className="bg-orange-500" style={{ width: `${(summary.byHealth.stalled / summary.total) * 100}%` }} />
            )}
            {summary.byHealth?.overdue > 0 && (
              <div className="bg-red-500" style={{ width: `${(summary.byHealth.overdue / summary.total) * 100}%` }} />
            )}
            {summary.byHealth?.empty > 0 && (
              <div className="bg-gray-300" style={{ width: `${(summary.byHealth.empty / summary.total) * 100}%` }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
