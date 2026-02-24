import { useState } from 'react';
import { Scatter, Doughnut } from 'react-chartjs-2';
import FieldMappingConfig from './FieldMappingConfig';

const MOSCOW_COLORS = {
  'Must Have': { bg: 'rgba(239, 68, 68, 0.7)', border: 'rgb(239, 68, 68)', label: 'bg-red-100 text-red-700' },
  'Should Have': { bg: 'rgba(245, 158, 11, 0.7)', border: 'rgb(245, 158, 11)', label: 'bg-amber-100 text-amber-700' },
  'Could Have': { bg: 'rgba(59, 130, 246, 0.7)', border: 'rgb(59, 130, 246)', label: 'bg-blue-100 text-blue-700' },
  "Won't Have": { bg: 'rgba(156, 163, 175, 0.7)', border: 'rgb(156, 163, 175)', label: 'bg-gray-100 text-gray-600' }
};

const QUADRANT_INFO = {
  quickWins: { label: 'Quick Wins', desc: 'High value, low effort', color: 'text-green-600', bg: 'bg-green-50' },
  bigBets: { label: 'Big Bets', desc: 'High value, high effort', color: 'text-blue-600', bg: 'bg-blue-50' },
  fillIns: { label: 'Fill-ins', desc: 'Low value, low effort', color: 'text-amber-600', bg: 'bg-amber-50' },
  moneyPit: { label: 'Money Pit', desc: 'Low value, high effort', color: 'text-red-600', bg: 'bg-red-50' }
};

export default function PrioritizationTab({ credentials, selectedBoards, epicData, prioritizationData }) {
  // Use pre-loaded data from parent (no separate API call needed)
  const priData = prioritizationData || null;
  const [fieldMappings, setFieldMappings] = useState(null);
  const [sortBy, setSortBy] = useState('wsjf'); // 'wsjf' | 'value' | 'effort' | 'moscow'
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

  // Value vs Effort scatter chart
  const scatterData = {
    datasets: [
      {
        label: 'Quick Wins',
        data: epics.filter(e => e.value >= medianValue && e.effort < medianEffort)
          .map(e => ({ x: e.effort, y: e.value, epic: e })),
        backgroundColor: 'rgba(34, 197, 94, 0.6)',
        borderColor: 'rgb(34, 197, 94)',
        pointRadius: 8,
        pointHoverRadius: 10
      },
      {
        label: 'Big Bets',
        data: epics.filter(e => e.value >= medianValue && e.effort >= medianEffort)
          .map(e => ({ x: e.effort, y: e.value, epic: e })),
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgb(59, 130, 246)',
        pointRadius: 8,
        pointHoverRadius: 10
      },
      {
        label: 'Fill-ins',
        data: epics.filter(e => e.value < medianValue && e.effort < medianEffort)
          .map(e => ({ x: e.effort, y: e.value, epic: e })),
        backgroundColor: 'rgba(245, 158, 11, 0.6)',
        borderColor: 'rgb(245, 158, 11)',
        pointRadius: 8,
        pointHoverRadius: 10
      },
      {
        label: 'Money Pit',
        data: epics.filter(e => e.value < medianValue && e.effort >= medianEffort)
          .map(e => ({ x: e.effort, y: e.value, epic: e })),
        backgroundColor: 'rgba(239, 68, 68, 0.6)',
        borderColor: 'rgb(239, 68, 68)',
        pointRadius: 8,
        pointHoverRadius: 10
      }
    ]
  };

  const scatterOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const epic = ctx.raw.epic;
            return [
              `${epic.key}: ${epic.summary.substring(0, 40)}...`,
              `Value: ${epic.value} | Effort: ${epic.effort} SP`,
              `WSJF: ${epic.wsjf.wsjfScore}`
            ];
          }
        }
      },
      annotation: {
        annotations: {
          vLine: {
            type: 'line',
            xMin: medianEffort,
            xMax: medianEffort,
            borderColor: 'rgba(0,0,0,0.15)',
            borderDash: [6, 4],
            borderWidth: 1
          },
          hLine: {
            type: 'line',
            yMin: medianValue,
            yMax: medianValue,
            borderColor: 'rgba(0,0,0,0.15)',
            borderDash: [6, 4],
            borderWidth: 1
          }
        }
      }
    },
    scales: {
      x: {
        title: { display: true, text: 'Effort (Story Points)', font: { size: 12 } },
        grid: { color: 'rgba(0,0,0,0.05)' },
        beginAtZero: true
      },
      y: {
        title: { display: true, text: 'Business Value', font: { size: 12 } },
        grid: { color: 'rgba(0,0,0,0.05)' },
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

  return (
    <div className="space-y-6">
      {/* Field Mapping */}
      <FieldMappingConfig
        credentials={credentials}
        onMappingsChange={handleMappingsChange}
      />

      {/* Refresh button if mappings changed */}
      {fieldMappings && (
        <div className="flex items-center gap-2">
          <button
            onClick={loadPrioritization}
            disabled={loading}
            className="btn-primary text-xs px-3 py-1.5"
            style={{ backgroundColor: '#7c3aed' }}
          >
            {loading ? 'Recalculating...' : 'Recalculate with mapped fields'}
          </button>
          <span className="text-xs text-gray-400">Custom field mappings detected</span>
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
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Value vs Effort Matrix</h3>
        <div style={{ height: '400px' }}>
          <Scatter data={scatterData} options={scatterOptions} />
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">
          Dashed lines show median effort ({medianEffort} SP) and median value ({medianValue})
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* WSJF Table */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">WSJF Ranking</h3>
            <span className="text-xs text-gray-400">{epics.length} active epics</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
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
                      <div>
                        <span className="text-xs font-medium text-purple-700">{epic.key}</span>
                        <span className="text-xs text-gray-600 ml-2">
                          {epic.summary.length > 40 ? epic.summary.substring(0, 40) + '...' : epic.summary}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className="font-bold text-purple-700 text-sm">{epic.wsjf.wsjfScore}</span>
                    </td>
                    <td className="py-2 px-2 text-center text-xs text-gray-600">{epic.wsjf.businessValue}</td>
                    <td className="py-2 px-2 text-center text-xs text-gray-600">{epic.effort || '-'}</td>
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
              Using fallback: Business Value from Jira priority, Time Criticality from due date proximity, Job Size from story points.
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
