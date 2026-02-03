import { useState, useEffect } from 'react';
import JiraConnection from './components/JiraConnection';
import TeamSelector from './components/TeamSelector';
import Dashboard from './components/Dashboard';

const STORAGE_KEY_JIRA_URL = 'scrum-dashboard-jira-url';
const STORAGE_KEY_EMAIL = 'scrum-dashboard-email';
const STORAGE_KEY_TOKEN = 'scrum-dashboard-api-token';
const STORAGE_KEY_BOARDS = 'scrum-dashboard-selected-boards';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [step, setStep] = useState('connection');
  const [credentials, setCredentials] = useState(null);
  const [selectedBoards, setSelectedBoards] = useState([]);
  const [savedBoardsFromHistory, setSavedBoardsFromHistory] = useState([]);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // 1. First check if there are saved metrics in the database
      //    This works for ANY machine - no localStorage needed
      const historyResponse = await fetch(`${API_URL}/history/boards`);
      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        if (historyData.success && historyData.boards?.length > 0) {
          console.log('✅ Found saved metrics in database, going to dashboard');

          // Convert history boards to board objects for Dashboard
          const boardsFromHistory = historyData.boards.map(b => ({
            id: b.board_id,
            name: b.board_name
          }));

          setSavedBoardsFromHistory(boardsFromHistory);

          // Also try to load credentials (for refresh functionality)
          await loadCredentials();

          setSelectedBoards(boardsFromHistory);
          setStep('dashboard');
          setIsLoading(false);
          return;
        }
      }

      // 2. No saved metrics - need credentials to calculate
      await loadCredentials();

      // If we got credentials, go to team selection
      if (credentials) {
        setStep('teamSelection');
      }
    } catch (err) {
      console.error('Failed to initialize:', err);
      // Try to load credentials as fallback
      await loadCredentials();
    }

    setIsLoading(false);
  };

  const loadCredentials = async () => {
    try {
      // Check localStorage first
      const savedUrl = localStorage.getItem(STORAGE_KEY_JIRA_URL);
      const savedEmail = localStorage.getItem(STORAGE_KEY_EMAIL);
      const savedToken = localStorage.getItem(STORAGE_KEY_TOKEN);

      if (savedUrl && savedEmail && savedToken) {
        setCredentials({ jiraUrl: savedUrl, email: savedEmail, apiToken: savedToken });

        // If no saved boards from history, check localStorage for selected boards
        if (savedBoardsFromHistory.length === 0) {
          const savedBoards = localStorage.getItem(STORAGE_KEY_BOARDS);
          if (savedBoards) {
            const boards = JSON.parse(savedBoards);
            if (boards.length > 0 && typeof boards[0] === 'object') {
              setSelectedBoards(boards);
              setStep('dashboard');
              return;
            }
          }
          setStep('teamSelection');
        }
        return;
      }

      // Try to fetch from backend
      const response = await fetch(`${API_URL}/credentials`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.credentials) {
          const { jiraUrl, email, apiToken } = data.credentials;
          localStorage.setItem(STORAGE_KEY_JIRA_URL, jiraUrl);
          localStorage.setItem(STORAGE_KEY_EMAIL, email);
          localStorage.setItem(STORAGE_KEY_TOKEN, apiToken);
          setCredentials({ jiraUrl, email, apiToken });

          if (savedBoardsFromHistory.length === 0) {
            setStep('teamSelection');
          }
          return;
        }
      }
    } catch (err) {
      console.error('Failed to load credentials:', err);
    }

    if (savedBoardsFromHistory.length === 0) {
      setStep('connection');
    }
  };

  const handleConnectionSuccess = (creds) => {
    try {
      localStorage.setItem(STORAGE_KEY_JIRA_URL, creds.jiraUrl);
      localStorage.setItem(STORAGE_KEY_EMAIL, creds.email);
      localStorage.setItem(STORAGE_KEY_TOKEN, creds.apiToken);
    } catch (err) {
      console.error('Failed to save credentials:', err);
    }

    setCredentials(creds);
    setStep('teamSelection');
  };

  const handleTeamsSelected = (boards) => {
    try {
      localStorage.setItem(STORAGE_KEY_BOARDS, JSON.stringify(boards));
    } catch (err) {
      console.error('Failed to save boards:', err);
    }

    setSelectedBoards(boards);
    setStep('dashboard');
  };

  const handleReset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_BOARDS);
    } catch (err) {
      console.error('Failed to clear saved data:', err);
    }

    setStep('connection');
    setCredentials(null);
    setSelectedBoards([]);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
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
            <h1 className="text-2xl font-bold text-gray-900">Scrum Maturity Dashboard</h1>
            <p className="text-sm text-gray-600">Analyze team health and maturity</p>
          </div>

          {step === 'dashboard' && credentials && (
            <div className="flex gap-3">
              <button
                onClick={() => setStep('teamSelection')}
                className="btn-secondary"
              >
                Add New Board
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="py-8">
        {step === 'connection' && (
          <JiraConnection onConnectionSuccess={handleConnectionSuccess} />
        )}

        {step === 'teamSelection' && (
          <TeamSelector
            credentials={credentials}
            onTeamsSelected={handleTeamsSelected}
          />
        )}

        {step === 'dashboard' && (
          <Dashboard
            credentials={credentials}
            selectedBoards={selectedBoards}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4 text-center text-sm text-gray-600">
          <p>Scrum Maturity Model v1.0 | Built with React + Chart.js</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
