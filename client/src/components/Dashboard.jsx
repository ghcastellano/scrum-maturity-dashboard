import { useState, useEffect, useRef } from 'react';
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
import ReleasesTab from './ReleasesTab';
import FlowMetricsTab from './FlowMetricsTab';

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

export default function Dashboard({ credentials: credentialsProp, selectedBoards, newlyAddedBoard, onNewBoardHandled }) {
  const [metrics, setMetrics] = useState(null);
  const [flowMetrics, setFlowMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedBoard, setSelectedBoard] = useState(selectedBoards[0]);
  const [allBoardsData, setAllBoardsData] = useState({});
  const [allFlowData, setAllFlowData] = useState({});
  const [history, setHistory] = useState([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [localCredentials, setLocalCredentials] = useState(credentialsProp);
  const [availableSprints, setAvailableSprints] = useState([]);
  const [selectedSprintIds, setSelectedSprintIds] = useState([]);
  const [showSprintSelector, setShowSprintSelector] = useState(false);
  const [loadingSprints, setLoadingSprints] = useState(false);
  const [activeTab, setActiveTab] = useState('metrics');

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

  // When a new board is added from TeamSelector, auto-select it
  useEffect(() => {
    if (newlyAddedBoard) {
      const boardId = typeof newlyAddedBoard === 'object' ? newlyAddedBoard.id : newlyAddedBoard;
      setSelectedBoard(newlyAddedBoard);
      setActiveTab('metrics');
      onNewBoardHandled?.();

      // If board has cached data, use it immediately
      if (allBoardsData[String(boardId)]) {
        setMetrics(allBoardsData[String(boardId)]);
        setFlowMetrics(allFlowData[String(boardId)] || allBoardsData[String(boardId)]?.flowMetrics || null);
        loadBoardHistory(boardId);
      } else {
        // Clear metrics so the auto-refresh useEffect triggers
        setMetrics(null);
        setFlowMetrics(null);
        setError('');
      }
    }
  }, [newlyAddedBoard]);

  const loadAllMetrics = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await api.getAllLatestMetrics();
      if (result.success && result.boards?.length > 0) {
        // Build lookup: boardId -> metrics_data (use String keys for consistency)
        const dataMap = {};
        const flowMap = {};
        const boardsList = [];
        for (const board of result.boards) {
          dataMap[String(board.board_id)] = board.metrics_data;
          if (board.metrics_data?.flowMetrics) {
            flowMap[String(board.board_id)] = board.metrics_data.flowMetrics;
          }
          boardsList.push({ id: board.board_id, name: board.board_name });
        }
        setAllBoardsData(dataMap);
        setAllFlowData(flowMap);
        setDbBoards(boardsList);

        // Find the first board that has data
        const firstBoardId = typeof selectedBoard === 'object' ? selectedBoard.id : selectedBoard;
        const firstData = dataMap[String(firstBoardId)];

        if (firstData) {
          setMetrics(firstData);
          setFlowMetrics(firstData.flowMetrics || null);
          loadBoardHistory(firstBoardId);
          setLoading(false);
        } else {
          // Selected board has no data yet - use first available board with data
          const firstWithData = result.boards[0];
          setMetrics(firstWithData.metrics_data);
          setFlowMetrics(firstWithData.metrics_data?.flowMetrics || null);
          setSelectedBoard({ id: firstWithData.board_id, name: firstWithData.board_name });
          loadBoardHistory(firstWithData.board_id);
          setLoading(false);
        }
        return;
      }
    } catch (err) {
      console.warn('Failed to load metrics from database:', err.message);
    }

    // No saved data - auto-refresh will kick in via useEffect
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
      setFlowMetrics(allFlowData[String(boardId)] || boardData.flowMetrics || null);
      setSelectedHistoryId(null);
      setError('');
      loadBoardHistory(boardId);
    } else {
      // Board has no data - clear metrics so auto-refresh useEffect triggers
      setMetrics(null);
      setFlowMetrics(null);
      setError('');
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

      const [teamData, flowData] = await Promise.all([
        api.getTeamMetrics(
          credentials.jiraUrl, credentials.email, credentials.apiToken,
          boardId, selectedSprintIds.length, true, selectedSprintIds
        ),
        api.getFlowMetrics(
          credentials.jiraUrl, credentials.email, credentials.apiToken,
          boardId, selectedSprintIds.length, true, selectedSprintIds
        )
      ]);

      if (teamData.success) {
        setMetrics(teamData.data);
        setFlowMetrics(flowData.data || null);
        setAllBoardsData(prev => ({ ...prev, [String(boardId)]: teamData.data }));
        if (flowData.data) {
          setAllFlowData(prev => ({ ...prev, [String(boardId)]: flowData.data }));
        }
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
          setFlowMetrics(allFlowData[String(nextId)] || nextData.flowMetrics || null);
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
        setFlowMetrics(result.data.metrics_data?.flowMetrics || null);
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
          6,
          true
        )
      ]);

      setMetrics(teamData.data);
      setFlowMetrics(flowData.data);

      // Update cache with new data
      setAllBoardsData(prev => ({ ...prev, [String(boardId)]: teamData.data }));
      setAllFlowData(prev => ({ ...prev, [String(boardId)]: flowData.data }));

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

  // Auto-refresh when no metrics and credentials available
  const autoRefreshingRef = useRef(false);
  useEffect(() => {
    if (!loading && !metrics && !refreshing && !autoRefreshingRef.current && credentials && selectedBoard) {
      const boardId = typeof selectedBoard === 'object' ? selectedBoard.id : selectedBoard;
      const boardName = typeof selectedBoard === 'object' ? selectedBoard.name : `Board ${boardId}`;
      autoRefreshingRef.current = true;
      (async () => {
        try {
          setRefreshing(true);
          const [teamData, flowData] = await Promise.all([
            api.getTeamMetrics(credentials.jiraUrl, credentials.email, credentials.apiToken, boardId, 6, true),
            api.getFlowMetrics(credentials.jiraUrl, credentials.email, credentials.apiToken, boardId, 6, true)
          ]);
          if (teamData.success) {
            setMetrics(teamData.data);
            setFlowMetrics(flowData.data || null);
            setAllBoardsData(prev => ({ ...prev, [String(boardId)]: teamData.data }));
            if (flowData.data) {
              setAllFlowData(prev => ({ ...prev, [String(boardId)]: flowData.data }));
            }
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
          autoRefreshingRef.current = false;
        }
      })();
    }
  }, [loading, metrics, credentials, selectedBoard]);

  // Loading/no-data inline component (shown inside the main layout instead of blocking)
  const renderLoadingOrEmpty = () => {
    if (loading || refreshing) {
      const boardName = typeof selectedBoard === 'object' ? selectedBoard.name : `Board ${selectedBoard || ''}`;
      return (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 text-lg">
              {refreshing ? `Loading ${boardName} from Jira...` : 'Loading metrics...'}
            </p>
            <p className="mt-2 text-sm text-gray-500">This may take a minute...</p>
          </div>
        </div>
      );
    }

    if (error && !metrics) {
      return (
        <div className="flex items-center justify-center py-24">
          <div className="text-center max-w-lg">
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-4">
              <p className="text-sm">{error}</p>
            </div>
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
          </div>
        </div>
      );
    }

    return null;
  };

  // Prepare chart data (safe even if metrics is null)
  const sprintLabels = metrics ? metrics.sprintMetrics.map(s => s.sprintName).reverse() : [];
  
  const sprintGoalData = {
    labels: sprintLabels,
    datasets: [
      {
        label: 'Commitment Completion (%)',
        data: metrics ? metrics.sprintMetrics.map(s => s.sprintGoalAttainment).reverse() : [],
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
        data: metrics ? metrics.sprintMetrics.map(s => s.rolloverRate).reverse() : [],
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

  const backlogHealthData = {
    labels: ['With AC', 'With Estimates', 'Linked to Fix Versions'],
    datasets: [{
      label: 'Backlog Health (%)',
      data: metrics ? [
        metrics.backlogHealth.withAcceptanceCriteria,
        metrics.backlogHealth.withEstimates,
        metrics.backlogHealth.linkedToGoals
      ] : [0, 0, 0],
      backgroundColor: [
        'rgba(59, 130, 246, 0.7)',
        'rgba(34, 197, 94, 0.7)',
        'rgba(249, 115, 22, 0.7)'
      ]
    }]
  };

  const defectData = metrics?.sprintMetrics?.[0]?.defectDistribution || { preMerge: 0, inQA: 0, postRelease: 0 };
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
                  className="px-3 py-2 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1.5"
                  title="Permanently delete this board and all its saved metrics"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="hidden sm:inline">Delete</span>
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

          {/* Tab Navigation */}
          <div className="flex border-b border-gray-200 mt-6">
            <button
              onClick={() => setActiveTab('metrics')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'metrics'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Metrics
            </button>
            <button
              onClick={() => setActiveTab('flow')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'flow'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Flow Metrics
            </button>
            <button
              onClick={() => setActiveTab('releases')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'releases'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Releases
            </button>
          </div>
        </div>

        {/* Flow Metrics Tab */}
        {activeTab === 'flow' && metrics && (
          <FlowMetricsTab flowMetrics={flowMetrics} />
        )}

        {/* Releases Tab */}
        {activeTab === 'releases' && metrics && (
          <ReleasesTab
            credentials={credentials}
            boardId={typeof selectedBoard === 'object' ? selectedBoard.id : selectedBoard}
          />
        )}

        {/* Inline loading/empty state when no metrics available */}
        {!metrics && renderLoadingOrEmpty()}

        {/* Metrics Tab Content */}
        {activeTab === 'metrics' && metrics && (
        <>
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

            {/* Right: Characteristics grid - compute blockers from actual values */}
            {(() => {
              const level = metrics.maturityLevel.level;
              const rollover = metrics.aggregated?.avgRolloverRate ?? 0;
              const sprintGoal = metrics.aggregated?.avgSprintGoalAttainment ?? 0;
              const backlog = metrics.backlogHealth?.overallScore ?? 0;
              const midSprint = metrics.aggregated?.avgMidSprintAdditions ?? 0;

              // Thresholds for next level
              const thresholds = level === 1
                ? { rollover: { max: 25, label: '≤25%' }, sprintGoal: { min: 50, label: '≥50%' }, backlog: { min: 50, label: '≥50%' }, midSprint: { max: 25, label: '≤25%' }, nextLevel: 2 }
                : level === 2
                ? { rollover: { max: 15, label: '<15%' }, sprintGoal: { min: 70, label: '>70%' }, backlog: { min: 80, label: '>80%' }, midSprint: { max: 10, label: '<10%' }, nextLevel: 3 }
                : null;

              const metricItems = [
                { icon: '📉', label: 'Rollover Rate', value: rollover, blocking: thresholds ? rollover > thresholds.rollover.max : false, target: thresholds?.rollover.label, current: `${formatNumber(rollover)}%` },
                { icon: '🎯', label: 'Sprint Goal Attainment', value: sprintGoal, blocking: thresholds ? sprintGoal < thresholds.sprintGoal.min : false, target: thresholds?.sprintGoal.label, current: `${formatNumber(sprintGoal)}%` },
                { icon: '📋', label: 'Backlog Health', value: backlog, blocking: thresholds ? backlog < thresholds.backlog.min : false, target: thresholds?.backlog.label, current: `${formatNumber(backlog)}%` },
                { icon: '🔄', label: 'Mid-Sprint Additions', value: midSprint, blocking: thresholds ? midSprint > thresholds.midSprint.max : false, target: thresholds?.midSprint.label, current: `${formatNumber(midSprint)}%` }
              ];

              const blockingCount = metricItems.filter(m => m.blocking).length;

              return (
                <div className="flex-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {metricItems.map((item, idx) => (
                      <div key={idx} className={`flex items-start gap-2 p-3 rounded-lg border ${
                        item.blocking
                          ? 'bg-red-50 border-red-200'
                          : thresholds
                          ? 'bg-green-50 border-green-200'
                          : 'bg-gray-50 border-gray-100'
                      }`}>
                        <span className="text-base shrink-0">{item.blocking ? '🚫' : thresholds ? '✅' : item.icon}</span>
                        <div className="flex-1">
                          <div className={`text-sm font-medium ${item.blocking ? 'text-red-800' : thresholds ? 'text-green-800' : 'text-gray-700'}`}>
                            {item.label}: {item.current}
                          </div>
                          {thresholds && (
                            <div className={`text-xs mt-0.5 ${item.blocking ? 'text-red-600 font-semibold' : 'text-green-600'}`}>
                              {item.blocking
                                ? `Needs ${item.target} for Level ${thresholds.nextLevel}`
                                : `Passing (target: ${item.target})`}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {thresholds && blockingCount > 0 && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm font-semibold text-red-800">
                        {blockingCount} metric{blockingCount > 1 ? 's' : ''} blocking Level {thresholds.nextLevel}
                      </p>
                      <p className="text-xs text-red-600 mt-1">
                        {metricItems.filter(m => m.blocking).map(m => `${m.label} (${m.current} → ${m.target})`).join(' · ')}
                      </p>
                    </div>
                  )}
                  {level === 3 && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm font-semibold text-green-800">All metrics at highest level</p>
                    </div>
                  )}
                </div>
              );
            })()}
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
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
            <div className="text-sm text-gray-600 mb-1">Avg Commitment Completion</div>
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
        </div>

        {/* Maturity Levels Reference */}
        <MaturityLevelsReference />

        {/* Pillar 1: Delivery Predictability */}
        <div className="card mb-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">
            📊 Pillar 1: Delivery Predictability
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sprint Commitment Completion */}
            <div>
              <h3 className="font-semibold mb-2">Sprint Commitment Completion</h3>
              <p className="text-xs text-gray-500 mb-4">
                % of all sprint items completed (includes mid-sprint additions and rollovers)
              </p>
              <div className="h-80">
                <Line data={sprintGoalData} options={chartOptions} />
              </div>
            </div>

            {/* Rollover Rate + Issues */}
            <div>
              <h3 className="font-semibold mb-4">Rollover Rate</h3>
              <div className="h-80">
                <Line data={rolloverData} options={chartOptions} />
              </div>
              <div className="mt-4 space-y-2">
                {metrics.sprintMetrics.slice().reverse().map(sprint => {
                  const issues = sprint.rolloverIssues || [];
                  const breakdown = sprint.rolloverReasonBreakdown || {};
                  if (issues.length === 0) return null;
                  return (
                    <details key={sprint.sprintId} className="bg-red-50 rounded-lg border border-red-100">
                      <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-red-800 hover:bg-red-100 rounded-lg flex justify-between items-center">
                        <span className="truncate mr-2">{sprint.sprintName}</span>
                        <span className="shrink-0">{issues.length} rolled over ({formatNumber(sprint.rolloverRate)}%)</span>
                      </summary>
                      <div className="px-3 pb-3">
                        {Object.keys(breakdown).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 py-2 mb-2 border-b border-red-200">
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
                        <div className="space-y-0">
                          {issues.map(issue => (
                            <div key={issue.key} className="flex items-center gap-2 text-xs text-gray-700 py-1.5 border-t border-red-100">
                              <a href={`${credentials.jiraUrl.replace(/\/$/, '')}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer" className="font-mono font-semibold text-red-700 shrink-0 hover:underline">{issue.key}</a>
                              <span className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600 shrink-0">{issue.type}</span>
                              <span className="flex-1 truncate" title={issue.summary}>{issue.summary}</span>
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

            {/* Mid-Sprint Additions + Issues */}
            <div>
              <h3 className="font-semibold mb-4">Mid-Sprint Additions</h3>
              <div className="space-y-2">
                {metrics.sprintMetrics.slice().reverse().map(sprint => {
                  const msIssues = sprint.midSprintAdditions?.issues || [];
                  const msCount = sprint.midSprintAdditions?.count || 0;
                  if (msCount === 0) {
                    return (
                      <div key={sprint.sprintId} className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                        <span className="text-sm font-medium text-gray-600">{sprint.sprintName}</span>
                        <span className="text-sm text-gray-400">0 issues (0.0%)</span>
                      </div>
                    );
                  }
                  return (
                    <details key={sprint.sprintId} className="bg-amber-50 rounded-lg border border-amber-100">
                      <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-amber-800 hover:bg-amber-100 rounded-lg flex justify-between items-center">
                        <span className="truncate mr-2">{sprint.sprintName}</span>
                        <span className="shrink-0">{msCount} issues ({formatNumber(sprint.midSprintAdditions?.percentage)}%)</span>
                      </summary>
                      <div className="px-3 pb-3 space-y-0">
                        {msIssues.map(issue => (
                          <div key={issue.key} className="flex items-center gap-2 text-xs text-gray-700 py-1.5 border-t border-amber-100">
                            <a href={`${credentials.jiraUrl.replace(/\/$/, '')}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer" className="font-mono font-semibold text-amber-700 shrink-0 hover:underline">{issue.key}</a>
                            <span className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600 shrink-0">{issue.type}</span>
                            <span className="flex-1 truncate" title={issue.summary}>{issue.summary}</span>
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

        {/* Pillar 2: Team Ownership */}
        <div className="card mb-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">
            👥 Pillar 2: Team Ownership & Execution
          </h2>

          {/* Overall Backlog Health Score */}
          {(() => {
            const overallScore = metrics.backlogHealth?.overallScore ?? 0;
            const scoreColor = overallScore >= 80 ? 'text-green-600' : overallScore >= 50 ? 'text-yellow-600' : 'text-red-600';
            const scoreBg = overallScore >= 80 ? 'bg-green-50 border-green-200' : overallScore >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';
            return (
              <div className={`flex items-center gap-4 p-4 rounded-xl border ${scoreBg} mb-6`}>
                <div className={`text-4xl font-black ${scoreColor}`}>{formatNumber(overallScore)}%</div>
                <div>
                  <div className="font-semibold text-gray-800">Overall Backlog Health</div>
                  <div className="text-sm text-gray-500">Average across all backlog quality metrics</div>
                </div>
              </div>
            );
          })()}

          {/* Backlog Health Metrics */}
          <div className="space-y-4">
            {[
              {
                label: 'Acceptance Criteria',
                description: 'Items with clearly defined acceptance criteria',
                value: metrics.backlogHealth?.withAcceptanceCriteria ?? 0,
                missing: metrics.backlogHealth?.missingAC || [],
                missingLabel: 'Missing AC',
                color: { bar: 'bg-blue-500', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', hoverBg: 'hover:bg-blue-100', lightBar: 'bg-blue-100', badge: 'bg-blue-100 text-blue-800', link: 'text-blue-700', divider: 'border-blue-100' }
              },
              {
                label: 'Story Points / Estimates',
                description: 'Items with effort estimates assigned',
                value: metrics.backlogHealth?.withEstimates ?? 0,
                missing: metrics.backlogHealth?.missingEstimates || [],
                missingLabel: 'Missing Estimates',
                color: { bar: 'bg-green-500', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', hoverBg: 'hover:bg-green-100', lightBar: 'bg-green-100', badge: 'bg-green-100 text-green-800', link: 'text-green-700', divider: 'border-green-100' }
              },
              {
                label: 'Fix Versions / Goals',
                description: 'Items linked to a release or fix version',
                value: metrics.backlogHealth?.linkedToGoals ?? 0,
                missing: metrics.backlogHealth?.missingFixVersions || [],
                missingLabel: 'Missing Fix Versions',
                color: { bar: 'bg-orange-500', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', hoverBg: 'hover:bg-orange-100', lightBar: 'bg-orange-100', badge: 'bg-orange-100 text-orange-800', link: 'text-orange-700', divider: 'border-orange-100' }
              }
            ].map(metric => {
              const total = metrics.backlogHealth?.totalItems || 0;
              const hasDetails = metric.missing.length > 0;
              const isComplete = metric.value >= 100;
              const statusColor = metric.value >= 80 ? 'text-green-600' : metric.value >= 50 ? 'text-yellow-600' : 'text-red-600';

              return (
                <details key={metric.label} className={`rounded-xl border ${metric.color.border} overflow-hidden group`}>
                  <summary className={`p-5 cursor-pointer ${metric.color.hoverBg} transition-colors list-none`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <svg className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        <div>
                          <div className="font-semibold text-gray-800">{metric.label}</div>
                          <div className="text-xs text-gray-500">{metric.description}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${statusColor}`}>{formatNumber(metric.value)}%</div>
                        {!isComplete && total > 0 && (
                          <div className="text-xs text-gray-400">{metric.missing.length > 0 ? `${metric.missing.length}` : '?'} of {total} missing</div>
                        )}
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className={`w-full h-2.5 ${metric.color.lightBar} rounded-full overflow-hidden`}>
                      <div className={`h-full ${metric.color.bar} rounded-full transition-all`} style={{ width: `${Math.min(metric.value, 100)}%` }} />
                    </div>
                  </summary>

                  <div className={`${metric.color.bg} px-5 pb-4 pt-2`}>
                    {hasDetails ? (
                      <>
                        <div className={`text-xs font-semibold ${metric.color.text} mb-2`}>
                          {metric.missingLabel} ({metric.missing.length} of {total} items)
                        </div>
                        <div className="max-h-56 overflow-y-auto rounded-lg bg-white border border-gray-100">
                          {metric.missing.map((issue, idx) => (
                            <div key={issue.key} className={`flex items-center gap-2 text-xs text-gray-700 px-3 py-2 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                              <a href={`${credentials.jiraUrl.replace(/\/$/, '')}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer" className={`font-mono font-semibold ${metric.color.link} shrink-0 hover:underline`}>{issue.key}</a>
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${metric.color.badge}`}>{issue.type}</span>
                              <span className="flex-1 truncate" title={issue.summary}>{issue.summary}</span>
                              <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 text-xs shrink-0">{issue.status}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : isComplete ? (
                      <div className="flex items-center gap-2 text-sm text-green-700 py-2">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        All items meet this criteria
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Click "Refresh from Jira" to load item details
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
