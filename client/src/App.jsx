import { useState, useEffect } from 'react';
import JiraConnection from './components/JiraConnection';
import TeamSelector from './components/TeamSelector';
import Dashboard from './components/Dashboard';

const STORAGE_KEY_JIRA_URL = 'scrum-dashboard-jira-url';
const STORAGE_KEY_EMAIL = 'scrum-dashboard-email';
const STORAGE_KEY_TOKEN = 'scrum-dashboard-api-token';
const STORAGE_KEY_BOARDS = 'scrum-dashboard-selected-boards';

function App() {
  // Initialize state by checking localStorage immediately (no loading state)
  const initializeState = () => {
    try {
      const savedUrl = localStorage.getItem(STORAGE_KEY_JIRA_URL);
      const savedEmail = localStorage.getItem(STORAGE_KEY_EMAIL);
      const savedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
      const savedBoards = localStorage.getItem(STORAGE_KEY_BOARDS);

      // If we have all required data, start with dashboard
      if (savedUrl && savedEmail && savedToken && savedBoards) {
        const boards = JSON.parse(savedBoards);
        if (boards.length > 0) {
          // Check if boards are in old format
          const isOldFormat = typeof boards[0] === 'number';

          if (isOldFormat) {
            // Old format - need to re-select teams
            console.log('Old board format detected, please re-select your teams');
            localStorage.removeItem(STORAGE_KEY_BOARDS);
            return {
              step: 'teamSelection',
              credentials: { jiraUrl: savedUrl, email: savedEmail, apiToken: savedToken },
              boards: []
            };
          }

          // New format - go directly to dashboard!
          return {
            step: 'dashboard',
            credentials: { jiraUrl: savedUrl, email: savedEmail, apiToken: savedToken },
            boards: boards
          };
        }
      }
    } catch (err) {
      console.error('Failed to load saved session:', err);
    }

    // No saved data - show connection screen
    return { step: 'connection', credentials: null, boards: [] };
  };

  const initial = initializeState();
  const [step, setStep] = useState(initial.step);
  const [credentials, setCredentials] = useState(initial.credentials);
  const [selectedBoards, setSelectedBoards] = useState(initial.boards);

  const handleConnectionSuccess = (creds) => {
    // Save credentials to localStorage for auto-login
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
    // Save selected boards
    try {
      localStorage.setItem(STORAGE_KEY_BOARDS, JSON.stringify(boards));
    } catch (err) {
      console.error('Failed to save boards:', err);
    }

    setSelectedBoards(boards);
    setStep('dashboard');
  };

  const handleReset = () => {
    // Clear all saved data
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scrum Maturity Dashboard</h1>
            <p className="text-sm text-gray-600">Analyze team health and maturity</p>
          </div>
          
          {step === 'dashboard' && (
            <div className="flex gap-3">
              <button
                onClick={() => setStep('teamSelection')}
                className="btn-secondary"
              >
                Change Teams
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm text-red-600 hover:text-red-700 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
              >
                Disconnect
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
