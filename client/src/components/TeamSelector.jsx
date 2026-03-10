import { useState, useEffect } from 'react';
import api from '../services/api';

const STORAGE_KEY_PREFIX = 'scrum-dashboard-selected-boards';
const BOARDS_CACHE_PREFIX = 'scrum-dashboard-boards-cache';

// Tenant-scoped localStorage keys to prevent data leaking across tenants
function getTenantKey(prefix, tenantId) {
  return tenantId ? `${prefix}-${tenantId}` : prefix;
}

export default function TeamSelector({ credentials, onTeamsSelected, existingBoards = [], onBack, locale = 'en', t }) {
  const [boards, setBoards] = useState([]);
  const [selectedBoards, setSelectedBoards] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Derive tenantId from credentials for tenant-scoped storage
  const tenantId = credentials?.jiraUrl ? (() => { try { return new URL(credentials.jiraUrl).hostname; } catch { return null; } })() : null;
  const STORAGE_KEY = getTenantKey(STORAGE_KEY_PREFIX, tenantId);
  const BOARDS_CACHE_KEY = getTenantKey(BOARDS_CACHE_PREFIX, tenantId);

  useEffect(() => {
    loadBoards();
    // Pre-select existing boards from the database
    if (existingBoards.length > 0) {
      const existingIds = existingBoards.map(b => typeof b === 'object' ? b.id : b);
      setSelectedBoards(existingIds);
    } else {
      loadSavedSelection();
    }
  }, []);

  // Helper: load boards from any available cache (DB → localStorage)
  const loadBoardsFromCache = async () => {
    // 1) Try DB cache first (tenant-scoped via api service)
    try {
      const cacheResult = await api.getCachedBoards();
      if (cacheResult.success && cacheResult.boards?.length > 0) {
        console.log('Boards loaded from DB cache');
        return cacheResult.boards;
      }
    } catch (e) {
      console.warn('DB cache miss');
    }

    // 2) Try localStorage cache
    try {
      const cached = localStorage.getItem(BOARDS_CACHE_KEY);
      if (cached) {
        const { boards: cachedBoards } = JSON.parse(cached);
        if (cachedBoards?.length > 0) {
          console.log('Boards loaded from localStorage cache');
          return cachedBoards;
        }
      }
    } catch (e) { /* ignore parse errors */ }

    return null;
  };

  const loadBoards = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError('');

      if (forceRefresh) {
        try {
          const result = await api.getBoards(
            credentials.jiraUrl,
            credentials.email,
            credentials.apiToken
          );
          setBoards(result.boards);
          localStorage.setItem(BOARDS_CACHE_KEY, JSON.stringify({
            boards: result.boards,
            timestamp: Date.now()
          }));
          return;
        } catch (refreshErr) {
          console.error('Jira API refresh failed:', refreshErr);
          const errMsg = refreshErr.response?.data?.message || refreshErr.message || '';
          const cached = await loadBoardsFromCache();
          if (cached) {
            setBoards(cached);
            setError(`${t('failedToRefresh')} (${errMsg}). ${t('showingCachedBoards')}`);
          } else {
            setError(`${t('failedToLoadBoards')}: ${errMsg}`);
          }
          return;
        }
      }

      // Normal load: try caches
      const cached = await loadBoardsFromCache();
      if (cached) {
        setBoards(cached);
        return;
      }

      // No cache available — auto-fetch from Jira API (new tenant or first visit)
      try {
        const result = await api.getBoards(
          credentials.jiraUrl,
          credentials.email,
          credentials.apiToken
        );
        setBoards(result.boards);
        localStorage.setItem(BOARDS_CACHE_KEY, JSON.stringify({
          boards: result.boards,
          timestamp: Date.now()
        }));
      } catch (fetchErr) {
        console.error('Auto-fetch from Jira failed:', fetchErr);
        setError(`${t('failedToLoadBoards')}: ${fetchErr.response?.data?.message || fetchErr.message || ''}`);
        setBoards([]);
      }
    } catch (err) {
      console.error('Failed to load boards:', err);
      setError(`${t('failedToLoadBoards')}: ${err.message || 'Unknown error'}`);
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
      setError(t('selectAtLeastOne'));
      return;
    }
    setError('');

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
          <p className="mt-4 text-gray-600">{t('loadingTeams')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto card">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              title={locale === 'pt-BR' ? 'Voltar ao Dashboard' : 'Back to Dashboard'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <h2 className="text-2xl font-bold text-gray-800">{t('selectBoards')}</h2>
        </div>
        <button
          onClick={() => loadBoards(true)}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {t('refreshFromJira')}
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg mb-4 text-sm">
        {t('boardSearchHint')}
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
              placeholder={t('searchPlaceholder')}
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
              {t('clearSelection')}
            </button>
          )}
        </div>

        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            {t('showing')} {filteredBoards.length} {t('of')} {boards.length} {t('boards')}
          </span>
          {selectedBoards.length > 0 && (
            <span className="text-primary-600 font-medium">
              {selectedBoards.length} {t('boardsSaved')}
            </span>
          )}
        </div>
      </div>

      {/* Boards List */}
      <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
        {boards.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="mb-3">{t('noCachedBoards')}</p>
            <button
              onClick={() => loadBoards(true)}
              className="btn-primary"
            >
              {t('refreshFromJira')}
            </button>
          </div>
        ) : filteredBoards.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {t('noMatchingBoards')} "{searchTerm}"
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
          {selectedBoards.length} {t('teamsSelected')}
        </p>
        <button
          onClick={handleSubmit}
          disabled={selectedBoards.length === 0}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('analyzeSelected')}
        </button>
      </div>
    </div>
  );
}
