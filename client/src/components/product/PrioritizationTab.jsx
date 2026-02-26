import { useState, useMemo } from 'react';
import { Bubble, Doughnut } from 'react-chartjs-2';
import FieldMappingConfig from './FieldMappingConfig';
import { IssueTypeIcon, JiraLink } from './JiraIcons';

const MOSCOW_COLORS = {
  'Must Have': { bg: 'rgba(239, 68, 68, 0.7)', border: 'rgb(239, 68, 68)', label: 'bg-red-100 text-red-700' },
  'Should Have': { bg: 'rgba(245, 158, 11, 0.7)', border: 'rgb(245, 158, 11)', label: 'bg-amber-100 text-amber-700' },
  'Could Have': { bg: 'rgba(59, 130, 246, 0.7)', border: 'rgb(59, 130, 246)', label: 'bg-blue-100 text-blue-700' },
  "Won't Have": { bg: 'rgba(156, 163, 175, 0.7)', border: 'rgb(156, 163, 175)', label: 'bg-gray-100 text-gray-600' }
};

const QUADRANT_COLORS = {
  quickWins: { bg: 'rgba(34, 197, 94, 0.5)', border: 'rgb(34, 197, 94)' },
  bigBets: { bg: 'rgba(59, 130, 246, 0.5)', border: 'rgb(59, 130, 246)' },
  fillIns: { bg: 'rgba(245, 158, 11, 0.5)', border: 'rgb(245, 158, 11)' },
  moneyPit: { bg: 'rgba(239, 68, 68, 0.5)', border: 'rgb(239, 68, 68)' }
};

const QUADRANT_INFO = {
  quickWins: { label: 'Quick Wins', desc: 'High value, low effort', color: 'text-green-600', bg: 'bg-green-50' },
  bigBets: { label: 'Big Bets', desc: 'High value, high effort', color: 'text-blue-600', bg: 'bg-blue-50' },
  fillIns: { label: 'Fill-ins', desc: 'Low value, low effort', color: 'text-amber-600', bg: 'bg-amber-50' },
  moneyPit: { label: 'Money Pit', desc: 'Low value, high effort', color: 'text-red-600', bg: 'bg-red-50' }
};

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, idx)];
}

// Seeded jitter to spread overlapping points
function jitter(val, range, seed) {
  const hash = ((seed * 9301 + 49297) % 233280) / 233280;
  return val + (hash - 0.5) * range;
}

