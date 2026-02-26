import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api';
import EpicIntelligenceTab from './product/EpicIntelligenceTab';
import PrioritizationTab from './product/PrioritizationTab';
import PortfolioTab from './product/PortfolioTab';

export default function ProductManagement({ credentials, selectedBoards }) {
  const [fullData, setFullData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('epic-intelligence');
  const [dataSource, setDataSource] = useState(null);
  const [dataAge, setDataAge] = useState(null);
  const [fetchedBoardIds, setFetchedBoardIds] = useState([]); // tracks which boards are in fullData

  const allBoardIds = useMemo(
    () => selectedBoards.map(b => typeof b === 'object' ? b.id : b),
    [selectedBoards]
  );

  const boardList = selectedBoards.map(b => ({
    id: typeof b === 'object' ? b.id : b,
    name: typeof b === 'object' ? b.name : `Board ${b}`
  }));

  // Default: prefer CES Scrum Board, fallback to first board
  const [selectedBoardIds, setSelectedBoardIds] = useState(() => {
    const cesBoard = boardList.find(b => b.name.toLowerCase().includes('ces'));
    if (cesBoard) return [cesBoard.id];
    return allBoardIds.length > 0 ? [allBoardIds[0]] : [];
  });

  // Load from DB on mount (try selected boards first, then all boards as fallback)
  useEffect(() => {
    if (selectedBoardIds.length > 0) {
      loadFromDatabase(selectedBoardIds);
    }
  }, []);

  // Check if selected boards are covered by fetched data
  const uncoveredBoards = useMemo(() => {
    if (!fullData || !fullData.boardProjectMap) return selectedBoardIds;
    const coveredBoardIds = new Set(fetchedBoardIds.map(String));
    return selectedBoardIds.filter(id => !coveredBoardIds.has(String(id)));
  }, [selectedBoardIds, fetchedBoardIds, fullData]);

  const needsRefresh = uncoveredBoards.length > 0 && fullData !== null;

  // Filter epics by selected boards (client-side, instant)
  const filteredData = useMemo(() => {
    if (!fullData) return null;

    const boardProjectMap = fullData.boardProjectMap || {};
    // Get project keys for selected boards (only from covered boards)
    const activeProjectKeys = new Set(
      selectedBoardIds
        .map(id => boardProjectMap[id])
        .filter(Boolean)
    );

    // If no map available or all boards match, return full data
    if (activeProjectKeys.size === 0) return fullData;

    // Check if all projects are selected
    const allProjectKeys = new Set(Object.values(boardProjectMap));
    if (activeProjectKeys.size === allProjectKeys.size) return fullData;

    // Filter epics by project key
    const filteredEpics = fullData.epics.filter(epic => {
      const projectKey = epic.key.split('-')[0];
      return activeProjectKeys.has(projectKey);
    });

    return {
      ...fullData,
      epics: filteredEpics,
      summary: {
        total: filteredEpics.length,
        done: filteredEpics.filter(e => e.statusCategory === 'done').length,
        inProgress: filteredEpics.filter(e => e.statusCategory === 'indeterminate').length,
        todo: filteredEpics.filter(e => e.statusCategory === 'new' || e.statusCategory === 'undefined').length,
        blocked: filteredEpics.filter(e => e.health === 'blocked').length,
        atRisk: filteredEpics.filter(e => e.health === 'at-risk').length
      },
      initiatives: (fullData.initiatives || []).map(init => ({
        ...init,
        epics: (init.epics || []).filter(epic => {
          const projectKey = epic.key.split('-')[0];
          return activeProjectKeys.has(projectKey);
        })
      })).filter(init => init.epics.length > 0)
    };
  }, [fullData, selectedBoardIds]);

  // Try loading from database (fast, no Jira API call)
  const loadFromDatabase = async (boardIds) => {
    setLoading(true);
    setError('');
    try {
      // Try exact boardIds first
      let result = await api.getCachedProductData(boardIds);

      // If no data, try loading the all-boards cache as fallback
      if ((!result.success || !result.data) && boardIds.length < allBoardIds.length) {
        result = await api.getCachedProductData(allBoardIds);
        if (result.success && result.data) {
          setFetchedBoardIds(allBoardIds);
        }
      }

      if (result.success && result.data) {
        setFullData(result.data);
        if (!fetchedBoardIds.length) setFetchedBoardIds(boardIds);
        setDataSource('database');
        setDataAge(result.age || 0);
      } else {
        setDataSource(null);
      }
    } catch {
      setDataSource(null);
    } finally {
      setLoading(false);
    }
  };

  // Fetch fresh data from Jira API (only for SELECTED boards)
  const loadFromJira = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getEpics(
        credentials.jiraUrl,
        credentials.email,
        credentials.apiToken,
        selectedBoardIds // only fetch selected boards
      );
      if (result.success) {
        setFullData(result.data);
        setFetchedBoardIds([...selectedBoardIds]);
        setDataSource('jira');
        setDataAge(0);
      } else {
        setError(result.message || 'Failed to load epic data');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load epic data');
    } finally {
      setLoading(false);
    }
  };

  const toggleBoard = useCallback((boardId) => {
    setSelectedBoardIds(prev => {
      if (prev.includes(boardId)) {
        if (prev.length === 1) return prev;
        return prev.filter(id => id !== boardId);
      }
      return [...prev, boardId];
    });
  }, []);

  const selectAllBoards = useCallback(() => {
    setSelectedBoardIds(allBoardIds);
  }, [allBoardIds]);

  return (
    <div className="max-w-7xl mx-auto px-6">
      {/* Board Selector */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium text-gray-700">Portfolio Scope</h3>
            <span className="text-xs text-gray-500">
              {selectedBoardIds.length} of {boardList.length} boards selected
            </span>
            {dataSource && dataAge !== null && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                dataSource === 'database'
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-green-100 text-green-600'
              }`}>
                {dataSource === 'database'
                  ? `Cached (${dataAge < 1 ? '<1' : dataAge} min ago)`
                  : 'Fresh from Jira'}
              </span>
            )}
            {needsRefresh && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">
                {uncoveredBoards.length} board{uncoveredBoards.length > 1 ? 's' : ''} not loaded
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {selectedBoardIds.length < boardList.length && (
              <button onClick={selectAllBoards} className="text-xs text-purple-600 hover:text-purple-800">
                Select All
              </button>
            )}
            <button
              onClick={loadFromJira}
              disabled={loading}
              className="btn-primary text-xs px-3 py-1.5"
              style={{ backgroundColor: '#7c3aed' }}
            >
              {loading ? 'Loading...' : `Refresh from Jira (${selectedBoardIds.length} board${selectedBoardIds.length > 1 ? 's' : ''})`}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {boardList.map(board => (
            <button
              key={board.id}
              onClick={() => toggleBoard(board.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                selectedBoardIds.includes(board.id)
                  ? 'bg-purple-100 text-purple-700 border-purple-300'
                  : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {board.name}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading && !fullData && (
        <div className="card text-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading epic data...</p>
          <p className="text-xs text-gray-400 mt-1">
            {selectedBoardIds.length === 1
              ? `Loading 1 board...`
              : `Loading ${selectedBoardIds.length} boards...`
            }
          </p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="card bg-red-50 border-red-200 mb-6">
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={loadFromJira} className="mt-2 text-xs text-red-600 underline">
            Try again
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      {filteredData && (
        <>
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => setActiveTab('epic-intelligence')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'epic-intelligence'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Epic Intelligence
            </button>
            <button
              onClick={() => setActiveTab('prioritization')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'prioritization'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Prioritization
            </button>
            <button
              onClick={() => setActiveTab('portfolio')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'portfolio'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Portfolio
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'epic-intelligence' && (
            <EpicIntelligenceTab epicData={filteredData} loading={loading} credentials={credentials} />
          )}

          {activeTab === 'prioritization' && (
            <PrioritizationTab
              credentials={credentials}
              selectedBoards={selectedBoards}
              epicData={filteredData}
              prioritizationData={filteredData?.prioritizationData}
            />
          )}

          {activeTab === 'portfolio' && (
            <PortfolioTab
              credentials={credentials}
              selectedBoards={selectedBoards}
              portfolioData={filteredData?.portfolioData}
              epicData={filteredData}
            />
          )}
        </>
      )}

      {/* Empty State */}
      {!loading && !fullData && !error && (
        <div className="card text-center py-16">
          <p className="text-gray-500 text-lg">No data loaded yet</p>
          <p className="text-gray-400 text-sm mt-2">
            Click "Refresh from Jira" to load epic data for the {selectedBoardIds.length} selected board{selectedBoardIds.length > 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
