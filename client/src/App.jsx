import { useState } from 'react';
import JiraConnection from './components/JiraConnection';
import TeamSelector from './components/TeamSelector';
import Dashboard from './components/Dashboard';

function App() {
  const [step, setStep] = useState('connection'); // connection | teamSelection | dashboard
  const [credentials, setCredentials] = useState(null);
  const [selectedBoards, setSelectedBoards] = useState([]);

  const handleConnectionSuccess = (creds) => {
    setCredentials(creds);
    setStep('teamSelection');
  };

  const handleTeamsSelected = (boards) => {
    setSelectedBoards(boards);
    setStep('dashboard');
  };

  const handleReset = () => {
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
            <button
              onClick={handleReset}
              className="btn-secondary"
            >
              Change Teams
            </button>
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
