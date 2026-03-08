export default function DependencyView({ data, t }) {
  if (!data) return null;

  const { dependencies, summary } = data;

  return (
    <div>
      {/* Summary cards */}
      <div className="card mb-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{t('pmDepSummary')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-purple-700">{summary.epicsWithDeps}</div>
            <div className="text-xs text-purple-600">{t('pmEpicsWithDeps')}</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-700">{summary.totalBlocks}</div>
            <div className="text-xs text-red-600">{t('pmTotalBlocking')}</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-orange-700">{summary.totalBlockedBy}</div>
            <div className="text-xs text-orange-600">{t('pmTotalBlockedBy')}</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-700">{summary.totalRelates}</div>
            <div className="text-xs text-blue-600">{t('pmTotalRelated')}</div>
          </div>
        </div>
      </div>

      {/* Dependency list */}
      {dependencies.length === 0 ? (
        <div className="card text-center py-8 text-gray-500">{t('pmNoDependencies')}</div>
      ) : (
        <div className="space-y-4">
          {dependencies.map(dep => (
            <div key={dep.key} className="card">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono text-sm text-purple-600">{dep.key}</span>
                <span className="font-semibold text-gray-900 flex-1 truncate">{dep.summary}</span>
                <span className="text-sm text-gray-500">{dep.status}</span>
              </div>

              <div className="space-y-3">
                {/* Blocks */}
                {dep.blocks.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-red-700 mb-1">{t('pmBlocks')}</h4>
                    <div className="space-y-1">
                      {dep.blocks.map(b => (
                        <div key={b.key} className="flex items-center gap-2 pl-4 text-sm">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          <span className="font-mono text-gray-500">{b.key}</span>
                          <span className="text-gray-700 truncate">{b.summary}</span>
                          <span className="text-xs text-gray-400 ml-auto">{b.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Blocked By */}
                {dep.blockedBy.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-orange-700 mb-1">{t('pmBlockedBy')}</h4>
                    <div className="space-y-1">
                      {dep.blockedBy.map(b => (
                        <div key={b.key} className="flex items-center gap-2 pl-4 text-sm">
                          <span className="w-2 h-2 rounded-full bg-orange-500" />
                          <span className="font-mono text-gray-500">{b.key}</span>
                          <span className="text-gray-700 truncate">{b.summary}</span>
                          <span className="text-xs text-gray-400 ml-auto">{b.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Relates To */}
                {dep.relatesTo.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-blue-700 mb-1">{t('pmRelatesTo')}</h4>
                    <div className="space-y-1">
                      {dep.relatesTo.map((b, idx) => (
                        <div key={`${b.key}-${idx}`} className="flex items-center gap-2 pl-4 text-sm">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          <span className="font-mono text-gray-500">{b.key}</span>
                          <span className="text-gray-700 truncate">{b.summary}</span>
                          <span className="text-xs text-gray-400 ml-auto">{b.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
