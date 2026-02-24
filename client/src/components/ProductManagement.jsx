import { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import EpicIntelligenceTab from './product/EpicIntelligenceTab';
import PrioritizationTab from './product/PrioritizationTab';
import PortfolioTab from './product/PortfolioTab';

export default function ProductManagement({ credentials, selectedBoards }) {
  const [fullData, setFullData] = useState(null); // raw data for ALL boards
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('epic-intelligence');
  const [dataSource, setDataSource] = useState(null); // 'database' | 'jira' | null
  const [dataAge, setDataAge] = useState(null); // minutes since last update

  // All board IDs (used for API calls — always fetch all)
  const allBoardIds = useMemo(
    () => selectedBoards.map(b => typeof b === 'object' ? b.id : b),
    [selectedBoards]
  );

  // Board selection for cross-board filtering (client-side only)
  const [selectedBoardIds, setSelectedBoardIds] = useState(allBoardIds);

  const boardList = selectedBoards.map(b => ({
    id: typeof b === 'object' ? b.id : b,
    name: typeof b === 'object' ? b.name : `Board ${b}`
  }));

  // Load from DB on mount only (once)
  useEffect(() => {
    if (allBoardIds.length > 0) {
      loadFromDatabase();
    }
  }, []);

  // Filter epics by selected boards (client-side, instant)
  const filteredData = useMemo(() => {
    if (!fullData) return null;
    // If all boards selected, return full data
    if (selectedBoardIds.length === allBoardIds.length) return fullData;

    const boardProjectMap = fullData.boardProjectMap || {};
    // Get project keys for selected boards
    const activeProjectKeys = new Set(
      selectedBoardIds
        .map(id => boardProjectMap[id])
        .filter(Boolean)
    );

    // If no map available, fall back to showing all data
    if (activeProjectKeys.size === 0) return fullData;

    // Filter epics by project key (extracted from issue key, e.g. "PROJ-123" → "PROJ")
    const filteredEpics = fullData.epics.filter(epic => {
      const projectKey = epic.key.split('-')[0];
      return activeProjectKeys.has(projectKey);
    });

    // Return filtered data (prioritization & portfolio stay full since they're computed server-side)
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
  }, [fullData, selectedBoardIds, allBoardIds]);

  // Try loading from database first (fast, no Jira API call)
  const loadFromDatabase = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getCachedProductData(allBoardIds);
      if (result.success && result.data) {
        setFullData(result.data);
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

  // Fetch fresh data from Jira API (always uses ALL boards)
  const loadFromJira = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getEpics(
        credentials.jiraUrl,
        credentials.email,
        credentials.apiToken,
        allBoardIds
      );
      if (result.success) {
        setFullData(result.data);
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

  const toggleBoard = (boardId) => {
    setSelectedBoardIds(prev => {
      if (prev.includes(boardId)) {
        if (prev.length === 1) return prev;
        return prev.filter(id => id !== boardId);
      }
      return [...prev, boardId];
    });
  };

  const selectAllBoards = () => {
    setSelectedBoardIds(allBoardIds);
  };

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
              {loading ? 'Loading...' : 'Refresh from Jira'}
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
          <p className="text-xs text-gray-400 mt-1">Checking local cache first</p>
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
            <EpicIntelligenceTab epicData={filteredData} loading={loading} />
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
            />
          )}
        </>
      )}

      {/* Empty State */}
      {!loading && !fullData && !error && (
        <div className="card text-center py-16">
          <p className="text-gray-500 text-lg">No data loaded yet</p>
          <p className="text-gray-400 text-sm mt-2">Click "Refresh from Jira" to load epic data for the selected boards</p>
        </div>
      )}
    </div>
  );
}
