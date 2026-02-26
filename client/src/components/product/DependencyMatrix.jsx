import { IssueTypeIcon, JiraLink } from './JiraIcons';

export default function DependencyMatrix({ epics, jiraBaseUrl = '' }) {
  // Filter epics that have dependencies
  const epicsWithDeps = epics.filter(e =>
    e.dependencies.blocks.length > 0 ||
    e.dependencies.blockedBy.length > 0 ||
    e.dependencies.relatesTo.length > 0
  );

  if (epicsWithDeps.length === 0) {
    return (
      <div className="card text-center py-8">
        <p className="text-gray-400 text-sm">No dependencies found between epics</p>
      </div>
    );
  }

  const totalBlocking = epicsWithDeps.reduce((sum, e) => sum + e.dependencies.blocks.length, 0);
  const totalBlocked = epicsWithDeps.reduce((sum, e) => sum + e.dependencies.blockedBy.length, 0);
  const totalRelated = epicsWithDeps.reduce((sum, e) => sum + e.dependencies.relatesTo.length, 0);

  const healthBadge = (health) => {
    const colors = {
      'on-track': 'bg-green-100 text-green-700',
      'at-risk': 'bg-amber-100 text-amber-700',
      'blocked': 'bg-red-100 text-red-700',
      'done': 'bg-gray-100 text-gray-500',
      'no-data': 'bg-gray-50 text-gray-400'
    };
    return (
      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[health] || colors['no-data']}`}>
        {health}
      </span>
    );
  };

  const renderLinks = (links, type) => {
    if (links.length === 0) return <span className="text-gray-300 text-xs">-</span>;

    const colorMap = {
      blocks: 'text-amber-600 bg-amber-50',
      blockedBy: 'text-red-600 bg-red-50',
      relatesTo: 'text-blue-600 bg-blue-50'
    };
    const colorClass = colorMap[type] || colorMap.relatesTo;

    return (
      <div className="flex flex-wrap gap-1">
        {links.map((link, idx) => {
          const isDone = (link.status || '').toLowerCase().includes('done') ||
                         (link.status || '').toLowerCase().includes('closed');
          return (
            <JiraLink
              key={idx}
              issueKey={link.key}
              jiraBaseUrl={jiraBaseUrl}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${isDone ? 'bg-gray-100 text-gray-400 line-through' : colorClass}`}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Epic Dependencies</h3>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>{epicsWithDeps.length} epics with dependencies</span>
          <span className="text-amber-600">{totalBlocking} blocking</span>
          <span className="text-red-600">{totalBlocked} blocked</span>
          <span className="text-blue-600">{totalRelated} related</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Epic</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Health</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-amber-600 uppercase">Blocks</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-red-600 uppercase">Blocked By</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-blue-600 uppercase">Related</th>
            </tr>
          </thead>
          <tbody>
            {epicsWithDeps.map(epic => (
              <tr key={epic.key} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3">
                  <div className="flex items-center gap-1.5">
                    <IssueTypeIcon type="Epic" size={14} />
                    <JiraLink issueKey={epic.key} jiraBaseUrl={jiraBaseUrl} className="font-medium text-purple-700" />
                    <span className="text-gray-500 text-xs truncate">
                      {epic.summary.length > 40 ? epic.summary.substring(0, 40) + '...' : epic.summary}
                    </span>
                  </div>
                </td>
                <td className="py-2 px-3">{healthBadge(epic.health)}</td>
                <td className="py-2 px-3">{renderLinks(epic.dependencies.blocks, 'blocks')}</td>
                <td className="py-2 px-3">{renderLinks(epic.dependencies.blockedBy, 'blockedBy')}</td>
                <td className="py-2 px-3">{renderLinks(epic.dependencies.relatesTo, 'relatesTo')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
