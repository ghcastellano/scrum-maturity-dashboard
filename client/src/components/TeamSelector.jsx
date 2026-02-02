import { useState, useEffect } from 'react';
import api from '../services/api';

export default function TeamSelector({ credentials, onTeamsSelected }) {
  const [boards, setBoards] = useState([]);
  const [selectedBoards, setSelectedBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadBoards();
  }, []);

  const loadBoards = async () => {
    try {
      setLoading(true);
      const result = await api.getBoards(
        credentials.jiraUrl,
        credentials.email,
        credentials.apiToken
      );
      setBoards(result.boards);
    } catch (err) {
      setError('Failed to load boards');
    } finally {
      setLoading(false);
    }
  };

  const toggleBoard = (boardId) => {
    setSelectedBoards(prev => 
      prev.includes(boardId)
        ? prev.filter(id => id !== boardId)
        : [...prev, boardId]
    );
  };

  const handleSubmit = () => {
    if (selectedBoards.length === 0) {
      setError('Please select at least one team');
      return;
    }
    onTeamsSelected(selectedBoards);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto card">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading teams...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto card">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Select Teams to Analyze</h2>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      <div className="space-y-3 mb-6">
        {boards.map(board => (
          <label
            key={board.id}
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedBoards.includes(board.id)}
              onChange={() => toggleBoard(board.id)}
              className="w-5 h-5 text-primary-600 rounded focus:ring-2 focus:ring-primary-500"
            />
            <div className="ml-4">
              <div className="font-medium text-gray-900">{board.name}</div>
              <div className="text-sm text-gray-500">Board ID: {board.id} • Type: {board.type}</div>
            </div>
          </label>
        ))}
      </div>

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
