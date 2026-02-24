import { useState, useMemo } from 'react';

const HEALTH_COLORS = {
  'on-track': { bg: '#22c55e', bgLight: '#dcfce7', text: '#15803d' },
  'at-risk': { bg: '#f59e0b', bgLight: '#fef3c7', text: '#b45309' },
  'blocked': { bg: '#ef4444', bgLight: '#fee2e2', text: '#dc2626' },
  'done': { bg: '#9ca3af', bgLight: '#f3f4f6', text: '#6b7280' },
  'no-data': { bg: '#d1d5db', bgLight: '#f9fafb', text: '#9ca3af' }
};

const STATUS_COLORS = {
  done: '#22c55e',
  indeterminate: '#3b82f6',
  new: '#9ca3af'
};

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export default function EpicTimelineChart({ epics, initiatives = [] }) {
  const [collapsed, setCollapsed] = useState(new Set());
  const [showDone, setShowDone] = useState(false);
  const [hovered, setHovered] = useState(null);

  const today = Date.now();

  // Build the tree: initiatives → epics, plus unlinked epics
  const { tree, timeRange } = useMemo(() => {
    const filtered = showDone ? epics : epics.filter(e => e.statusCategory !== 'done');

    // Group epics by parent initiative key
    const epicsByInitiative = new Map();
    const unlinked = [];

    for (const epic of filtered) {
      if (!epic.created) continue;
      const parentKey = epic.parentKey;
      if (parentKey) {
        if (!epicsByInitiative.has(parentKey)) epicsByInitiative.set(parentKey, []);
        epicsByInitiative.get(parentKey).push(epic);
      } else {
        unlinked.push(epic);
      }
    }

    // Build ordered tree
    const tree = [];
    let minTs = Infinity, maxTs = -Infinity;

    const processEpic = (epic) => {
      const start = new Date(epic.created).getTime();
      const end = epic.resolutionDate
        ? new Date(epic.resolutionDate).getTime()
        : epic.dueDate
          ? new Date(epic.dueDate).getTime()
          : today + 30 * 24 * 3600 * 1000;
      if (start < minTs) minTs = start;
      if (end > maxTs) maxTs = end;
      return { start, end };
    };

    // Add initiatives with their epics
    for (const initiative of initiatives) {
      if (initiative.key === '_unlinked') continue;
      const childEpics = epicsByInitiative.get(initiative.key) || [];
      if (childEpics.length === 0 && !showDone) continue;

      // Calculate initiative time range from its epics
      let initStart = Infinity, initEnd = -Infinity;
      const epicRows = [];

      for (const epic of childEpics) {
        const { start, end } = processEpic(epic);
        if (start < initStart) initStart = start;
        if (end > initEnd) initEnd = end;
        epicRows.push({ ...epic, _start: start, _end: end, _type: 'epic' });
      }

      if (initStart === Infinity) {
        initStart = initiative.created ? new Date(initiative.created).getTime() : today;
        initEnd = initiative.dueDate ? new Date(initiative.dueDate).getTime() : today;
      }

      tree.push({
        key: initiative.key,
        summary: initiative.summary,
        health: initiative.health || 'no-data',
        progress: initiative.progress || 0,
        status: initiative.status,
        _start: initStart,
        _end: initEnd,
        _type: 'initiative',
        _children: epicRows
      });
    }

    // Add unlinked epics
    if (unlinked.length > 0) {
      const epicRows = [];
      for (const epic of unlinked) {
        const { start, end } = processEpic(epic);
        epicRows.push({ ...epic, _start: start, _end: end, _type: 'epic' });
      }
      tree.push({
        key: '_unlinked',
        summary: 'Epics without Initiative',
        health: 'no-data',
        progress: 0,
        _start: Math.min(...epicRows.map(e => e._start)),
        _end: Math.max(...epicRows.map(e => e._end)),
        _type: 'initiative',
        _children: epicRows
      });
    }

    // Add orphaned epics from initiatives that don't exist
    const knownInitKeys = new Set(initiatives.map(i => i.key));
    for (const [parentKey, childEpics] of epicsByInitiative) {
      if (knownInitKeys.has(parentKey)) continue;
      const epicRows = [];
      for (const epic of childEpics) {
        const { start, end } = processEpic(epic);
        epicRows.push({ ...epic, _start: start, _end: end, _type: 'epic' });
      }
      tree.push({
        key: parentKey,
        summary: `Initiative ${parentKey}`,
        health: 'no-data',
        progress: 0,
        _start: Math.min(...epicRows.map(e => e._start)),
        _end: Math.max(...epicRows.map(e => e._end)),
        _type: 'initiative',
        _children: epicRows
      });
    }

    if (minTs === Infinity) { minTs = today - 90 * 24 * 3600 * 1000; maxTs = today + 90 * 24 * 3600 * 1000; }
    const padding = (maxTs - minTs) * 0.05;
    return { tree, timeRange: { min: minTs - padding, max: maxTs + padding } };
  }, [epics, initiatives, showDone, today]);

  // Flatten visible rows
  const visibleRows = useMemo(() => {
    const rows = [];
    for (const node of tree) {
      rows.push(node);
      if (!collapsed.has(node.key) && node._children) {
        for (const child of node._children) {
          rows.push(child);
        }
      }
    }
    return rows;
  }, [tree, collapsed]);

  const toggleCollapse = (key) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const totalRange = timeRange.max - timeRange.min;
  const toPercent = (ts) => ((ts - timeRange.min) / totalRange) * 100;
  const todayPercent = toPercent(today);

  // Generate month markers
  const monthMarkers = useMemo(() => {
    const markers = [];
    const d = new Date(timeRange.min);
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    while (d.getTime() < timeRange.max) {
      markers.push({ ts: d.getTime(), label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) });
      d.setMonth(d.getMonth() + 1);
    }
    return markers;
  }, [timeRange]);

  const totalEpics = epics.filter(e => showDone || e.statusCategory !== 'done').length;

  if (visibleRows.length === 0) {
    return (
      <div className="card text-center py-8">
        <p className="text-gray-400 text-sm">No epics with date information available</p>
      </div>
    );
  }

  const ROW_HEIGHT = 32;
  const HEADER_HEIGHT = 36;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Epic Roadmap Timeline</h3>
          <p className="text-xs text-gray-400 mt-0.5">{totalEpics} epics across {tree.length} groups</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showDone} onChange={() => setShowDone(!showDone)}
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
            Show completed
          </label>
          <div className="flex gap-3 text-xs">
            {Object.entries(HEALTH_COLORS).filter(([k]) => k !== 'no-data').map(([key, colors]) => (
              <span key={key} className="flex items-center gap-1">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: colors.bg }}></span>
                {key.replace('-', ' ')}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <div className="min-w-[900px]">
          {/* Header with month markers */}
          <div className="flex border-b border-gray-200 bg-gray-50" style={{ height: HEADER_HEIGHT }}>
            <div className="w-[320px] min-w-[320px] px-3 flex items-center text-xs font-medium text-gray-500 border-r border-gray-200">
              Initiative / Epic
            </div>
            <div className="flex-1 relative">
              {monthMarkers.map(m => (
                <div key={m.ts} className="absolute top-0 h-full flex items-center"
                  style={{ left: `${toPercent(m.ts)}%` }}>
                  <span className="text-[10px] text-gray-400 -translate-x-1/2">{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div style={{ height: visibleRows.length * ROW_HEIGHT }} className="relative">
            {/* Grid lines */}
            {monthMarkers.map(m => (
              <div key={m.ts} className="absolute top-0 h-full border-l border-gray-100"
                style={{ left: `calc(320px + ${toPercent(m.ts)}% * (100% - 320px) / 100)` }} />
            ))}

            {/* Today line */}
            <div className="absolute top-0 h-full border-l-2 border-purple-400 z-10"
              style={{ left: `calc(320px + (100% - 320px) * ${todayPercent / 100})` }}>
              <span className="absolute -top-0 left-1 text-[9px] text-purple-500 font-medium bg-white px-0.5">Today</span>
            </div>

            {visibleRows.map((row, idx) => {
              const isInit = row._type === 'initiative';
              const isCollapsedNode = isInit && collapsed.has(row.key);
              const hasChildren = isInit && row._children && row._children.length > 0;
              const barLeft = toPercent(row._start);
              const barWidth = Math.max(toPercent(row._end) - barLeft, 0.5);
              const colors = HEALTH_COLORS[row.health] || HEALTH_COLORS['no-data'];
              const isHovered = hovered === row.key;

              return (
                <div key={row.key + '-' + idx} className="flex absolute w-full"
                  style={{ top: idx * ROW_HEIGHT, height: ROW_HEIGHT }}>
                  {/* Label column */}
                  <div
                    className={`w-[320px] min-w-[320px] flex items-center gap-1 px-2 border-r border-gray-100 truncate cursor-pointer hover:bg-gray-50 ${
                      isInit ? 'bg-gray-50 font-medium' : 'pl-7'
                    }`}
                    style={{ borderBottom: '1px solid #f3f4f6' }}
                    onClick={() => isInit && hasChildren && toggleCollapse(row.key)}
                    title={row.summary}
                  >
                    {isInit && hasChildren && (
                      <span className="text-[10px] text-gray-400 w-3">{isCollapsedNode ? '▶' : '▼'}</span>
                    )}
                    {isInit && !hasChildren && <span className="w-3" />}
                    {isInit ? (
                      <span className="text-xs text-gray-700 truncate">
                        <span className="text-purple-600 font-medium mr-1">{row.key !== '_unlinked' ? row.key : '—'}</span>
                        {row.summary}
                        <span className="ml-1 text-gray-400 font-normal">({row._children?.length || 0})</span>
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600 truncate">
                        <span className="text-purple-500 mr-1">{row.key}</span>
                        {row.summary}
                      </span>
                    )}
                  </div>

                  {/* Timeline bar area */}
                  <div className="flex-1 relative" style={{ borderBottom: '1px solid #f3f4f6' }}
                    onMouseEnter={() => setHovered(row.key)}
                    onMouseLeave={() => setHovered(null)}>
                    {/* The bar */}
                    <div
                      className="absolute top-1 rounded transition-all"
                      style={{
                        left: `${barLeft}%`,
                        width: `${barWidth}%`,
                        height: isInit ? ROW_HEIGHT - 10 : ROW_HEIGHT - 12,
                        top: isInit ? 5 : 6,
                        backgroundColor: isInit ? colors.bgLight : colors.bg,
                        border: isInit ? `2px solid ${colors.bg}` : 'none',
                        opacity: isHovered ? 1 : 0.85
                      }}
                    >
                      {/* Progress fill inside bar */}
                      {row.progress > 0 && row.progress < 100 && !isInit && (
                        <div className="absolute left-0 top-0 h-full rounded-l"
                          style={{
                            width: `${row.progress}%`,
                            backgroundColor: colors.bg,
                            opacity: 0.4
                          }} />
                      )}
                    </div>

                    {/* Tooltip */}
                    {isHovered && (
                      <div className="absolute z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-xs"
                        style={{
                          left: `${Math.min(barLeft + barWidth / 2, 70)}%`,
                          top: ROW_HEIGHT + 2,
                          minWidth: 200
                        }}>
                        <div className="font-medium text-gray-800 mb-1">{row.key} — {row.summary}</div>
                        <div className="text-gray-500">{formatDate(row._start)} → {formatDate(row._end)}</div>
                        {row.progress !== undefined && (
                          <div className="flex items-center gap-2 mt-1">
                            <span>Progress: {row.progress}%</span>
                            {row.health && <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.bgLight, color: colors.text }}>{row.health}</span>}
                          </div>
                        )}
                        {isInit && row._children && (
                          <div className="text-gray-400 mt-1">{row._children.length} epics</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
