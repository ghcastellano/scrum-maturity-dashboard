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

export default function Dashboard({ credentials: credentialsProp, selectedBoards }) {
  const [metrics, setMetrics] = useState(null);
  const [flowMetrics, setFlowMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedBoard, setSelectedBoard] = useState(selectedBoards[0]);
  const [allBoardsData, setAllBoardsData] = useState({});
  const [history, setHistory] = useState([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [localCredentials, setLocalCredentials] = useState(credentialsProp);
  const [availableSprints, setAvailableSprints] = useState([]);
  const [selectedSprintIds, setSelectedSprintIds] = useState([]);
  const [showSprintSelector, setShowSprintSelector] = useState(false);
  const [loadingSprints, setLoadingSprints] = useState(false);

  // Use prop credentials or locally fetched ones
  const credentials = credentialsProp || localCredentials;

  // Fetch credentials from backend if not provided via props
  useEffect(() => {
    if (!credentialsProp && !localCredentials) {
      const API_URL = import.meta.env.VITE_API_URL || '/api';
      fetch(`${API_URL}/credentials`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.credentials) {
            setLocalCredentials(data.credentials);
          }
        })
        .catch(() => {});
    }
  }, [credentialsProp]);

  // Helper function to safely format numbers
  const formatNumber = (value, decimals = 1) => {
    if (value === null || value === undefined || isNaN(value)) return '0.0';
    return Number(value).toFixed(decimals);
  };

  // Build display boards: union of selectedBoards prop + boards from database
  const [dbBoards, setDbBoards] = useState([]);

  const displayBoards = (() => {
    const seen = new Set();
    const result = [];
    // Add all selectedBoards first
    for (const b of selectedBoards) {
      const id = typeof b === 'object' ? b.id : b;
      if (!seen.has(id)) {
        seen.add(id);
        result.push(b);
      }
    }
    // Add any boards from database that aren't in selectedBoards
    for (const b of dbBoards) {
      if (!seen.has(b.id)) {
        seen.add(b.id);
        result.push(b);
      }
    }
    return result;
  })();

  // Load ALL board metrics from database on mount
  useEffect(() => {
    loadAllMetrics();
  }, []);

  const loadAllMetrics = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await api.getAllLatestMetrics();
      if (result.success && result.boards?.length > 0) {
        // Build lookup: boardId -> metrics_data (use String keys for consistency)
        const dataMap = {};
        const boardsList = [];
        for (const board of result.boards) {
          dataMap[String(board.board_id)] = board.metrics_data;
          boardsList.push({ id: board.board_id, name: board.board_name });
        }
        setAllBoardsData(dataMap);
        setDbBoards(boardsList);

        // Find the first board that has data
        const firstBoardId = typeof selectedBoard === 'object' ? selectedBoard.id : selectedBoard;
        const firstData = dataMap[String(firstBoardId)];

        if (firstData) {
          setMetrics(firstData);
          setFlowMetrics(null);
          loadBoardHistory(firstBoardId);
          setLoading(false);
        } else {
          // Selected board has no data yet - check if any board in selectedBoards needs refresh
          const firstWithData = result.boards[0];
          setMetrics(firstWithData.metrics_data);
          setFlowMetrics(null);
          setSelectedBoard({ id: firstWithData.board_id, name: firstWithData.board_name });
          loadBoardHistory(firstWithData.board_id);
          setLoading(false);
          // Auto-refresh the new board if credentials available
          await autoRefreshNewBoards(dataMap);
        }
        return;
      }
    } catch (err) {
      console.warn('Failed to load metrics from database:', err.message);
    }

    // No saved data - show message
    setError('No saved metrics found. Use "Refresh from Jira" to calculate metrics for the first time.');
    setLoading(false);
  };

  // Auto-refresh boards that are in selectedBoards but have no data in the database
  const autoRefreshNewBoards = async (dataMap) => {
    if (!credentials) return;

    const newBoards = selectedBoards.filter(b => {
      const id = typeof b === 'object' ? b.id : b;
      return !dataMap[String(id)];
    });

    for (const board of newBoards) {
      const boardId = typeof board === 'object' ? board.id : board;
      const boardName = typeof board === 'object' ? board.name : `Board ${board}`;
      try {
        setRefreshing(true);
        setError(`Loading ${boardName} from Jira...`);

        const teamData = await api.getTeamMetrics(
          credentials.jiraUrl, credentials.email, credentials.apiToken,
          boardId, 6, true
        );

        if (teamData.success) {
          setAllBoardsData(prev => ({ ...prev, [String(boardId)]: teamData.data }));
          setDbBoards(prev => {
            if (prev.some(b => b.id === boardId)) return prev;
            return [...prev, { id: boardId, name: teamData.data?.boardName || boardName }];
          });
          // Switch to the newly loaded board
          setMetrics(teamData.data);
          setSelectedBoard(board);
          setError('');
          loadBoardHistory(boardId);
        }
      } catch (err) {
        console.warn(`Failed to auto-refresh board ${boardId}:`, err.message);
      } finally {
        setRefreshing(false);
      }
    }
  };

  // Handle board change from combobox - instant switch or auto-refresh
  const handleBoardChange = async (e) => {
    const boardId = Number(e.target.value);
    const board = displayBoards.find(b => (typeof b === 'object' ? b.id : b) === boardId);
    setSelectedBoard(board || boardId);

    // Reload sprint list if the sprint selector is visible
    if (showSprintSelector) {
      loadAvailableSprints(boardId);
    }

    const boardData = allBoardsData[String(boardId)];
    if (boardData) {
      // Board has data - instant switch
      setMetrics(boardData);
      setFlowMetrics(null);
      setSelectedHistoryId(null);
      setError('');
      loadBoardHistory(boardId);
    } else if (credentials) {
      // Board has no data - auto-refresh from Jira
      const boardName = typeof board === 'object' ? board.name : `Board ${boardId}`;
      try {
        setRefreshing(true);
        setLoading(true);
        setError(`Loading ${boardName} from Jira...`);

        const teamData = await api.getTeamMetrics(
          credentials.jiraUrl, credentials.email, credentials.apiToken,
          boardId, 6, true
        );

        if (teamData.success) {
          setMetrics(teamData.data);
          setFlowMetrics(null);
          setAllBoardsData(prev => ({ ...prev, [String(boardId)]: teamData.data }));
          setDbBoards(prev => {
            if (prev.some(b => b.id === boardId)) return prev;
            return [...prev, { id: boardId, name: teamData.data?.boardName || boardName }];
          });
          setError('');
          loadBoardHistory(boardId);
        }
      } catch (err) {
        setError(`Failed to load ${boardName}: ${err.message}`);
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    }
  };

  const loadBoardHistory = async (boardId) => {
    try {
      const historyResult = await api.getBoardHistory(boardId);
      if (historyResult.success && historyResult.history?.length > 0) {
        setHistory(historyResult.history);
        setSelectedHistoryId(historyResult.history[0].id);
      } else {
        setHistory([]);
        setSelectedHistoryId(null);
      }
    } catch (err) {
      console.warn('Failed to load history:', err.message);
    }
  };

  // Load available sprints for the current board
  const loadAvailableSprints = async (boardId) => {
    if (!credentials) return;
    try {
      setLoadingSprints(true);
      const result = await api.getSprints(
        credentials.jiraUrl, credentials.email, credentials.apiToken, boardId
      );
      if (result.success) {
        setAvailableSprints(result.sprints);
        // Default: select the 6 most recent
        setSelectedSprintIds(result.sprints.slice(0, 6).map(s => s.id));
      }
    } catch (err) {
      console.warn('Failed to load sprints:', err.message);
    } finally {
      setLoadingSprints(false);
    }
  };

  // Toggle sprint selection
  const toggleSprintSelection = (sprintId) => {
    setSelectedSprintIds(prev =>
      prev.includes(sprintId)
        ? prev.filter(id => id !== sprintId)
        : [...prev, sprintId]
    );
  };

  // Refresh with selected sprints
  const refreshWithSelectedSprints = async () => {
    if (selectedSprintIds.length === 0) return;
    try {
      setRefreshing(true);
      setLoading(true);
      setError('');
      setShowSprintSelector(false);

      const boardId = typeof selectedBoard === 'object' ? selectedBoard.id : selectedBoard;

      const teamData = await api.getTeamMetrics(
        credentials.jiraUrl, credentials.email, credentials.apiToken,
        boardId, selectedSprintIds.length, true, selectedSprintIds
      );

      if (teamData.success) {
        setMetrics(teamData.data);
        setFlowMetrics(null);
        setAllBoardsData(prev => ({ ...prev, [String(boardId)]: teamData.data }));
        setError('');
        await loadBoardHistory(boardId);
      }
    } catch (err) {
      setError(`Failed to refresh: ${err.message}`);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  // Delete board from database
  const handleDeleteBoard = async () => {
    const boardId = typeof selectedBoard === 'object' ? selectedBoard.id : selectedBoard;
    const boardName = typeof selectedBoard === 'object' ? selectedBoard.name : `Board ${selectedBoard}`;

    if (!window.confirm(`Remove "${boardName}" and all its saved metrics?`)) return;

    try {
      await api.deleteBoard(boardId);

      // Remove from local state
      setAllBoardsData(prev => {
        const next = { ...prev };
        delete next[String(boardId)];
        return next;
      });
      setDbBoards(prev => prev.filter(b => b.id !== boardId));

      // Switch to the next available board
      const remaining = displayBoards.filter(b => {
        const id = typeof b === 'object' ? b.id : b;
        return id !== boardId;
      });

      if (remaining.length > 0) {
        const next = remaining[0];
        const nextId = typeof next === 'object' ? next.id : next;
        setSelectedBoard(next);
        const nextData = allBoardsData[String(nextId)];
        if (nextData) {
          setMetrics(nextData);
          setFlowMetrics(null);
          loadBoardHistory(nextId);
        }
      } else {
        setMetrics(null);
        setError('No saved metrics found. Use "Refresh from Jira" to calculate metrics for the first time.');
      }
    } catch (err) {
      setError(`Failed to delete board: ${err.message}`);
    }
  };

  // Load a specific historical entry by ID
  const loadHistoricalMetrics = async (historyId) => {
    try {
      setLoading(true);
      setSelectedHistoryId(historyId);
      const result = await api.getHistoricalMetrics(historyId);
      if (result.success && result.data) {
        setMetrics(result.data.metrics_data);
        setFlowMetrics(null);
      }
    } catch (err) {
      console.error('Failed to load historical metrics:', err);
      setError('Failed to load historical metrics');
    } finally {
      setLoading(false);
    }
  };

  // Refresh from Jira API (only called by button)
  const refreshFromJira = async () => {
    try {
      setRefreshing(true);
      setLoading(true);
      setError('');

      const boardId = typeof selectedBoard === 'object' ? selectedBoard.id : selectedBoard;

      const [teamData, flowData] = await Promise.all([
        api.getTeamMetrics(
          credentials.jiraUrl,
          credentials.email,
          credentials.apiToken,
          boardId,
          6,
          true
        ),
        api.getFlowMetrics(
          credentials.jiraUrl,
          credentials.email,
          credentials.apiToken,
          boardId,
          3,
          true
        )
      ]);

      setMetrics(teamData.data);
      setFlowMetrics(flowData.data);

      // Update cache with new data
      setAllBoardsData(prev => ({ ...prev, [String(boardId)]: teamData.data }));

      // Reload history to include the new entry
      await loadBoardHistory(boardId);
    } catch (err) {
      console.error('Failed to load metrics:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to load metrics';
      setError(errorMessage);
    } finally {
      setLoading(false);
      setRefreshing(false);
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
            <div className="text-yellow-500 text-5xl mb-4">📊</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">No Metrics Data Yet</h2>
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-6">
              <p className="text-sm">{error}</p>
            </div>
            <div className="flex gap-3 justify-center">
              {credentials && (
                <button
                  onClick={() => refreshFromJira()}
                  disabled={refreshing}
                  className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <span>🔄</span>
                  {refreshing ? 'Refreshing...' : 'Refresh from Jira'}
                </button>
              )}
              <button
                onClick={() => window.location.reload()}
                className="btn-secondary"
              >
                Reload Page
              </button>
            </div>
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
    labels: ['With AC', 'With Estimates', 'Linked to Fix Versions'],
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
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-4xl font-bold text-gray-900">Scrum Maturity Dashboard</h1>
            {credentials && (
              <button
                onClick={() => refreshFromJira()}
                disabled={refreshing}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span>🔄</span>
                {refreshing ? 'Refreshing...' : 'Refresh from Jira'}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 mt-2">
            {displayBoards.length >= 1 && (
              <div className="flex items-center gap-2">
                <select
                  value={typeof selectedBoard === 'object' ? selectedBoard.id : selectedBoard}
                  onChange={handleBoardChange}
                  className="input-field max-w-md"
                >
                  {displayBoards.map(board => {
                    const boardId = typeof board === 'object' ? board.id : board;
                    const boardName = typeof board === 'object' ? board.name : `Board ${board}`;
                    return (
                      <option key={boardId} value={boardId}>{boardName}</option>
                    );
                  })}
                </select>
                <button
                  onClick={handleDeleteBoard}
                  className="px-3 py-2 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
                  title="Remove this board"
                >
                  ✕
                </button>
              </div>
            )}

            {credentials && (
              <button
                onClick={() => {
                  if (!showSprintSelector) {
                    const boardId = typeof selectedBoard === 'object' ? selectedBoard.id : selectedBoard;
                    loadAvailableSprints(boardId);
                  }
                  setShowSprintSelector(!showSprintSelector);
                }}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {showSprintSelector ? 'Hide Sprints' : 'Select Sprints'}
              </button>
            )}

            {history.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-600">History:</label>
                <select
                  value={selectedHistoryId || ''}
                  onChange={(e) => loadHistoricalMetrics(Number(e.target.value))}
                  className="input-field max-w-xs text-sm"
                >
                  {history.map(h => (
                    <option key={h.id} value={h.id}>
                      {new Date(h.calculated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })} - Level {h.maturity_level}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Sprint Selector Panel */}
          {showSprintSelector && (
            <div className="mt-4 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-gray-800">Select Sprints to Analyze</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedSprintIds(availableSprints.slice(0, 6).map(s => s.id))}
                    className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Last 6
                  </button>
                  <button
                    onClick={() => setSelectedSprintIds(availableSprints.map(s => s.id))}
                    className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setSelectedSprintIds([])}
                    className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {loadingSprints ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="mt-2 text-sm text-gray-500">Loading sprints...</p>
                </div>
              ) : (
                <>
                  <div className="max-h-60 overflow-y-auto space-y-1 mb-3">
                    {availableSprints.map(sprint => (
                      <label
                        key={sprint.id}
                        className={`flex items-center p-2 rounded cursor-pointer hover:bg-gray-50 transition-colors ${
                          selectedSprintIds.includes(sprint.id) ? 'bg-primary-50' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSprintIds.includes(sprint.id)}
                          onChange={() => toggleSprintSelection(sprint.id)}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-2 focus:ring-primary-500"
                        />
                        <span className="ml-3 text-sm text-gray-800">{sprint.name}</span>
                        <span className="ml-auto text-xs text-gray-500">
                          {sprint.endDate ? new Date(sprint.endDate).toLocaleDateString() : 'No date'}
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">
                      {selectedSprintIds.length} sprint{selectedSprintIds.length !== 1 ? 's' : ''} selected
                    </span>
                    <button
                      onClick={refreshWithSelectedSprints}
                      disabled={selectedSprintIds.length === 0 || refreshing}
                      className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {refreshing ? 'Analyzing...' : 'Analyze Selected Sprints'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Maturity Level Card */}
        <div className="card mb-8">
          {/* Header row */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Team Maturity Level</h2>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>Based on</span>
              <span className="font-semibold text-primary-600">{metrics.sprintsAnalyzed} sprints</span>
            </div>
          </div>

          {/* Badge + Characteristics row */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left: Badge */}
            <div className="lg:w-64 shrink-0">
              <MaturityBadge {...metrics.maturityLevel} size="large" />

              {/* Support Model for Level 2 */}
              {metrics.maturityLevel.supportModel && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-xs font-semibold text-yellow-900">Support Model:</p>
                  <p className="text-xs text-yellow-800">{metrics.maturityLevel.supportModel}</p>
                </div>
              )}
            </div>

            {/* Right: Characteristics grid */}
            {metrics.maturityLevel.characteristics && (
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {metrics.maturityLevel.characteristics.map((char, idx) => {
                  const blockerKeys = ['rollover', 'sprintGoals', 'backlog', 'midSprint'];
                  const blockers = metrics.maturityLevel.blockers || [];
                  const isBlocking = blockers.includes(blockerKeys[idx]);
                  const isPassing = !isBlocking && metrics.maturityLevel.level < 3;
                  const icons = ['📉', '🎯', '📋', '🔄'];
                  return (
                    <div key={idx} className={`flex items-start gap-2 p-3 rounded-lg border ${
                      isBlocking
                        ? 'bg-red-50 border-red-200'
                        : isPassing
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-100'
                    }`}>
                      <span className="text-base shrink-0">{isBlocking ? '🚫' : isPassing ? '✅' : icons[idx]}</span>
                      <div className="flex-1">
                        <span className={`text-sm ${isBlocking ? 'text-red-800 font-semibold' : isPassing ? 'text-green-800' : 'text-gray-700'}`}>{char}</span>
                        {isBlocking && (
                          <div className="text-xs text-red-600 mt-1 font-medium">Blocking next level</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recommendations */}
          {metrics.maturityLevel.recommendations && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm font-semibold text-gray-700 hover:text-gray-900">
                Recommendations ({metrics.maturityLevel.recommendations.length})
              </summary>
              <ul className="mt-3 space-y-2 pl-1">
                {metrics.maturityLevel.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start text-sm text-gray-600">
                    <span className="text-primary-600 mr-2 shrink-0">{idx + 1}.</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="card">
            <div className="text-sm text-gray-600 mb-1">Avg Rollover Rate</div>
            <div className="text-3xl font-bold text-red-600">
              {formatNumber(metrics.aggregated?.avgRolloverRate)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Target Level 3: &lt;10-15%
            </div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-600 mb-1">Avg Sprint Goal Attainment</div>
            <div className="text-3xl font-bold text-primary-600">
              {formatNumber(metrics.aggregated?.avgSprintGoalAttainment)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Target Level 3: &gt;70%
            </div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-600 mb-1">Backlog Health Score</div>
            <div className="text-3xl font-bold text-blue-600">
              {formatNumber(metrics.backlogHealth?.overallScore)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Target Level 3: &gt;80%
            </div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-600 mb-1">Avg Mid-Sprint Injection</div>
            <div className="text-3xl font-bold text-amber-600">
              {formatNumber(metrics.aggregated?.avgMidSprintAdditions)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Target Level 3: &lt;10%
            </div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-600 mb-1">Avg Hit Rate</div>
            <div className="text-3xl font-bold text-green-600">
              {formatNumber(metrics.aggregated?.avgSprintHitRate)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Higher is better
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

              {/* Rollover Issues Detail */}
              <div className="mt-4 space-y-2">
                {metrics.sprintMetrics.slice().reverse().map(sprint => {
                  const issues = sprint.rolloverIssues || [];
                  const breakdown = sprint.rolloverReasonBreakdown || {};
                  if (issues.length === 0) return null;
                  return (
                    <details key={sprint.sprintId} className="bg-red-50 rounded-lg border border-red-100">
                      <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-red-800 hover:bg-red-100 rounded-lg">
                        {sprint.sprintName} — {issues.length} rolled over ({formatNumber(sprint.rolloverRate)}%)
                      </summary>
                      <div className="px-3 pb-3">
                        {/* Reason Breakdown */}
                        {Object.keys(breakdown).length > 0 && (
                          <div className="flex flex-wrap gap-2 py-2 mb-2 border-b border-red-200">
                            {Object.entries(breakdown).map(([reason, count]) => (
                              <span key={reason} className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                reason === 'external-blockers' ? 'bg-purple-100 text-purple-800' :
                                reason === 'late-discovery' ? 'bg-blue-100 text-blue-800' :
                                reason === 'resource-constraints' ? 'bg-orange-100 text-orange-800' :
                                reason === 'internal-blockers' ? 'bg-red-100 text-red-800' :
                                reason === 'req-gap' ? 'bg-yellow-100 text-yellow-800' :
                                reason === 'dev-qa-spill' ? 'bg-cyan-100 text-cyan-800' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {reason === 'external-blockers' ? 'External Blockers' :
                                 reason === 'late-discovery' ? 'Late Discovery' :
                                 reason === 'resource-constraints' ? 'Resource Constraints' :
                                 reason === 'internal-blockers' ? 'Internal Blockers' :
                                 reason === 'req-gap' ? 'Req Gap' :
                                 reason === 'dev-qa-spill' ? 'Dev/QA Spill' : reason
                                }: {count}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Issue List */}
                        <div className="space-y-1">
                          {issues.map(issue => (
                            <div key={issue.key} className="flex items-center gap-2 text-xs text-gray-700 py-1 border-t border-red-100">
                              <a href={`${credentials.jiraUrl.replace(/\/$/, '')}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer" className="font-mono font-semibold text-red-700 shrink-0 hover:underline">{issue.key}</a>
                              <span className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600 shrink-0">{issue.type}</span>
                              <span className="flex-1 truncate">{issue.summary}</span>
                              {(issue.reasons || []).map(r => (
                                <span key={r} className={`px-1.5 py-0.5 rounded text-xs shrink-0 ${
                                  r === 'external-blockers' ? 'bg-purple-100 text-purple-700' :
                                  r === 'late-discovery' ? 'bg-blue-100 text-blue-700' :
                                  r === 'resource-constraints' ? 'bg-orange-100 text-orange-700' :
                                  r === 'internal-blockers' ? 'bg-red-100 text-red-700' :
                                  r === 'req-gap' ? 'bg-yellow-100 text-yellow-700' :
                                  r === 'dev-qa-spill' ? 'bg-cyan-100 text-cyan-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>{r}</span>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    </details>
                  );
                })}
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
                {metrics.sprintMetrics.slice().reverse().map(sprint => {
                  const msIssues = sprint.midSprintAdditions?.issues || [];
                  const msCount = sprint.midSprintAdditions?.count || 0;
                  if (msCount === 0) {
                    return (
                      <div key={sprint.sprintId} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                        <span className="text-sm font-medium">{sprint.sprintName}</span>
                        <span className="text-sm text-gray-500">0 issues (0.0%)</span>
                      </div>
                    );
                  }
                  return (
                    <details key={sprint.sprintId} className="bg-amber-50 rounded-lg border border-amber-100">
                      <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-amber-800 hover:bg-amber-100 rounded-lg flex justify-between items-center">
                        <span>{sprint.sprintName}</span>
                        <span>{msCount} issues ({formatNumber(sprint.midSprintAdditions?.percentage)}%)</span>
                      </summary>
                      <div className="px-3 pb-3 space-y-1">
                        {msIssues.map(issue => (
                          <div key={issue.key} className="flex items-center gap-2 text-xs text-gray-700 py-1 border-t border-amber-100">
                            <a href={`${credentials.jiraUrl.replace(/\/$/, '')}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer" className="font-mono font-semibold text-amber-700 shrink-0 hover:underline">{issue.key}</a>
                            <span className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600 shrink-0">{issue.type}</span>
                            <span className="flex-1 truncate">{issue.summary}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Pillar 2: Flow & Quality */}
        <div className="card mb-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">
            ⚡ Pillar 2: Flow & Quality
          </h2>

          {flowMetrics && (
            <div>
              <h3 className="font-semibold mb-4">Average Cycle Time (days)</h3>
              <div className="space-y-3">
                {Object.entries(flowMetrics.summary.avgCycleTime).map(([type, time]) => (
                  <div key={type} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="font-medium">{type}</span>
                    <span className="text-lg font-bold text-primary-600">
                      {time > 0 ? formatNumber(time) : 'N/A'} days
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                    {formatNumber(metrics.backlogHealth?.withAcceptanceCriteria)}%
                  </div>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Items with Estimates</div>
                  <div className="text-2xl font-bold text-green-600">
                    {formatNumber(metrics.backlogHealth?.withEstimates)}%
                  </div>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Items Linked to Fix Versions</div>
                  <div className="text-2xl font-bold text-orange-600">
                    {formatNumber(metrics.backlogHealth?.linkedToGoals)}%
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
