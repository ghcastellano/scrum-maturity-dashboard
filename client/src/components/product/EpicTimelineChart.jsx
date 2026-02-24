import { Bar } from 'react-chartjs-2';

const HEALTH_COLORS = {
  'on-track': { bg: 'rgba(34, 197, 94, 0.7)', border: 'rgb(34, 197, 94)' },
  'at-risk': { bg: 'rgba(245, 158, 11, 0.7)', border: 'rgb(245, 158, 11)' },
  'blocked': { bg: 'rgba(239, 68, 68, 0.7)', border: 'rgb(239, 68, 68)' },
  'done': { bg: 'rgba(156, 163, 175, 0.5)', border: 'rgb(156, 163, 175)' },
  'no-data': { bg: 'rgba(107, 114, 128, 0.4)', border: 'rgb(107, 114, 128)' }
};

export default function EpicTimelineChart({ epics }) {
  // Filter epics that have at least a created date, limit to 25
  const timelineEpics = epics
    .filter(e => e.created)
    .sort((a, b) => {
      // Prioritize non-done, then by due date proximity
      if (a.statusCategory === 'done' && b.statusCategory !== 'done') return 1;
      if (a.statusCategory !== 'done' && b.statusCategory === 'done') return -1;
      return 0;
    })
    .slice(0, 25);

  if (timelineEpics.length === 0) {
    return (
      <div className="card text-center py-8">
        <p className="text-gray-400 text-sm">No epics with date information available</p>
      </div>
    );
  }

  const today = new Date();
  const todayTs = today.getTime();

  // Build datasets - one per health status for legend grouping
  const labels = timelineEpics.map(e =>
    e.summary.length > 35 ? e.summary.substring(0, 35) + '...' : e.summary
  );

  const data = timelineEpics.map(epic => {
    const start = new Date(epic.created).getTime();
    const end = epic.dueDate
      ? new Date(epic.dueDate).getTime()
      : epic.resolutionDate
        ? new Date(epic.resolutionDate).getTime()
        : todayTs + 30 * 24 * 60 * 60 * 1000;
    return [start, end];
  });

  const backgroundColors = timelineEpics.map(e =>
    (HEALTH_COLORS[e.health] || HEALTH_COLORS['no-data']).bg
  );
  const borderColors = timelineEpics.map(e =>
    (HEALTH_COLORS[e.health] || HEALTH_COLORS['no-data']).border
  );

  // Find time range for axis
  const allTimestamps = data.flat();
  const minTs = Math.min(...allTimestamps, todayTs);
  const maxTs = Math.max(...allTimestamps, todayTs);
  const padding = (maxTs - minTs) * 0.05;

  const chartData = {
    labels,
    datasets: [{
      label: 'Epic Timeline',
      data,
      backgroundColor: backgroundColors,
      borderColor: borderColors,
      borderWidth: 1,
      borderSkipped: false,
      barPercentage: 0.7,
      categoryPercentage: 0.8
    }]
  };

  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const idx = items[0].dataIndex;
            return timelineEpics[idx].key + ' - ' + timelineEpics[idx].summary;
          },
          label: (item) => {
            const [start, end] = item.raw;
            const fmt = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
            const epic = timelineEpics[item.dataIndex];
            return [
              `${fmt(start)} → ${fmt(end)}`,
              `Health: ${epic.health}`,
              `Progress: ${epic.progress}%`
            ];
          }
        }
      }
    },
    scales: {
      x: {
        type: 'linear',
        min: minTs - padding,
        max: maxTs + padding,
        ticks: {
          callback: (value) => {
            const d = new Date(value);
            return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
          },
          maxTicksLimit: 8,
          font: { size: 10 }
        },
        grid: { color: 'rgba(0,0,0,0.05)' }
      },
      y: {
        ticks: { font: { size: 10 } },
        grid: { display: false }
      }
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Epic Roadmap Timeline</h3>
        <div className="flex gap-3 text-xs">
          {Object.entries(HEALTH_COLORS).filter(([k]) => k !== 'no-data').map(([key, colors]) => (
            <span key={key} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}></span>
              {key.replace('-', ' ')}
            </span>
          ))}
        </div>
      </div>
      <div style={{ height: Math.max(300, timelineEpics.length * 28) + 'px' }}>
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
}
