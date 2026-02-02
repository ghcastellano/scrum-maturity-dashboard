import { useState, useEffect } from 'react';
import { Line, Bar, Radar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  RadialLinearScale,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import api from '../services/api';
import MaturityBadge from './MaturityBadge';
import MaturityLevelsReference from './MaturityLevelsReference';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  RadialLinearScale,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function Dashboard({ credentials, selectedBoards }) {
  const [metrics, setMetrics] = useState(null);
  const [flowMetrics, setFlowMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBoard, setSelectedBoard] = useState(selectedBoards[0]);

  useEffect(() => {
    loadMetrics();
  }, [selectedBoard]);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      setError('');

      const [teamData, flowData] = await Promise.all([
        api.getTeamMetrics(
          credentials.jiraUrl,
          credentials.email,
          credentials.apiToken,
          selectedBoard,
          6
        ),
        api.getFlowMetrics(
          credentials.jiraUrl,
          credentials.email,
          credentials.apiToken,
          selectedBoard,
          3
        )
      ]);

      setMetrics(teamData.data);
      setFlowMetrics(flowData.data);
    } catch (err) {
      console.error('Failed to load metrics:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to load metrics';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 text-lg">Analyzing team metrics...</p>
          <p className="mt-2 text-sm text-gray-500">This may take a minute...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-2xl card">
          <div className="text-center">
            <div className="text-red-600 text-5xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Failed to Load Metrics</h2>
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              <p className="font-medium mb-2">Error Details:</p>
              <p className="text-sm">{error}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No metrics data available</p>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const sprintLabels = metrics.sprintMetrics.map(s => s.sprintName).reverse();
  
  const sprintGoalData = {
    labels: sprintLabels,
    datasets: [
      {
        label: 'Sprint Goal Attainment (%)',
        data: metrics.sprintMetrics.map(s => s.sprintGoalAttainment).reverse(),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.3,
        fill: true
      },
      {
        label: 'Level 3 Target (70%)',
        data: Array(sprintLabels.length).fill(70),
        borderColor: 'rgb(34, 197, 94)',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        fill: false
      },
      {
        label: 'Level 1 Threshold (50%)',
        data: Array(sprintLabels.length).fill(50),
        borderColor: 'rgb(239, 68, 68)',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        fill: false
      }
    ]
  };

  const rolloverData = {
    labels: sprintLabels,
    datasets: [
      {
        label: 'Rollover Rate (%)',
        data: metrics.sprintMetrics.map(s => s.rolloverRate).reverse(),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.3,
        fill: true
      },
      {
        label: 'Level 2 Upper Limit (20%)',
        data: Array(sprintLabels.length).fill(20),
        borderColor: 'rgb(251, 191, 36)',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        fill: false
      },
      {
        label: 'Level 3 Target (15%)',
        data: Array(sprintLabels.length).fill(15),
        borderColor: 'rgb(34, 197, 94)',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        fill: false
      }
    ]
  };

  const hitRateData = {
    labels: sprintLabels,
    datasets: [{
      label: 'Sprint Hit Rate (%)',
      data: metrics.sprintMetrics.map(s => s.sprintHitRate).reverse(),
      backgroundColor: 'rgba(34, 197, 94, 0.7)'
    }]
  };

  const backlogHealthData = {
    labels: ['With AC', 'With Estimates', 'Linked to Goals'],
    datasets: [{
      label: 'Backlog Health (%)',
      data: [
        metrics.backlogHealth.withAcceptanceCriteria,
        metrics.backlogHealth.withEstimates,
        metrics.backlogHealth.linkedToGoals
      ],
      backgroundColor: [
        'rgba(59, 130, 246, 0.7)',
        'rgba(34, 197, 94, 0.7)',
        'rgba(249, 115, 22, 0.7)'
      ]
    }]
  };

  const defectData = metrics.sprintMetrics[0]?.defectDistribution || { preMerge: 0, inQA: 0, postRelease: 0 };
  const defectDistributionData = {
    labels: ['Pre-Merge', 'In QA', 'Post-Release'],
    datasets: [{
      label: 'Defects',
      data: [defectData.preMerge, defectData.inQA, defectData.postRelease],
      backgroundColor: [
        'rgba(34, 197, 94, 0.7)',
        'rgba(251, 191, 36, 0.7)',
        'rgba(239, 68, 68, 0.7)'
      ]
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Scrum Maturity Dashboard</h1>
          
          {selectedBoards.length > 1 && (
            <select
              value={selectedBoard}
              onChange={(e) => setSelectedBoard(Number(e.target.value))}
              className="input-field max-w-md"
            >
              {selectedBoards.map(boardId => (
                <option key={boardId} value={boardId}>Board {boardId}</option>
              ))}
            </select>
          )}
        </div>

        {/* Maturity Level Card */}
        <div className="card mb-8 bg-gradient-to-r from-primary-50 to-primary-100">
          <div className="flex flex-col lg:flex-row items-start justify-between gap-6">
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-4">Team Maturity Level</h2>
              <MaturityBadge {...metrics.maturityLevel} size="large" />
              
              {/* Characteristics */}
              {metrics.maturityLevel.characteristics && (
                <div className="mt-6">
                  <h3 className="font-semibold text-lg mb-2">Current Characteristics:</h3>
                  <div className="space-y-2">
                    {metrics.maturityLevel.characteristics.map((char, idx) => (
                      <div key={idx} className="flex items-start bg-white bg-opacity-50 rounded p-2">
                        <span className="text-primary-600 mr-2 font-bold">•</span>
                        <span className="text-sm">{char}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Support Model for Level 2 */}
              {metrics.maturityLevel.supportModel && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm font-semibold text-yellow-900">Support Model:</p>
                  <p className="text-sm text-yellow-800">{metrics.maturityLevel.supportModel}</p>
                </div>
              )}
              
              <div className="mt-6">
                <h3 className="font-semibold text-lg mb-2">Recommendations:</h3>
                <ul className="space-y-2">
                  {metrics.maturityLevel.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start">
                      <span className="text-primary-600 mr-2">→</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600 mb-2">Sprints Analyzed</div>
              <div className="text-4xl font-bold text-primary-600">{metrics.sprintsAnalyzed}</div>
              <div className="mt-4 p-4 bg-white rounded-lg shadow-sm">
                <div className="text-xs text-gray-500 mb-1">Based on</div>
                <div className="text-sm font-semibold">Last {metrics.sprintsAnalyzed} Closed Sprints</div>
              </div>
            </div>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <div className="text-sm text-gray-600 mb-1">Avg Sprint Goal Attainment</div>
            <div className="text-3xl font-bold text-primary-600">
              {metrics.aggregated.avgSprintGoalAttainment.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Target Level 3: &gt;70%
            </div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-600 mb-1">Avg Rollover Rate</div>
            <div className="text-3xl font-bold text-red-600">
              {metrics.aggregated.avgRolloverRate.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Target Level 3: &lt;10-15%
            </div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-600 mb-1">Avg Hit Rate</div>
            <div className="text-3xl font-bold text-green-600">
              {metrics.aggregated.avgSprintHitRate.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Higher is better
            </div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-600 mb-1">Backlog Health Score</div>
            <div className="text-3xl font-bold text-blue-600">
              {metrics.backlogHealth.overallScore.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Target Level 3: &gt;80%
            </div>
          </div>
        </div>

        {/* Maturity Levels Reference */}
        <MaturityLevelsReference />

        {/* Pillar 1: Delivery Predictability */}
        <div className="card mb-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">
            📊 Pillar 1: Delivery Predictability
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold mb-4">Sprint Goal Attainment</h3>
              <div className="h-64">
                <Line data={sprintGoalData} options={chartOptions} />
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Rollover Rate</h3>
              <div className="h-64">
                <Line data={rolloverData} options={chartOptions} />
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Sprint Hit Rate</h3>
              <div className="h-64">
                <Bar data={hitRateData} options={chartOptions} />
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Mid-Sprint Additions</h3>
              <div className="space-y-2">
                {metrics.sprintMetrics.slice().reverse().map(sprint => (
                  <div key={sprint.sprintId} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-sm font-medium">{sprint.sprintName}</span>
                    <span className="text-sm">
                      {sprint.midSprintAdditions.count} issues ({sprint.midSprintAdditions.percentage.toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Pillar 2: Flow & Quality */}
        <div className="card mb-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">
            ⚡ Pillar 2: Flow & Quality
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold mb-4">Defect Distribution</h3>
              <div className="h-64">
                <Doughnut data={defectDistributionData} options={{ responsive: true, maintainAspectRatio: false }} />
              </div>
            </div>
            
            {flowMetrics && (
              <div>
                <h3 className="font-semibold mb-4">Average Cycle Time (days)</h3>
                <div className="space-y-3">
                  {Object.entries(flowMetrics.summary.avgCycleTime).map(([type, time]) => (
                    <div key={type} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                      <span className="font-medium">{type}</span>
                      <span className="text-lg font-bold text-primary-600">
                        {time > 0 ? time.toFixed(1) : 'N/A'} days
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pillar 3: Team Ownership */}
        <div className="card mb-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">
            👥 Pillar 3: Team Ownership & Execution
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold mb-4">Backlog Health</h3>
              <div className="h-64">
                <Bar 
                  data={backlogHealthData} 
                  options={{
                    ...chartOptions,
                    indexAxis: 'y'
                  }} 
                />
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Backlog Metrics</h3>
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Items with Acceptance Criteria</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {metrics.backlogHealth.withAcceptanceCriteria.toFixed(1)}%
                  </div>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Items with Estimates</div>
                  <div className="text-2xl font-bold text-green-600">
                    {metrics.backlogHealth.withEstimates.toFixed(1)}%
                  </div>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Items Linked to Goals</div>
                  <div className="text-2xl font-bold text-orange-600">
                    {metrics.backlogHealth.linkedToGoals.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