export default function PrioritizationTab({ credentials, selectedBoards, epicData, prioritizationData }) {
  const jiraBaseUrl = credentials?.jiraUrl?.replace(/\/$/, '') || '';
  const priData = prioritizationData || null;
  const [fieldMappings, setFieldMappings] = useState(null);
  const [sortBy, setSortBy] = useState('wsjf');
  const [sortDir, setSortDir] = useState('desc');

  const handleMappingsChange = (newMappings) => {
    setFieldMappings(newMappings);
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortDir('desc');
    }
  };

  if (!priData) {
    return (
      <div className="card text-center py-16">
        <p className="text-gray-500">No prioritization data available. Click "Refresh from Jira" to load.</p>
      </div>
    );
  }

  const { epics, moscowDistribution, quadrants, medianEffort, medianValue } = priData;

  // Sort epics
  const sortedEpics = [...epics].sort((a, b) => {
    const dir = sortDir === 'desc' ? -1 : 1;
    switch (sortBy) {
      case 'wsjf': return dir * (a.wsjf.wsjfScore - b.wsjf.wsjfScore);
      case 'value': return dir * (a.value - b.value);
      case 'effort': return dir * (a.effort - b.effort);
      case 'moscow': return dir * a.moscow.localeCompare(b.moscow);
      default: return 0;
    }
  });

  // Use Cost of Delay as Y axis (much more variance than just businessValue)
  const chartEpics = useMemo(() => {
    return epics.filter(e => e.effort > 0);
  }, [epics]);

  // Cap effort outliers at P90
  const effortArr = chartEpics.map(e => e.effort);
  const effortP90 = percentile(effortArr, 90);
  const effortCap = Math.max(effortP90 * 1.3, 20);

  // Use CoD for Y axis
  const codArr = chartEpics.map(e => e.wsjf.costOfDelay);
  const medianCoD = codArr.length > 0
    ? [...codArr].sort((a, b) => a - b)[Math.floor(codArr.length / 2)]
    : 7;
  const medianEffortCapped = Math.min(medianEffort, effortCap);

  // Bubble radius from child count (scaled 4-16)
  const maxChildren = Math.max(...chartEpics.map(e => e.wsjf.jobSize || 1), 1);
  const bubbleRadius = (epic) => {
    const size = epic.wsjf.jobSize || 1;
    return Math.max(4, Math.min(16, 4 + (size / maxChildren) * 12));
  };

  // Build bubble data with jitter and capping
  const buildPoint = (e, idx) => ({
    x: jitter(Math.min(e.effort, effortCap), effortCap * 0.03, idx * 7 + 1),
    y: jitter(e.wsjf.costOfDelay, 0.4, idx * 13 + 3),
    r: bubbleRadius(e),
    epic: e,
    isCapped: e.effort > effortCap
  });

  const bubbleData = {
    datasets: [
      {
        label: 'Quick Wins',
        data: chartEpics
          .map((e, i) => ({ e, i }))
          .filter(({ e }) => e.wsjf.costOfDelay >= medianCoD && e.effort < medianEffort)
          .map(({ e, i }) => buildPoint(e, i)),
        backgroundColor: 'rgba(34, 197, 94, 0.55)',
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 1.5
      },
      {
        label: 'Big Bets',
        data: chartEpics
          .map((e, i) => ({ e, i }))
          .filter(({ e }) => e.wsjf.costOfDelay >= medianCoD && e.effort >= medianEffort)
          .map(({ e, i }) => buildPoint(e, i)),
        backgroundColor: 'rgba(59, 130, 246, 0.55)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1.5
      },
      {
        label: 'Fill-ins',
        data: chartEpics
          .map((e, i) => ({ e, i }))
          .filter(({ e }) => e.wsjf.costOfDelay < medianCoD && e.effort < medianEffort)
          .map(({ e, i }) => buildPoint(e, i)),
        backgroundColor: 'rgba(245, 158, 11, 0.55)',
        borderColor: 'rgb(245, 158, 11)',
        borderWidth: 1.5
      },
      {
        label: 'Money Pit',
        data: chartEpics
          .map((e, i) => ({ e, i }))
          .filter(({ e }) => e.wsjf.costOfDelay < medianCoD && e.effort >= medianEffort)
          .map(({ e, i }) => buildPoint(e, i)),
        backgroundColor: 'rgba(239, 68, 68, 0.55)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1.5
      }
    ]
  };

  const bubbleOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const epic = ctx.raw.epic;
            const lines = [
              `${epic.key}: ${epic.summary.substring(0, 50)}${epic.summary.length > 50 ? '...' : ''}`,
              `Effort: ${epic.effort} SP | CoD: ${epic.wsjf.costOfDelay} | WSJF: ${epic.wsjf.wsjfScore}`,
              `Value: ${epic.wsjf.businessValue} | Criticality: ${epic.wsjf.timeCriticality} | Risk: ${epic.wsjf.riskReduction}`
            ];
            if (ctx.raw.isCapped) lines.push(`(Effort capped for display, actual: ${epic.effort} SP)`);
            return lines;
          }
        }
      },
      annotation: {
        annotations: {
          // Quadrant background colors
          quadTL: {
            type: 'box', xMin: 0, xMax: medianEffortCapped, yMin: medianCoD, yMax: 'end',
            backgroundColor: 'rgba(34, 197, 94, 0.06)', borderWidth: 0
          },
          quadTR: {
            type: 'box', xMin: medianEffortCapped, xMax: 'end', yMin: medianCoD, yMax: 'end',
            backgroundColor: 'rgba(59, 130, 246, 0.06)', borderWidth: 0
          },
          quadBL: {
            type: 'box', xMin: 0, xMax: medianEffortCapped, yMin: 0, yMax: medianCoD,
            backgroundColor: 'rgba(245, 158, 11, 0.06)', borderWidth: 0
          },
          quadBR: {
            type: 'box', xMin: medianEffortCapped, xMax: 'end', yMin: 0, yMax: medianCoD,
            backgroundColor: 'rgba(239, 68, 68, 0.06)', borderWidth: 0
          },
          // Quadrant divider lines
          vLine: {
            type: 'line', xMin: medianEffortCapped, xMax: medianEffortCapped,
            borderColor: 'rgba(0,0,0,0.2)', borderDash: [6, 4], borderWidth: 1.5,
            label: { display: true, content: `${medianEffort} SP`, position: 'end', font: { size: 9 }, color: 'rgba(0,0,0,0.4)' }
          },
          hLine: {
            type: 'line', yMin: medianCoD, yMax: medianCoD,
            borderColor: 'rgba(0,0,0,0.2)', borderDash: [6, 4], borderWidth: 1.5,
            label: { display: true, content: `CoD ${medianCoD}`, position: 'end', font: { size: 9 }, color: 'rgba(0,0,0,0.4)' }
          },
          // Quadrant labels
          labelTL: {
            type: 'label', xValue: medianEffortCapped * 0.25, yValue: medianCoD + (Math.max(...codArr, medianCoD + 1) - medianCoD) * 0.85,
            content: 'QUICK WINS', font: { size: 11, weight: 'bold' }, color: 'rgba(34, 197, 94, 0.3)'
          },
          labelTR: {
            type: 'label', xValue: medianEffortCapped + (effortCap - medianEffortCapped) * 0.5, yValue: medianCoD + (Math.max(...codArr, medianCoD + 1) - medianCoD) * 0.85,
            content: 'BIG BETS', font: { size: 11, weight: 'bold' }, color: 'rgba(59, 130, 246, 0.3)'
          },
          labelBL: {
            type: 'label', xValue: medianEffortCapped * 0.25, yValue: medianCoD * 0.2,
            content: 'FILL-INS', font: { size: 11, weight: 'bold' }, color: 'rgba(245, 158, 11, 0.3)'
          },
          labelBR: {
            type: 'label', xValue: medianEffortCapped + (effortCap - medianEffortCapped) * 0.5, yValue: medianCoD * 0.2,
            content: 'MONEY PIT', font: { size: 11, weight: 'bold' }, color: 'rgba(239, 68, 68, 0.3)'
          }
        }
      }
    },
    scales: {
      x: {
        title: { display: true, text: 'Effort (Story Points)', font: { size: 12 } },
        grid: { color: 'rgba(0,0,0,0.04)' },
        beginAtZero: true,
        max: Math.ceil(effortCap)
      },
      y: {
        title: { display: true, text: 'Cost of Delay (Value + Criticality + Risk)', font: { size: 12 } },
        grid: { color: 'rgba(0,0,0,0.04)' },
        beginAtZero: true
      }
    }
  };

  // MoSCoW doughnut
  const moscowLabels = Object.keys(moscowDistribution);
  const moscowData = {
    labels: moscowLabels,
    datasets: [{
      data: moscowLabels.map(l => moscowDistribution[l]),
      backgroundColor: moscowLabels.map(l => MOSCOW_COLORS[l]?.bg || 'rgba(156,163,175,0.5)'),
      borderColor: moscowLabels.map(l => MOSCOW_COLORS[l]?.border || 'rgb(156,163,175)'),
      borderWidth: 2
    }]
  };

  const moscowOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 16 } }
    },
    cutout: '60%'
  };

  const sortIcon = (col) => {
    if (sortBy !== col) return '↕';
    return sortDir === 'desc' ? '↓' : '↑';
  };

  const hasLowValueVariance = new Set(epics.map(e => e.value)).size <= 2;

  return (
    <div className="space-y-6">
      {/* Field Mapping */}
      <FieldMappingConfig
        credentials={credentials}
        onMappingsChange={handleMappingsChange}
      />

      {/* Low-variance warning */}
      {hasLowValueVariance && !fieldMappings && (
        <div className="card bg-amber-50 border-amber-200">
          <div className="flex items-start gap-2">
            <span className="text-amber-500 text-lg">!</span>
            <div>
              <p className="text-sm font-medium text-amber-800">Limited data differentiation</p>
              <p className="text-xs text-amber-600 mt-1">
                Business Value has low variance (most epics share the same Jira priority).
                The chart uses Cost of Delay (composite) as the Y axis for better spread.
                Configure custom field mappings above for more accurate results.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quadrant Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(QUADRANT_INFO).map(([key, info]) => (
          <div key={key} className={`card text-center ${info.bg}`}>
            <p className={`text-2xl font-bold ${info.color}`}>{quadrants[key]}</p>
            <p className="text-xs font-medium text-gray-700 mt-1">{info.label}</p>
            <p className="text-xs text-gray-400">{info.desc}</p>
          </div>
        ))}
      </div>

      {/* Value vs Effort Matrix */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Value vs Effort Matrix</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {chartEpics.length} epics with effort data · Bubble size = job size
            </p>
          </div>
        </div>
        <div style={{ height: '450px' }}>
          <Bubble data={bubbleData} options={bubbleOptions} />
        </div>
        {effortArr.some(e => e > effortCap) && (
          <p className="text-xs text-gray-400 mt-2 text-center">
            Effort axis capped at {Math.ceil(effortCap)} SP (outliers truncated to edge)
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* WSJF Table */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Epic WSJF Ranking</h3>
            <span className="text-xs text-gray-400">{epics.length} active epics</span>
          </div>

          <div className="overflow-x-auto" style={{ maxHeight: '500px', overflowY: 'auto' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 w-8">#</th>
                  <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Epic</th>
                  <th
                    className="text-center py-2 px-2 text-xs font-medium text-gray-500 cursor-pointer hover:text-purple-600 w-16"
                    onClick={() => handleSort('wsjf')}
                  >
                    WSJF {sortIcon('wsjf')}
                  </th>
                  <th
                    className="text-center py-2 px-2 text-xs font-medium text-gray-500 cursor-pointer hover:text-purple-600 w-14"
                    onClick={() => handleSort('value')}
                  >
                    Value {sortIcon('value')}
                  </th>
                  <th
                    className="text-center py-2 px-2 text-xs font-medium text-gray-500 cursor-pointer hover:text-purple-600 w-14"
                    onClick={() => handleSort('effort')}
                  >
                    Effort {sortIcon('effort')}
                  </th>
                  <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 w-12">CoD</th>
                  <th
                    className="text-left py-2 px-2 text-xs font-medium text-gray-500 cursor-pointer hover:text-purple-600 w-24"
                    onClick={() => handleSort('moscow')}
                  >
                    MoSCoW {sortIcon('moscow')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedEpics.map((epic, idx) => (
                  <tr key={epic.key} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-2 text-xs text-gray-400">{idx + 1}</td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1.5">
                        <IssueTypeIcon type="Epic" size={13} />
                        <JiraLink issueKey={epic.key} jiraBaseUrl={jiraBaseUrl} className="text-xs font-medium text-purple-700" />
                        <span className="text-xs text-gray-600 truncate">
                          {epic.summary.length > 40 ? epic.summary.substring(0, 40) + '...' : epic.summary}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className="font-bold text-purple-700 text-sm">{epic.wsjf.wsjfScore}</span>
                    </td>
                    <td className="py-2 px-2 text-center text-xs text-gray-600">{epic.wsjf.businessValue}</td>
                    <td className="py-2 px-2 text-center text-xs text-gray-600" title={epic.effortSource === 'child_count' ? 'Estimated from child issue count' : 'Story Points'}>
                      {epic.effort || '-'}
                      {epic.effortSource === 'child_count' && epic.effort > 0 && <span className="text-gray-300 ml-0.5">*</span>}
                    </td>
                    <td className="py-2 px-2 text-center text-xs text-gray-600">{epic.wsjf.costOfDelay}</td>
                    <td className="py-2 px-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MOSCOW_COLORS[epic.moscow]?.label || 'bg-gray-100 text-gray-600'}`}>
                        {epic.moscow}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* MoSCoW Distribution */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">MoSCoW Distribution</h3>
          <div style={{ height: '250px' }}>
            <Doughnut data={moscowData} options={moscowOptions} />
          </div>
          <div className="mt-4 space-y-2">
            {moscowLabels.map(label => (
              <div key={label} className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MOSCOW_COLORS[label]?.label}`}>
                  {label}
                </span>
                <span className="text-sm font-medium text-gray-700">{moscowDistribution[label]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* WSJF Formula Explanation */}
      <div className="card bg-purple-50 border-purple-200">
        <h4 className="text-sm font-semibold text-purple-800 mb-2">How WSJF is calculated</h4>
        <div className="text-xs text-purple-700 space-y-1">
          <p><strong>WSJF</strong> = Cost of Delay / Job Size</p>
          <p><strong>Cost of Delay</strong> = Business Value + Time Criticality + Risk Reduction</p>
          {!fieldMappings ? (
            <p className="text-purple-500 mt-2">
              Using composite fallback: Business Value from priority + child count + progress + health,
              Time Criticality from due date proximity, Job Size from story points.
              Configure custom field mapping above for more accurate scores.
            </p>
          ) : (
            <p className="text-purple-500 mt-2">
              Using custom field mappings from your Jira instance.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
