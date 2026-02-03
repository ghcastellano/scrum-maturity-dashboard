import { useState, useEffect } from 'react';
import api from '../services/api';

const STORAGE_KEY = 'scrum-dashboard-selected-boards';
const BOARDS_CACHE_KEY = 'scrum-dashboard-boards-cache';
const BOARDS_CACHE_TTL = 60 * 60 * 1000; // 1 hour in ms

export default function TeamSelector({ credentials, onTeamsSelected }) {
  const [boards, setBoards] = useState([]);
  const [selectedBoards, setSelectedBoards] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadBoards();
    loadSavedSelection();
  }, []);

  const loadBoards = async (forceRefresh = false) => {
    try {
      setLoading(true);

      // Try localStorage cache first
      if (!forceRefresh) {
        const cached = localStorage.getItem(BOARDS_CACHE_KEY);
        if (cached) {
          const { boards: cachedBoards, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < BOARDS_CACHE_TTL && cachedBoards?.length > 0) {
            console.log('✅ Boards loaded from localStorage cache');
            setBoards(cachedBoards);
            setLoading(false);
            return;
          }
        }
      }

      // Fetch from API
      const result = await api.getBoards(
        credentials.jiraUrl,
        credentials.email,
        credentials.apiToken
      );
      setBoards(result.boards);

      // Save to localStorage
      localStorage.setItem(BOARDS_CACHE_KEY, JSON.stringify({
        boards: result.boards,
        timestamp: Date.now()
      }));
    } catch (err) {
      setError('Failed to load boards');
    } finally {
      setLoading(false);
    }
  };

  const loadSavedSelection = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const savedBoards = JSON.parse(saved);
        setSelectedBoards(savedBoards);
      }
    } catch (err) {
      console.error('Failed to load saved selection:', err);
    }
  };

  const saveSelection = (boardIds) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(boardIds));
    } catch (err) {
      console.error('Failed to save selection:', err);
    }
  };

  const clearSavedSelection = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setSelectedBoards([]);
    } catch (err) {
      console.error('Failed to clear saved selection:', err);
    }
  };

  const toggleBoard = (boardId) => {
    const newSelection = selectedBoards.includes(boardId)
      ? selectedBoards.filter(id => id !== boardId)
      : [...selectedBoards, boardId];

    setSelectedBoards(newSelection);
    saveSelection(newSelection);
  };

  const handleSubmit = () => {
    if (selectedBoards.length === 0) {
      setError('Please select at least one team');
      return;
    }
    setError('');

    // Pass full board objects with id and name
    const selectedBoardObjects = boards
      .filter(board => selectedBoards.includes(board.id))
      .map(board => ({
        id: board.id,
        name: board.name,
        type: board.type
      }));

    onTeamsSelected(selectedBoardObjects);
  };

  // Filter boards based on search term
  const filteredBoards = boards.filter(board => {
    if (!searchTerm) return true;

    const searchLower = searchTerm.toLowerCase();
    const name = board.name?.toLowerCase() || '';
    const projectKey = board.location?.projectKey?.toLowerCase() || '';
    const projectName = board.location?.projectName?.toLowerCase() || '';
    const boardId = String(board.id);

    return name.includes(searchLower) ||
           projectKey.includes(searchLower) ||
           projectName.includes(searchLower) ||
           boardId.includes(searchLower);
  });

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto card">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading teams... This may take a minute for large instances.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Select Boards to Analyze</h2>
        <button
          onClick={() => loadBoards(true)}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Refresh List
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg mb-4 text-sm">
        Search by the <strong>board name</strong> in Jira (e.g. "GTMDOP Scrum Board"), not the team name.
        You can find your board name in Jira under <em>Boards &gt; View all boards</em>.
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Search and Actions Bar */}
      <div className="mb-6 space-y-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by board name, project key, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          {selectedBoards.length > 0 && (
            <button
              onClick={clearSavedSelection}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Clear Selection
            </button>
          )}
        </div>

        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Showing {filteredBoards.length} of {boards.length} boards
          </span>
          {selectedBoards.length > 0 && (
            <span className="text-primary-600 font-medium">
              ✓ {selectedBoards.length} board{selectedBoards.length !== 1 ? 's' : ''} saved
            </span>
          )}
        </div>
      </div>

      {/* Boards List */}
      <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
        {filteredBoards.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No boards found matching "{searchTerm}"
          </div>
        ) : (
          filteredBoards.map(board => (
            <label
              key={board.id}
              className={`flex items-center p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors ${
                selectedBoards.includes(board.id)
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedBoards.includes(board.id)}
                onChange={() => toggleBoard(board.id)}
                className="w-5 h-5 text-primary-600 rounded focus:ring-2 focus:ring-primary-500"
              />
              <div className="ml-4 flex-1">
                <div className="font-medium text-gray-900">{board.name}</div>
                <div className="text-sm text-gray-500">
                  {board.location?.projectKey && `Project: ${board.location.projectKey} • `}
                  Board ID: {board.id} • Type: {board.type}
                </div>
              </div>
            </label>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">
          {selectedBoards.length} team{selectedBoards.length !== 1 ? 's' : ''} selected
        </p>
        <button
          onClick={handleSubmit}
          disabled={selectedBoards.length === 0}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Analyze Selected Teams
        </button>
      </div>
    </div>
  );
}
