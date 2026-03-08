import { useState, useEffect } from 'react';
import JiraConnection from './components/JiraConnection';
import TeamSelector from './components/TeamSelector';
import Dashboard from './components/Dashboard';
import api from './services/api';
import { getTranslations, detectLocale } from './services/i18n';

const STORAGE_KEY_JIRA_URL = 'scrum-dashboard-jira-url';
const STORAGE_KEY_EMAIL = 'scrum-dashboard-email';
const STORAGE_KEY_TOKEN = 'scrum-dashboard-api-token';
const STORAGE_KEY_BOARDS = 'scrum-dashboard-selected-boards';
const STORAGE_KEY_TENANT = 'scrum-dashboard-tenant-id';
const STORAGE_KEY_LOCALE = 'scrum-dashboard-locale';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [step, setStep] = useState('connection');
  const [credentials, setCredentials] = useState(null);
  const [selectedBoards, setSelectedBoards] = useState([]);
  const [savedBoardsFromHistory, setSavedBoardsFromHistory] = useState([]);
  const [newlyAddedBoard, setNewlyAddedBoard] = useState(null);
  const [tenantId, setTenantId] = useState(null);
  const [locale, setLocale] = useState('en');

  // Translation function
  const t = getTranslations(locale);

  useEffect(() => {
    initializeApp();
  }, []);

  // Update API tenant whenever tenantId changes
  useEffect(() => {
    if (tenantId) {
      api.setTenant(tenantId);
    }
  }, [tenantId]);

  const initializeApp = async () => {
    // Restore tenant and locale from storage
    const savedTenant = localStorage.getItem(STORAGE_KEY_TENANT);
    const savedLocale = localStorage.getItem(STORAGE_KEY_LOCALE);
    if (savedTenant) {
      setTenantId(savedTenant);
      api.setTenant(savedTenant);
    }
    if (savedLocale) {
      setLocale(savedLocale);
    }

    let boardsFromHistory = [];
    try {
      const historyResponse = await fetch(`${API_URL}/history/boards${savedTenant ? `?tenant=${encodeURIComponent(savedTenant)}` : ''}`);
      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        if (historyData.success && historyData.boards?.length > 0) {
          boardsFromHistory = historyData.boards.map(b => ({
            id: b.board_id,
            name: b.board_name
          }));
          setSavedBoardsFromHistory(boardsFromHistory);
        }
      }
    } catch (err) {
      console.error('Failed to check database:', err);
    }

    try {
      const savedUrl = localStorage.getItem(STORAGE_KEY_JIRA_URL);
      const savedEmail = localStorage.getItem(STORAGE_KEY_EMAIL);
      const savedToken = localStorage.getItem(STORAGE_KEY_TOKEN);

      if (savedUrl && savedEmail && savedToken) {
        const response = await fetch(`${API_URL}/jira/test-connection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jiraUrl: savedUrl, email: savedEmail, apiToken: savedToken })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            const creds = { jiraUrl: savedUrl, email: savedEmail, apiToken: savedToken };
            setCredentials(creds);

            // Update tenant from server response
            if (result.tenantId) {
              setTenantId(result.tenantId);
              api.setTenant(result.tenantId);
              localStorage.setItem(STORAGE_KEY_TENANT, result.tenantId);
            }
            if (result.locale) {
              setLocale(result.locale);
              localStorage.setItem(STORAGE_KEY_LOCALE, result.locale);
            }

            if (boardsFromHistory.length > 0) {
              setSelectedBoards(boardsFromHistory);
              setStep('dashboard');
            } else {
              setStep('teamSelection');
            }
            setIsLoading(false);
            return;
          }
        }
        localStorage.removeItem(STORAGE_KEY_TOKEN);
      }
    } catch (err) {
      console.error('Auto-login failed:', err);
    }

    setStep('connection');
    setIsLoading(false);
  };

  const handleConnectionSuccess = (creds, serverTenantId, serverLocale) => {
    try {
      localStorage.setItem(STORAGE_KEY_JIRA_URL, creds.jiraUrl);
      localStorage.setItem(STORAGE_KEY_EMAIL, creds.email);
      localStorage.setItem(STORAGE_KEY_TOKEN, creds.apiToken);
    } catch (err) {
      console.error('Failed to save credentials:', err);
    }

    // Set tenant
    const tenant = serverTenantId || extractTenantFromUrl(creds.jiraUrl);
    setTenantId(tenant);
    api.setTenant(tenant);
    localStorage.setItem(STORAGE_KEY_TENANT, tenant);

    // Set locale
    const loc = serverLocale || detectLocale(tenant);
    setLocale(loc);
    localStorage.setItem(STORAGE_KEY_LOCALE, loc);

    setCredentials(creds);

    if (savedBoardsFromHistory.length > 0) {
      setSelectedBoards(savedBoardsFromHistory);
      setStep('dashboard');
    } else {
      setStep('teamSelection');
    }
  };

  // Extract tenant ID from Jira URL (client-side fallback)
  const extractTenantFromUrl = (jiraUrl) => {
    if (!jiraUrl) return null;
    try {
      const url = new URL(jiraUrl.endsWith('/') ? jiraUrl : jiraUrl + '/');
      return url.hostname.toLowerCase();
    } catch {
      return null;
    }
  };

  const handleTeamsSelected = (newBoards) => {
    const existingIds = new Set(selectedBoards.map(b => typeof b === 'object' ? b.id : b));
    const merged = [...selectedBoards];
    for (const board of newBoards) {
      const id = typeof board === 'object' ? board.id : board;
      if (!existingIds.has(id)) {
        merged.push(board);
      }
    }

    try {
      localStorage.setItem(STORAGE_KEY_BOARDS, JSON.stringify(merged));
    } catch (err) {
      console.error('Failed to save boards:', err);
    }

    setSelectedBoards(merged);
    if (newBoards.length > 0) {
      setNewlyAddedBoard(newBoards[0]);
    }
    setStep('dashboard');
  };

  const handleBoardDeleted = (boardId) => {
    setSelectedBoards(prev => prev.filter(b => {
      const id = typeof b === 'object' ? b.id : b;
      return id !== boardId;
    }));
    setSavedBoardsFromHistory(prev => prev.filter(b => b.id !== boardId));
    try {
      const updated = selectedBoards.filter(b => {
        const id = typeof b === 'object' ? b.id : b;
        return id !== boardId;
      });
      localStorage.setItem(STORAGE_KEY_BOARDS, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to update saved boards:', err);
    }
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem(STORAGE_KEY_JIRA_URL);
      localStorage.removeItem(STORAGE_KEY_EMAIL);
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_BOARDS);
      localStorage.removeItem(STORAGE_KEY_TENANT);
      localStorage.removeItem(STORAGE_KEY_LOCALE);
      localStorage.removeItem('scrum-dashboard-boards-cache');
    } catch (err) {
      console.error('Failed to clear saved data:', err);
    }

    setStep('connection');
    setCredentials(null);
    setSelectedBoards([]);
    setSavedBoardsFromHistory([]);
    setTenantId(null);
    setLocale('en');
    api.setTenant(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('appTitle')}</h1>
            <p className="text-sm text-gray-600">
              {t('appSubtitle')}
              {tenantId && (
                <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                  {tenantId}
                </span>
              )}
            </p>
          </div>

          {step !== 'connection' && credentials && (
            <div className="flex gap-3">
              {step === 'dashboard' && (
                <button
                  onClick={() => setStep('teamSelection')}
                  className="btn-secondary"
                >
                  {t('addNewBoard')}
                </button>
              )}
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm text-red-600 hover:text-red-800 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                {t('logout')}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className={step === 'dashboard' ? 'py-4' : 'py-8'}>
        {step === 'connection' && (
          <JiraConnection onConnectionSuccess={handleConnectionSuccess} locale={locale} t={t} />
        )}

        {step === 'teamSelection' && (
          <TeamSelector
            credentials={credentials}
            onTeamsSelected={handleTeamsSelected}
            existingBoards={selectedBoards}
            onBack={selectedBoards.length > 0 ? () => setStep('dashboard') : null}
            locale={locale}
            t={t}
          />
        )}

        {step === 'dashboard' && (
          <Dashboard
            credentials={credentials}
            selectedBoards={selectedBoards}
            newlyAddedBoard={newlyAddedBoard}
            onNewBoardHandled={() => setNewlyAddedBoard(null)}
            onBoardDeleted={handleBoardDeleted}
            locale={locale}
            t={t}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4 text-center text-sm text-gray-600">
          <p>Scrum Maturity Model v4.0 | Built with React + Chart.js</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
