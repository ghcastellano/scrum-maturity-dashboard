import { useState, useEffect, useRef } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import api from '../services/api';
import MaturityBadge from './MaturityBadge';
import MaturityLevelsReference from './MaturityLevelsReference';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartDataLabels
);

export default function Dashboard({ credentials: credentialsProp, selectedBoards, newlyAddedBoard, onNewBoardHandled, onBoardDeleted, locale = 'en', t }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshAllProgress, setRefreshAllProgress] = useState('');
  const [error, setError] = useState('');
  const [selectedBoard, setSelectedBoard] = useState(selectedBoards[0]);
  const [allBoardsData, setAllBoardsData] = useState({});
  const [history, setHistory] = useState([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [localCredentials, setLocalCredentials] = useState(credentialsProp);
  const [availableSprints, setAvailableSprints] = useState([]);
  const [selectedSprintIds, setSelectedSprintIds] = useState([]);
  const [showSprintSelector, setShowSprintSelector] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});
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

  // When a new board is added from TeamSelector, auto-select it
  useEffect(() => {
    if (newlyAddedBoard) {
      const boardId = typeof newlyAddedBoard === 'object' ? newlyAddedBoard.id : newlyAddedBoard;
      setSelectedBoard(newlyAddedBoard);
      onNewBoardHandled?.();

      // If board has cached data, use it immediately
      if (allBoardsData[String(boardId)]) {
        setMetrics(allBoardsData[String(boardId)]);
        loadBoardHistory(boardId);
      } else {
        // Clear metrics so the auto-refresh useEffect triggers
        setMetrics(null);
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
          loadBoardHistory(firstBoardId);
          setLoading(false);
        } else {
          // Selected board has no data yet - use first available board with data
          const firstWithData = result.boards[0];
          setMetrics(firstWithData.metrics_data);
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
      setSelectedHistoryId(null);
      setError('');
      loadBoardHistory(boardId);
    } else {
      // Board has no data - clear metrics so auto-refresh useEffect triggers
      setMetrics(null);
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
        // Default: select the 6 most recent (sprints are sorted oldest-first)
        setSelectedSprintIds(result.sprints.slice(-6).map(s => s.id));
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

    if (!window.confirm(t('confirmDelete', { name: boardName }))) return;

    try {
      await api.deleteBoard(boardId);

      // Remove from local state
      setAllBoardsData(prev => {
        const next = { ...prev };
        delete next[String(boardId)];
        return next;
      });
      setDbBoards(prev => prev.filter(b => b.id !== boardId));

      // Notify parent to remove from selectedBoards
      onBoardDeleted?.(boardId);

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
          loadBoardHistory(nextId);
        }
      } else {
        setMetrics(null);
        setError(t('noSavedMetrics'));
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

      const teamData = await api.getTeamMetrics(
        credentials.jiraUrl, credentials.email, credentials.apiToken,
        boardId, 6, true
      );

      setMetrics(teamData.data);
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

  // Refresh ALL loaded boards from Jira (sequential to avoid rate limits)
  const refreshAllBoards = async () => {
    if (!credentials || displayBoards.length === 0) return;
    const confirmed = window.confirm(
      locale === 'pt-BR'
        ? `Isso atualizara ${displayBoards.length} board(s) do Jira. A operacao pode levar ate ${displayBoards.length * 2} minutos. Deseja continuar?`
        : `This will refresh ${displayBoards.length} board(s) from Jira. The operation may take up to ${displayBoards.length * 2} minutes. Continue?`
    );
    if (!confirmed) return;

    setRefreshingAll(true);
    setError('');

    for (let i = 0; i < displayBoards.length; i++) {
      const board = displayBoards[i];
      const boardId = typeof board === 'object' ? board.id : board;
      const boardName = typeof board === 'object' ? board.name : `Board ${boardId}`;
      setRefreshAllProgress(`${i + 1}/${displayBoards.length}: ${boardName}`);

      try {
        const teamData = await api.getTeamMetrics(
          credentials.jiraUrl, credentials.email, credentials.apiToken,
          boardId, 6, true
        );
        if (teamData.success) {
          setAllBoardsData(prev => ({ ...prev, [String(boardId)]: teamData.data }));
          // If this is the currently selected board, update the view
          const currentBoardId = typeof selectedBoard === 'object' ? selectedBoard.id : selectedBoard;
          if (String(boardId) === String(currentBoardId)) {
            setMetrics(teamData.data);
          }
        }
      } catch (err) {
        console.error(`Failed to refresh board ${boardName}:`, err.message);
      }
    }

    setRefreshingAll(false);
    setRefreshAllProgress('');
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
          const teamData = await api.getTeamMetrics(credentials.jiraUrl, credentials.email, credentials.apiToken, boardId, 6, true);

          if (teamData.success) {
            setMetrics(teamData.data);
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
              {refreshing
                ? t('loadingFromJira', { name: boardName })
                : t('loadingMetrics')}
            </p>
            <p className="mt-2 text-sm text-gray-500">{t('mayTakeMinute')}</p>
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
                {refreshing ? t('refreshing') : t('refreshFromJira')}
              </button>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  // Sort sprint metrics chronologically (oldest first) regardless of backend order
  const sortedSprintMetrics = metrics
    ? [...metrics.sprintMetrics].sort((a, b) => {
        if (a.startDate && b.startDate) return new Date(a.startDate) - new Date(b.startDate);
        // Fallback: parse date from sprint name like "[2/5 - 2/19] AISDR- S24"
        const parseStart = (name) => {
          const m = name.match(/\[(\d+\/\d+)/);
          if (m) { const [mo, da] = m[1].split('/'); return new Date(2025, mo - 1, da).getTime(); }
          return 0;
        };
        return parseStart(a.sprintName) - parseStart(b.sprintName);
      })
    : [];

  // Prepare chart data (safe even if metrics is null)
  const sprintLabels = sortedSprintMetrics.map(s => s.sprintName);
  
  const sprintGoalData = {
    labels: sprintLabels,
    datasets: [
      {
        label: locale === 'pt-BR' ? 'Conclusao do Compromisso (%)' : 'Commitment Completion (%)',
        data: sortedSprintMetrics.map(s => s.sprintGoalAttainment),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.3,
        fill: true
      },
      {
        label: locale === 'pt-BR' ? 'Meta Nivel 3 (70%)' : 'Level 3 Target (70%)',
        data: Array(sprintLabels.length).fill(70),
        borderColor: 'rgb(34, 197, 94)',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        fill: false
      },
      {
        label: locale === 'pt-BR' ? 'Limite Nivel 1 (50%)' : 'Level 1 Threshold (50%)',
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
        label: locale === 'pt-BR' ? 'Taxa de Rollover (%)' : 'Rollover Rate (%)',
        data: sortedSprintMetrics.map(s => s.rolloverRate),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.3,
        fill: true
      },
      {
        label: locale === 'pt-BR' ? 'Limite Nivel 2 (20%)' : 'Level 2 Upper Limit (20%)',
        data: Array(sprintLabels.length).fill(20),
        borderColor: 'rgb(251, 191, 36)',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        fill: false
      },
      {
        label: locale === 'pt-BR' ? 'Meta Nivel 3 (15%)' : 'Level 3 Target (15%)',
        data: Array(sprintLabels.length).fill(15),
        borderColor: 'rgb(34, 197, 94)',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        fill: false
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top'
      },
      datalabels: {
        display: false
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
            <h1 className="text-4xl font-bold text-gray-900">{t('appTitle')}</h1>
            {credentials && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => refreshFromJira()}
                  disabled={refreshing || refreshingAll}
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <span>🔄</span>
                  {refreshing ? t('refreshing') : t('refreshFromJira')}
                </button>
                {displayBoards.length > 1 && (
                  <button
                    onClick={refreshAllBoards}
                    disabled={refreshing || refreshingAll}
                    className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    title={locale === 'pt-BR'
                      ? `Atualizar todos os ${displayBoards.length} boards do Jira (pode levar ate ${displayBoards.length * 2} min)`
                      : `Refresh all ${displayBoards.length} boards from Jira (may take up to ${displayBoards.length * 2} min)`}
                  >
                    <span>🔄</span>
                    {refreshingAll ? refreshAllProgress : t('refreshAllBoards')}
                  </button>
                )}
              </div>
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
                  <span className="hidden sm:inline">{t('delete')}</span>
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
                {showSprintSelector ? t('hideSprints') : t('selectSprints')}
              </button>
            )}

            {history.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-600">{t('history')}:</label>
                <select
                  value={selectedHistoryId || ''}
                  onChange={(e) => loadHistoricalMetrics(Number(e.target.value))}
                  className="input-field max-w-xs text-sm"
                >
                  {history.map(h => (
                    <option key={h.id} value={h.id}>
                      {new Date(h.calculated_at).toLocaleDateString(locale === 'pt-BR' ? 'pt-BR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })} - {t('maturityLevel')} {h.maturity_level}
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
                <h3 className="font-semibold text-gray-800">{t('selectSprintsToAnalyze')}</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedSprintIds(availableSprints.slice(-6).map(s => s.id))}
                    className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    {t('lastN', { n: '6' })}
                  </button>
                  <button
                    onClick={() => setSelectedSprintIds(availableSprints.map(s => s.id))}
                    className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    {t('selectAll')}
                  </button>
                  <button
                    onClick={() => setSelectedSprintIds([])}
                    className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    {t('clear')}
                  </button>
                </div>
              </div>

              {loadingSprints ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="mt-2 text-sm text-gray-500">{t('loadingSprints')}</p>
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
                      {selectedSprintIds.length} {t('sprintsSelected')}
                    </span>
                    <button
                      onClick={refreshWithSelectedSprints}
                      disabled={selectedSprintIds.length === 0 || refreshing}
                      className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {refreshing ? t('analyzing') : t('analyzeSelectedSprints')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

        </div>

        {/* Inline loading/empty state when no metrics available */}
        {!metrics && renderLoadingOrEmpty()}

        {/* Scrum Maturity Content */}
        {metrics && (
        <>
        {/* Maturity Level Card */}
        <div className="card mb-8">
          {/* Header row */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">{t('teamMaturityLevel')}</h2>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>{t('basedOn')}</span>
              <span className="font-semibold text-primary-600">{metrics.sprintsAnalyzed} {t('sprints')}</span>
            </div>
          </div>

          {/* Badge + Characteristics row */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left: Badge */}
            <div className="lg:w-64 shrink-0">
              <MaturityBadge {...metrics.maturityLevel} size="large" locale={locale} />

              {/* Support Model for Level 2 */}
              {metrics.maturityLevel.supportModel && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-xs font-semibold text-yellow-900">{t('supportModel')}:</p>
                  <p className="text-xs text-yellow-800">{metrics.maturityLevel.supportModel}</p>
                </div>
              )}
            </div>

            {/* Right: Key metrics aligned to pillars */}
            {(() => {
              const level = metrics.maturityLevel.level;
              const rollover = metrics.aggregated?.avgRolloverRate ?? 0;
              const backlogReady = metrics.backlogHealth?.overallScore ?? 0;

              // Thresholds for next level
              const thresholds = level === 1
                ? { rollover: { max: 25, label: '≤25%' }, backlogReady: { min: 25, label: '≥25%' }, nextLevel: 2 }
                : level === 2
                ? { rollover: { max: 15, label: '<15%' }, backlogReady: { min: 75, label: '>75%' }, nextLevel: 3 }
                : null;

              const metricItems = [
                { icon: '📉', label: t('rolloverRate'), blocking: thresholds ? rollover > thresholds.rollover.max : false, target: thresholds?.rollover.label, current: `${formatNumber(rollover)}%` },
                { icon: '📋', label: t('backlogReadiness'), blocking: thresholds ? backlogReady < thresholds.backlogReady.min : false, target: thresholds?.backlogReady.label, current: `${formatNumber(backlogReady)}%` },
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
                                ? t('needsForLevel', { target: item.target, level: thresholds.nextLevel })
                                : t('passing', { target: item.target })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {thresholds && blockingCount > 0 && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm font-semibold text-red-800">
                        {t('metricsBlocking', { count: blockingCount, level: thresholds.nextLevel })}
                      </p>
                      <p className="text-xs text-red-600 mt-1">
                        {metricItems.filter(m => m.blocking).map(m => `${m.label} (${m.current} → ${m.target})`).join(' · ')}
                      </p>
                    </div>
                  )}
                  {level === 3 && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm font-semibold text-green-800">{t('allMetricsHighest')}</p>
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
                {t('recommendations')} ({metrics.maturityLevel.recommendations.length})
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="card">
            <div className="text-sm text-gray-600 mb-1">{t('avgSprintHitRate')}</div>
            <div className="text-3xl font-bold text-primary-600">
              {formatNumber(metrics.aggregated?.avgSprintHitRate)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {t('sprintHitRateDesc')}
            </div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-600 mb-1">{t('avgRolloverRate')}</div>
            <div className="text-3xl font-bold text-red-600">
              {formatNumber(metrics.aggregated?.avgRolloverRate)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {t('targetLevel3')}: &lt;10-15%
            </div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-600 mb-1">{t('backlogReadiness')}</div>
            <div className="text-3xl font-bold text-blue-600">
              {formatNumber(metrics.backlogHealth?.overallScore)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {t('targetLevel3')}: &gt;75%
            </div>
          </div>
        </div>

        {/* Maturity Levels Reference */}
        <MaturityLevelsReference locale={locale} t={t} />

        {/* Pillar 1: Delivery Predictability */}
        <div className="card mb-8">
          <h2 className="text-2xl font-bold mb-2 text-gray-800">
            📊 {t('pillar1')}
          </h2>
          <p className="text-sm text-gray-500 mb-6">{t('pillar1Subtitle')}</p>

          <div className="grid grid-cols-1 gap-6">
            {/* Sprint Hit Rate — Committed + Accepted + Completed (story points) */}
            <div>
              <h3 className="font-semibold mb-2">{t('sprintHitRate')}</h3>
              <p className="text-xs text-gray-500 mb-4">
                {locale === 'pt-BR'
                  ? 'Committed = pontos planejados no inicio da sprint (exclui injecoes mid-sprint). Accepted = total de pontos na sprint apos mudancas (inclui mid-sprint, exclui removidos). Completed = pontos concluidos.'
                  : 'Committed = points planned at sprint start (excludes mid-sprint injections). Accepted = total points in sprint after changes (includes mid-sprint, excludes removed). Completed = points done.'}
              </p>
              <div className="h-80">
                <Bar
                  data={{
                    labels: sprintLabels,
                    datasets: [
                      {
                        label: 'Committed (pts)',
                        data: sortedSprintMetrics.map(s => s.plannedPoints || s.committedPoints || 0),
                        backgroundColor: 'rgba(59, 130, 246, 0.6)',
                        borderColor: 'rgb(59, 130, 246)',
                        borderWidth: 1,
                        borderRadius: 4
                      },
                      {
                        label: 'Accepted (pts)',
                        data: sortedSprintMetrics.map(s => s.committedPoints || 0),
                        backgroundColor: 'rgba(99, 102, 241, 0.6)',
                        borderColor: 'rgb(99, 102, 241)',
                        borderWidth: 1,
                        borderRadius: 4
                      },
                      {
                        label: 'Completed (pts)',
                        data: sortedSprintMetrics.map(s => s.completedPoints || 0),
                        backgroundColor: sortedSprintMetrics.map(s =>
                          (s.sprintHitRatePoints || 0) >= 70 ? 'rgba(34, 197, 94, 0.6)' :
                          (s.sprintHitRatePoints || 0) >= 50 ? 'rgba(251, 191, 36, 0.6)' :
                          'rgba(239, 68, 68, 0.6)'
                        ),
                        borderColor: sortedSprintMetrics.map(s =>
                          (s.sprintHitRatePoints || 0) >= 70 ? 'rgb(34, 197, 94)' :
                          (s.sprintHitRatePoints || 0) >= 50 ? 'rgb(251, 191, 36)' :
                          'rgb(239, 68, 68)'
                        ),
                        borderWidth: 1,
                        borderRadius: 4
                      }
                    ]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: true, position: 'top' },
                      tooltip: {
                        callbacks: {
                          afterBody: (items) => {
                            const idx = items[0]?.dataIndex;
                            if (idx !== undefined) {
                              const s = sortedSprintMetrics[idx];
                              const committed = s.plannedPoints || s.committedPoints || 0;
                              const accepted = s.committedPoints || 0;
                              const delta = accepted - committed;
                              const lines = [`Hit Rate: ${formatNumber(s.sprintHitRatePoints)}%`];
                              if (delta !== 0) {
                                lines.push(`Mid-sprint delta: ${delta > 0 ? '+' : ''}${formatNumber(delta)} pts`);
                              }
                              return lines;
                            }
                          }
                        }
                      },
                      datalabels: {
                        display: true,
                        color: '#374151',
                        font: { size: 10, weight: 'bold' },
                        anchor: 'end',
                        align: 'top',
                        offset: -2,
                        formatter: (value) => value > 0 ? value : ''
                      }
                    },
                    scales: {
                      y: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
                      x: { ticks: { font: { size: 10 }, maxRotation: 45 }, grid: { display: false } }
                    }
                  }}
                />
              </div>
              {/* Hit Rate % per sprint */}
              <div className="mt-3 flex flex-wrap gap-2">
                {sortedSprintMetrics.map(s => {
                  const rate = s.sprintHitRatePoints || 0;
                  const color = rate >= 70 ? 'bg-green-100 text-green-800' : rate >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
                  return (
                    <div key={s.sprintId} className={`px-2 py-1 rounded-lg text-xs font-medium ${color}`}>
                      {s.sprintName.replace(/.*?([A-Z]+-\s*S\d+)/i, '$1') || s.sprintName}: {formatNumber(rate)}%
                    </div>
                  );
                })}
              </div>
              {/* Rollover detail per sprint */}
              <div className="mt-4 space-y-2">
                {sortedSprintMetrics.map(sprint => {
                  const issues = sprint.rolloverIssues || [];
                  const breakdown = sprint.rolloverReasonBreakdown || {};
                  if (issues.length === 0) return null;
                  return (
                    <details key={sprint.sprintId} className="bg-red-50 rounded-lg border border-red-100">
                      <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-red-800 hover:bg-red-100 rounded-lg flex justify-between items-center">
                        <span className="truncate mr-2">{sprint.sprintName}</span>
                        <span className="shrink-0">{issues.length} {t('rolledOver')} ({formatNumber(sprint.rolloverRate)}%)</span>
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
                                {t(reason) !== reason ? t(reason) : reason}: {count}
                              </span>
                            ))}
                          </div>
                        )}
                        {issues.some(i => i.addedMidSprint) && (
                          <div className="text-[10px] text-gray-500 italic pt-1 pb-1">
                            {locale === 'pt-BR'
                              ? '* added to the sprint — item foi rollover mas foi adicionado apos o inicio da sprint (mid-sprint injection)'
                              : '* added to the sprint — item rolled over but was added after sprint start (mid-sprint injection)'}
                          </div>
                        )}
                        <div className="space-y-0">
                          {issues.map(issue => (
                            <div key={issue.key} className="flex items-center gap-2 text-xs text-gray-700 py-1.5 border-t border-red-100">
                              <a href={`${credentials.jiraUrl.replace(/\/$/, '')}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer" className="font-mono font-semibold text-red-700 shrink-0 hover:underline">
                                {issue.key}
                                {issue.addedMidSprint && (
                                  <span className="text-amber-600 ml-0.5" title={locale === 'pt-BR' ? 'added to the sprint (mid-sprint injection)' : 'added to the sprint (mid-sprint injection)'}>*</span>
                                )}
                              </a>
                              <span className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600 shrink-0">{issue.type}</span>
                              <span className="flex-1 truncate" title={issue.summary}>{issue.summary}</span>
                              {issue.addedMidSprint && (
                                <span className="px-1.5 py-0.5 rounded text-xs shrink-0 bg-amber-100 text-amber-800" title="mid-sprint injection">
                                  added to the sprint
                                </span>
                              )}
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
          </div>
        </div>

        {/* Pillar 2: Flow & Quality */}
        {metrics.flowQuality && (
        <div className="card mb-8">
          <h2 className="text-2xl font-bold mb-2 text-gray-800">
            🔄 {t('pillar2')}
          </h2>
          <p className="text-sm text-gray-500 mb-6">{t('pillar2Subtitle')}</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Col 1: Development Cycle Time by Work Type */}
            <div>
              <h3 className="font-semibold mb-2">{t('devCycleTimeByType')}</h3>
              <p className="text-xs text-gray-500 mb-4">{t('devCycleTimeDesc')}</p>
              {Object.keys(metrics.flowQuality.leadTimeByType).length > 0 ? (
                <>
                  <div className="h-56">
                    <Bar
                      data={{
                        labels: Object.keys(metrics.flowQuality.leadTimeByType),
                        datasets: [{
                          label: t('avgLeadTimeDays'),
                          data: Object.values(metrics.flowQuality.leadTimeByType),
                          backgroundColor: Object.keys(metrics.flowQuality.leadTimeByType).map((type) => {
                            const colors = {
                              Bug: 'rgba(239, 68, 68, 0.7)',
                              Story: 'rgba(59, 130, 246, 0.7)',
                              Improvement: 'rgba(168, 85, 247, 0.7)',
                              'New Feature': 'rgba(14, 165, 233, 0.7)',
                              Request: 'rgba(245, 158, 11, 0.7)',
                              Epic: 'rgba(16, 185, 129, 0.7)',
                            };
                            return colors[type] || 'rgba(107, 114, 128, 0.7)';
                          }),
                          borderRadius: 6
                        }]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: { callbacks: { label: (item) => `${item.raw} ${t('days')}` } },
                          datalabels: {
                            display: true,
                            color: '#374151',
                            font: { size: 11, weight: 'bold' },
                            anchor: 'end',
                            align: 'top',
                            offset: -2,
                            formatter: (value) => value > 0 ? `${value}d` : ''
                          }
                        },
                        scales: { y: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { ticks: { font: { size: 11 } }, grid: { display: false } } }
                      }}
                    />
                  </div>
                  {/* Trend by sprint */}
                  {metrics.flowQuality.leadTimeByTypeBySprint.length > 1 && (() => {
                    const sprints = metrics.flowQuality.leadTimeByTypeBySprint;
                    const types = [...new Set(sprints.flatMap(s => Object.keys(s).filter(k => k !== 'sprint')))];
                    const colors = { Story: 'rgb(59, 130, 246)', Bug: 'rgb(239, 68, 68)', Improvement: 'rgb(168, 85, 247)', 'New Feature': 'rgb(14, 165, 233)', Request: 'rgb(245, 158, 11)', Epic: 'rgb(16, 185, 129)', 'Tech Debt': 'rgb(107, 114, 128)' };
                    return (
                      <div className="mt-4">
                        <p className="text-xs text-gray-500 mb-2 font-medium">{t('trendBySprint')}</p>
                        <div className="h-44">
                          <Line
                            data={{
                              labels: sprints.map(s => s.sprint),
                              datasets: types.map(type => ({
                                label: type,
                                data: sprints.map(s => s[type] ?? null),
                                borderColor: colors[type] || 'rgb(156, 163, 175)',
                                backgroundColor: 'transparent',
                                tension: 0.3,
                                pointRadius: 3,
                                borderWidth: 2,
                                spanGaps: true
                              }))
                            }}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
                                tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${item.raw} ${t('days')}` } },
                                datalabels: { display: false }
                              },
                              scales: { y: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' }, title: { display: true, text: t('days'), font: { size: 10 } } }, x: { ticks: { font: { size: 9 }, maxRotation: 45 }, grid: { display: false } } }
                            }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <p className="text-sm text-gray-400">{t('noResolvedIssues')}</p>
              )}
            </div>

            {/* Col 2: QA Rework (Back to Dev) */}
            <div>
              <h3 className="font-semibold mb-2">{locale === 'pt-BR' ? 'Retrabalho QA (Retorno ao Dev)' : 'QA Rework (Back to Dev)'}</h3>
              <p className="text-xs text-gray-500 mb-4">
                {locale === 'pt-BR'
                  ? 'Issues que voltaram de QA/Review para In Progress/Desenvolvimento.'
                  : 'Issues sent back from QA/Review to In Progress/Development.'}
              </p>
              {metrics.flowQuality.reworkBySprint && metrics.flowQuality.reworkBySprint.length > 0 ? (
                <>
                  <div className="h-72">
                    <Bar
                      data={{
                        labels: metrics.flowQuality.reworkBySprint.map(s => s.sprint),
                        datasets: [
                          {
                            label: locale === 'pt-BR' ? 'Retrabalho' : 'Rework',
                            data: metrics.flowQuality.reworkBySprint.map(s => s.reworkCount),
                            backgroundColor: 'rgba(239, 68, 68, 0.6)',
                            borderColor: 'rgb(239, 68, 68)',
                            borderWidth: 1,
                            borderRadius: 4
                          }
                        ]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: { top: 25 } },
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            callbacks: {
                              label: (item) => {
                                const s = metrics.flowQuality.reworkBySprint[item.dataIndex];
                                return `${item.raw} rework / ${s.totalIssues} total (${s.reworkRate}%)`;
                              }
                            }
                          },
                          datalabels: {
                            display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0,
                            color: '#991b1b',
                            font: { size: 10, weight: 'bold' },
                            anchor: 'end',
                            align: 'top',
                            offset: 2,
                            formatter: (value, ctx) => {
                              const s = metrics.flowQuality.reworkBySprint[ctx.dataIndex];
                              return `${value} (${s.reworkRate}%)`;
                            }
                          }
                        },
                        scales: {
                          y: { beginAtZero: true, ticks: { font: { size: 11 }, stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.05)' } },
                          x: { ticks: { font: { size: 10 }, maxRotation: 45 }, grid: { display: false } }
                        }
                      }}
                    />
                  </div>
                  <div className="mt-3 flex items-center gap-3 p-3 rounded-lg border bg-gray-50 border-gray-200">
                    <span className="text-xl">{metrics.flowQuality.healthySignals.minimalRework ? '✅' : '⚠️'}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {locale === 'pt-BR' ? 'Taxa Geral' : 'Overall Rate'}: {metrics.flowQuality.reworkRate}%
                      </p>
                      <p className="text-xs text-gray-500">
                        {locale === 'pt-BR' ? 'Saudável: <15%' : 'Healthy: <15%'}
                      </p>
                    </div>
                  </div>
                  {/* Rework issue details per sprint */}
                  {metrics.flowQuality.reworkBySprint.some(s => s.reworkDetails?.length > 0) && (
                    <div className="mt-3 space-y-1">
                      {metrics.flowQuality.reworkBySprint.map(s => {
                        if (!s.reworkDetails?.length) return null;
                        return (
                          <details key={s.sprint} className="bg-red-50 rounded border border-red-100">
                            <summary className="px-2 py-1.5 cursor-pointer text-xs font-medium text-red-800 hover:bg-red-100 rounded">
                              {s.sprint}: {s.reworkCount} {locale === 'pt-BR' ? 'retornaram ao dev' : 'sent back to dev'}
                            </summary>
                            <div className="px-2 pb-2">
                              {s.reworkDetails.map(d => (
                                <div key={d.key} className="flex items-center gap-2 text-xs text-gray-700 py-1 border-t border-red-100">
                                  <a href={`${credentials?.jiraUrl?.replace(/\/$/, '')}/browse/${d.key}`} target="_blank" rel="noopener noreferrer" className="font-mono font-semibold text-red-700 shrink-0 hover:underline">{d.key}</a>
                                  <span className="px-1 bg-gray-200 rounded text-gray-600 shrink-0">{d.type}</span>
                                  <span className="flex-1 truncate" title={d.summary}>{d.summary}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400">{locale === 'pt-BR' ? 'Sem dados de retrabalho' : 'No rework data'}</p>
              )}
            </div>

          </div>
        </div>
        )}

        {/* Pillar 3: Team Ownership & Execution */}
        <div className="card mb-8">
          <h2 className="text-2xl font-bold mb-2 text-gray-800">
            👥 {t('pillar3')}
          </h2>
          <p className="text-sm text-gray-500 mb-6">{t('pillar3Subtitle')}</p>

          {/* Overall Backlog Health Score */}
          {(() => {
            const overallScore = metrics.backlogHealth?.overallScore ?? 0;
            const scoreColor = overallScore >= 75 ? 'text-green-600' : overallScore >= 25 ? 'text-yellow-600' : 'text-red-600';
            const scoreBg = overallScore >= 75 ? 'bg-green-50 border-green-200' : overallScore >= 25 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';
            return (
              <div className={`flex items-center gap-4 p-4 rounded-xl border ${scoreBg} mb-6`}>
                <div className={`text-4xl font-black ${scoreColor}`}>{formatNumber(overallScore)}%</div>
                <div>
                  <div className="font-semibold text-gray-800">{t('overallBacklogHealth')}</div>
                  <div className="text-sm text-gray-500">{t('avgAcrossMetrics')}</div>
                </div>
              </div>
            );
          })()}

          {/* Backlog Health Metrics */}
          <div className="space-y-4">
            {[
              {
                label: t('acceptanceCriteria'),
                description: t('acceptanceCriteriaDesc'),
                value: metrics.backlogHealth?.withAcceptanceCriteria ?? 0,
                missing: metrics.backlogHealth?.missingAC || [],
                missingLabel: t('missingAC'),
                color: { bar: 'bg-blue-500', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', hoverBg: 'hover:bg-blue-100', lightBar: 'bg-blue-100', badge: 'bg-blue-100 text-blue-800', link: 'text-blue-700' }
              },
              {
                label: t('storyPointsEstimates'),
                description: t('storyPointsEstimatesDesc'),
                value: metrics.backlogHealth?.withEstimates ?? 0,
                missing: metrics.backlogHealth?.missingEstimates || [],
                missingLabel: t('missingEstimates'),
                color: { bar: 'bg-green-500', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', hoverBg: 'hover:bg-green-100', lightBar: 'bg-green-100', badge: 'bg-green-100 text-green-800', link: 'text-green-700' }
              }
            ].map(metric => {
              const total = metrics.backlogHealth?.totalItems || 0;
              const hasDetails = metric.missing.length > 0;
              const isComplete = metric.value >= 100;
              const statusColor = metric.value >= 75 ? 'text-green-600' : metric.value >= 25 ? 'text-yellow-600' : 'text-red-600';

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
                          <div className="text-xs text-gray-400">{t('ofMissing', { count: metric.missing.length > 0 ? metric.missing.length : '?', total })}</div>
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
                          {metric.missingLabel} ({metric.missing.length} {t('ofItems', { total })})
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
                        {t('allItemsMeetCriteria')}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {t('clickRefreshToLoad')}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}

            {/* Future Sprint Items */}
            {(() => {
              const futureData = metrics.backlogHealth?.futureSprintItems;
              if (!futureData) return null;
              return (
                <div className="rounded-xl border border-purple-200 overflow-hidden">
                  <div className="p-5 bg-purple-50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="font-semibold text-gray-800">{t('futureSprintItems')}</div>
                          <div className="text-xs text-gray-500">{t('futureSprintItemsDesc')}</div>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-6">
                        {futureData.avgVelocity && (
                          <div className="text-right">
                            <div className="text-lg font-bold text-indigo-600">{futureData.avgVelocity}</div>
                            <div className="text-xs text-gray-400">avg velocity</div>
                          </div>
                        )}
                        <div className="text-right">
                          <div className="text-2xl font-bold text-purple-600">{futureData.count}</div>
                          <div className="text-xs text-gray-400">{t('itemsAssigned')}</div>
                        </div>
                      </div>
                    </div>
                    {futureData.sprints && futureData.sprints.length > 0 && (
                      <div className="space-y-1.5 mt-3">
                        {futureData.sprints.map((s, idx) => (
                          <div key={idx}>
                            <div
                              className="flex items-center justify-between text-sm px-3 py-2 bg-white rounded-lg border border-purple-100 cursor-pointer hover:bg-purple-50 transition-colors"
                              onClick={() => setExpandedSections(prev => ({ ...prev, [`future-${idx}`]: !prev[`future-${idx}`] }))}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400 text-xs">{expandedSections[`future-${idx}`] ? '▼' : '▶'}</span>
                                <span className="text-gray-700">{s.name}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-blue-600 font-medium">{s.storyPoints || 0} pts</span>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.state === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{s.state}</span>
                                <span className="font-semibold text-purple-700">{s.itemCount} {t('issues')}</span>
                              </div>
                            </div>
                            {expandedSections[`future-${idx}`] && s.issues && s.issues.length > 0 && (
                              <div className="ml-6 mt-1 mb-2 space-y-1">
                                {s.issues.map((issue, iIdx) => (
                                  <div key={iIdx} className="flex items-center justify-between text-xs px-3 py-1.5 bg-white rounded border border-gray-100">
                                    <div className="flex items-center gap-2">
                                      <a href={`${credentials?.jiraUrl?.replace(/\/$/, '')}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">{issue.key}</a>
                                      <span className="text-gray-400">|</span>
                                      <span className="text-gray-500 truncate max-w-xs">{issue.summary}</span>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <span className="text-gray-400">{issue.type}</span>
                                      <span className="text-gray-400">|</span>
                                      <span className="text-gray-500">{issue.assignee}</span>
                                      {issue.points > 0 && <span className="text-blue-600 font-medium">{issue.points} pts</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
