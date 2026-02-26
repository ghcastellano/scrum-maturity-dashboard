import { useState, useMemo, useRef, useCallback } from 'react';
import { IssueTypeIcon, JiraLink } from './JiraIcons';

const HEALTH_COLORS = {
  'on-track': { bg: '#22c55e', bgLight: '#dcfce7', text: '#15803d' },
  'at-risk': { bg: '#f59e0b', bgLight: '#fef3c7', text: '#b45309' },
  'blocked': { bg: '#ef4444', bgLight: '#fee2e2', text: '#dc2626' },
  'done': { bg: '#9ca3af', bgLight: '#f3f4f6', text: '#6b7280' },
  'no-data': { bg: '#d1d5db', bgLight: '#f9fafb', text: '#9ca3af' }
};

const DAY = 24 * 3600 * 1000;
const MONTH = 30 * DAY;
const QUARTER = 90 * DAY;

const ZOOM_PRESETS = [
  { label: '3M', range: 3 * MONTH },
  { label: '6M', range: 6 * MONTH },
  { label: '1Y', range: 12 * MONTH },
  { label: '2Y', range: 24 * MONTH },
  { label: 'All', range: null }
];

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export default function EpicTimelineChart({ epics, initiatives = [], jiraBaseUrl = '' }) {
  const [collapsed, setCollapsed] = useState(null); // null = auto (collapse all on large datasets)
  const [hideDone, setHideDone] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [zoomPreset, setZoomPreset] = useState('1Y');
  const [search, setSearch] = useState('');
  const scrollRef = useRef(null);

  const today = Date.now();

  // Build the tree: initiatives → epics, plus unlinked epics
  const { tree, fullTimeRange } = useMemo(() => {
    const filtered = hideDone ? epics.filter(e => e.statusCategory !== 'done') : epics;

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

    const tree = [];
    let minTs = Infinity, maxTs = -Infinity;

    const processEpic = (epic) => {
      // Prefer Jira Plans dates (targetStart/targetEnd), fallback to created/dueDate
      const start = epic.targetStart
        ? new Date(epic.targetStart).getTime()
        : new Date(epic.created).getTime();
      const end = epic.resolutionDate
        ? new Date(epic.resolutionDate).getTime()
        : epic.targetEnd
          ? new Date(epic.targetEnd).getTime()
          : epic.dueDate
            ? new Date(epic.dueDate).getTime()
            : today + 30 * DAY;
      if (start < minTs) minTs = start;
      if (end > maxTs) maxTs = end;
      return { start, end };
    };

    for (const initiative of initiatives) {
      if (initiative.key === '_unlinked') continue;
      const childEpics = epicsByInitiative.get(initiative.key) || [];
      if (childEpics.length === 0 && hideDone) continue;

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

    if (minTs === Infinity) { minTs = today - QUARTER; maxTs = today + QUARTER; }
    return { tree, fullTimeRange: { min: minTs, max: maxTs } };
  }, [epics, initiatives, hideDone, today]);

  // Auto-collapse: collapse all if >20 groups, or use explicit state
  const effectiveCollapsed = useMemo(() => {
    if (collapsed !== null) return collapsed;
    // Auto: collapse all for large datasets
    if (tree.length > 20) {
      return new Set(tree.map(n => n.key));
    }
    return new Set();
  }, [collapsed, tree]);

  // Calculate visible time range based on zoom
  const timeRange = useMemo(() => {
    const preset = ZOOM_PRESETS.find(p => p.label === zoomPreset);
    if (!preset || !preset.range) {
      // "All" mode
      const padding = (fullTimeRange.max - fullTimeRange.min) * 0.05;
      return { min: fullTimeRange.min - padding, max: fullTimeRange.max + padding };
    }
    const halfRange = preset.range / 2;
    return {
      min: today - halfRange,
      max: today + halfRange
    };
  }, [zoomPreset, fullTimeRange, today]);

  // Search filter on tree
  const filteredTree = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.toLowerCase();
    return tree.map(node => {
      const initMatch = node.summary.toLowerCase().includes(q) || node.key.toLowerCase().includes(q);
      const matchingChildren = (node._children || []).filter(
        c => c.summary.toLowerCase().includes(q) || c.key.toLowerCase().includes(q)
      );
      if (initMatch || matchingChildren.length > 0) {
        return {
          ...node,
          _children: initMatch ? node._children : matchingChildren
        };
      }
      return null;
    }).filter(Boolean);
  }, [tree, search]);

  // Flatten visible rows
  const visibleRows = useMemo(() => {
    const rows = [];
    for (const node of filteredTree) {
      rows.push(node);
      if (!effectiveCollapsed.has(node.key) && node._children) {
        for (const child of node._children) {
          rows.push(child);
        }
      }
    }
    return rows;
  }, [filteredTree, effectiveCollapsed]);

  const toggleCollapse = useCallback((key) => {
    setCollapsed(prev => {
      const base = prev !== null ? prev : (tree.length > 20 ? new Set(tree.map(n => n.key)) : new Set());
      const next = new Set(base);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, [tree]);

  const collapseAll = useCallback(() => {
    setCollapsed(new Set(tree.map(n => n.key)));
  }, [tree]);

  const expandAll = useCallback(() => {
    setCollapsed(new Set());
  }, []);

  const totalRange = timeRange.max - timeRange.min;
  const toPercent = (ts) => ((ts - timeRange.min) / totalRange) * 100;
  const todayPercent = toPercent(today);

  // Generate month/quarter markers (smart spacing)
  const monthMarkers = useMemo(() => {
    const markers = [];
    const rangeMonths = totalRange / MONTH;
    // If >24 months, show only quarters; if >48 months, show only years
    const stepMonths = rangeMonths > 48 ? 12 : rangeMonths > 24 ? 3 : rangeMonths > 12 ? 2 : 1;

    const d = new Date(timeRange.min);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    // Align to step boundary
    if (stepMonths >= 12) {
      d.setMonth(0);
      d.setFullYear(d.getFullYear() + 1);
    } else if (stepMonths >= 3) {
      const q = Math.ceil((d.getMonth() + 1) / 3);
      d.setMonth(q * 3);
    } else {
      d.setMonth(d.getMonth() + 1);
    }

    while (d.getTime() < timeRange.max) {
      const ts = d.getTime();
      const pct = toPercent(ts);
      if (pct >= 0 && pct <= 100) {
        let label;
        if (stepMonths >= 12) {
          label = d.getFullYear().toString();
        } else if (stepMonths >= 3) {
          label = `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear().toString().slice(2)}`;
        } else {
          label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        }
        markers.push({ ts, label, pct });
      }
      d.setMonth(d.getMonth() + stepMonths);
    }
    return markers;
  }, [timeRange, totalRange]);

  const totalEpics = epics.filter(e => !hideDone || e.statusCategory !== 'done').length;
  const totalExpanded = visibleRows.filter(r => r._type === 'epic').length;

  if (filteredTree.length === 0 && !search) {
    return (
      <div className="card text-center py-8">
        <p className="text-gray-400 text-sm">No epics with date information available</p>
      </div>
    );
  }

  const ROW_HEIGHT = 32;
  const HEADER_HEIGHT = 36;
  const MAX_VISIBLE_HEIGHT = 500;
  const contentHeight = visibleRows.length * ROW_HEIGHT;
  const needsScroll = contentHeight > MAX_VISIBLE_HEIGHT;

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Initiative & Epic Roadmap Timeline</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {tree.length} initiatives · {totalEpics} epics
            {totalExpanded > 0 && totalExpanded < totalEpics && ` · ${totalExpanded} visible`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs border border-gray-200 rounded-md px-2 py-1.5 w-36 text-gray-600 placeholder-gray-300"
          />
          {/* Show completed */}
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={hideDone} onChange={() => setHideDone(!hideDone)}
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
            Hide completed
          </label>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between mb-3">
        {/* Zoom presets */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400 mr-1">Zoom:</span>
          {ZOOM_PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => setZoomPreset(p.label)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                zoomPreset === p.label
                  ? 'bg-purple-100 text-purple-700 font-medium'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Expand/Collapse + Legend */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <button onClick={expandAll} className="text-xs text-gray-500 hover:text-purple-600 px-1">
              Expand All
            </button>
            <span className="text-gray-300">|</span>
            <button onClick={collapseAll} className="text-xs text-gray-500 hover:text-purple-600 px-1">
              Collapse All
            </button>
          </div>
          <div className="flex gap-2.5 text-xs">
            {Object.entries(HEALTH_COLORS).filter(([k]) => k !== 'no-data').map(([key, colors]) => (
              <span key={key} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: colors.bg }}></span>
                <span className="text-gray-500">{key.replace('-', ' ')}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Scrollable container (both axes) */}
        <div ref={scrollRef} style={{ maxHeight: MAX_VISIBLE_HEIGHT + HEADER_HEIGHT, overflow: 'auto' }}>
          <div style={{ minWidth: Math.max(900, monthMarkers.length * 120) }}>
            {/* Header with month markers */}
            <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-20" style={{ height: HEADER_HEIGHT }}>
              <div className="w-[300px] min-w-[300px] px-3 flex items-center text-xs font-medium text-gray-500 border-r border-gray-200 bg-gray-50">
                Initiative / Epic
              </div>
              <div className="flex-1 relative">
                {monthMarkers.map(m => (
                  <div key={m.ts} className="absolute top-0 h-full flex items-center"
                    style={{ left: `${m.pct}%` }}>
                    <span className="text-[10px] text-gray-400 -translate-x-1/2 whitespace-nowrap">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rows area */}
            <div style={{ height: contentHeight }} className="relative">
              {/* Grid lines */}
              {monthMarkers.map(m => (
                <div key={m.ts} className="absolute top-0 h-full border-l border-gray-100"
                  style={{ left: `calc(300px + (100% - 300px) * ${m.pct / 100})` }} />
              ))}

              {/* Today line */}
              {todayPercent >= 0 && todayPercent <= 100 && (
                <div className="absolute top-0 h-full border-l-2 border-purple-400 z-10"
                  style={{ left: `calc(300px + (100% - 300px) * ${todayPercent / 100})` }}>
                  <span className="absolute top-0 left-1 text-[9px] text-purple-500 font-medium bg-white px-0.5">Today</span>
                </div>
              )}

              {visibleRows.map((row, idx) => {
                const isInit = row._type === 'initiative';
                const isCollapsedNode = isInit && effectiveCollapsed.has(row.key);
                const hasChildren = isInit && row._children && row._children.length > 0;

                // Clamp bar to visible range
                const rawLeft = toPercent(row._start);
                const rawRight = toPercent(row._end);
                const barLeft = Math.max(rawLeft, 0);
                const barRight = Math.min(rawRight, 100);
                const barWidth = Math.max(barRight - barLeft, 0.3);
                const isVisible = barRight > 0 && rawLeft < 100;

                const colors = HEALTH_COLORS[row.health] || HEALTH_COLORS['no-data'];
                const isHovered = hovered === (row.key + '-' + idx);

                return (
                  <div key={row.key + '-' + idx} className="flex absolute w-full"
                    style={{ top: idx * ROW_HEIGHT, height: ROW_HEIGHT }}>
                    {/* Label column */}
                    <div
                      className={`w-[300px] min-w-[300px] flex items-center gap-1 px-2 border-r border-gray-100 truncate ${
                        isInit ? 'bg-gray-50/80 font-medium cursor-pointer hover:bg-gray-100' : 'pl-7'
                      }`}
                      style={{ borderBottom: '1px solid #f3f4f6' }}
                      onClick={() => isInit && hasChildren && toggleCollapse(row.key)}
                      title={`${row.key} — ${row.summary}`}
                    >
                      {isInit && hasChildren && (
                        <span className="text-[10px] text-gray-400 w-3 flex-shrink-0">{isCollapsedNode ? '▶' : '▼'}</span>
                      )}
                      {isInit && !hasChildren && <span className="w-3 flex-shrink-0" />}
                      {isInit ? (
                        <span className="text-xs text-gray-700 truncate inline-flex items-center gap-1">
                          <IssueTypeIcon type="Initiative" size={12} />
                          {row.key !== '_unlinked' ? (
                            <JiraLink issueKey={row.key} jiraBaseUrl={jiraBaseUrl} className="text-purple-600 font-medium" />
                          ) : '—'}
                          <span className="truncate">{row.summary}</span>
                          <span className="text-gray-400 font-normal shrink-0">({row._children?.length || 0})</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600 truncate inline-flex items-center gap-1">
                          <IssueTypeIcon type="Epic" size={12} />
                          <JiraLink issueKey={row.key} jiraBaseUrl={jiraBaseUrl} className="text-purple-500" />
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            row.health === 'done' ? 'bg-gray-400' :
                            row.health === 'on-track' ? 'bg-green-500' :
                            row.health === 'at-risk' ? 'bg-amber-500' :
                            row.health === 'blocked' ? 'bg-red-500' : 'bg-gray-300'
                          }`} title={row.health}></span>
                          <span className="truncate">{row.summary}</span>
                        </span>
                      )}
                    </div>

                    {/* Timeline bar area */}
                    <div className="flex-1 relative" style={{ borderBottom: '1px solid #f3f4f6' }}
                      onMouseEnter={() => setHovered(row.key + '-' + idx)}
                      onMouseLeave={() => setHovered(null)}>
                      {/* The bar */}
                      {isVisible && (
                        <div
                          className="absolute rounded transition-opacity"
                          style={{
                            left: `${barLeft}%`,
                            width: `${barWidth}%`,
                            height: isInit ? ROW_HEIGHT - 10 : ROW_HEIGHT - 14,
                            top: isInit ? 5 : 7,
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
                      )}

                      {/* Tooltip */}
                      {isHovered && (
                        <div className="absolute z-30 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 text-xs pointer-events-none"
                          style={{
                            left: `${Math.max(5, Math.min(barLeft + barWidth / 2, 65))}%`,
                            top: ROW_HEIGHT + 2,
                            minWidth: 220,
                            maxWidth: 320
                          }}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <IssueTypeIcon type={isInit ? 'Initiative' : 'Epic'} size={12} />
                            <span className="font-medium text-gray-800">{row.key}</span>
                            {row.status && (
                              <span className={`text-[9px] px-1 rounded ${
                                row.health === 'done' ? 'bg-green-100 text-green-700' :
                                row.health === 'blocked' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>{row.status}</span>
                            )}
                          </div>
                          <div className="text-gray-700 mb-1">{row.summary}</div>
                          <div className="text-gray-500">{formatDate(row._start)} → {formatDate(row._end)}</div>
                          {row.progress !== undefined && (
                            <div className="flex items-center gap-2 mt-1">
                              <span>Progress: {row.progress}%</span>
                              {row.health && (
                                <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.bgLight, color: colors.text }}>
                                  {row.health === 'no-data' ? 'no children' : row.health}
                                </span>
                              )}
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

        {/* Footer info */}
        {needsScroll && (
          <div className="bg-gray-50 border-t border-gray-200 px-3 py-1.5 text-xs text-gray-400 text-center">
            Showing {visibleRows.length} rows · Scroll to see more
          </div>
        )}
      </div>
    </div>
  );
}
