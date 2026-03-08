import { useState, useEffect } from 'react';
import api from '../services/api';
import EpicHealthSummary from './product/EpicHealthSummary';
import EpicList from './product/EpicList';
import DependencyView from './product/DependencyView';

export default function ProductManagement({ credentials, selectedBoards, locale, t }) {
  const [activeTab, setActiveTab] = useState('epics');
  const [epicData, setEpicData] = useState(null);
  const [depData, setDepData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cached, setCached] = useState(false);

  const boardIds = selectedBoards.map(b => typeof b === 'object' ? b.id : b);

  // Load data on mount if we have boards
  useEffect(() => {
    if (boardIds.length > 0 && !epicData) {
      loadEpics(false);
    }
  }, []);

  const loadEpics = async (forceRefresh = false) => {
    if (!credentials || boardIds.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const result = await api.getProductEpics(
        credentials.jiraUrl, credentials.email, credentials.apiToken,
        boardIds, forceRefresh
      );

      if (result.success) {
        setEpicData(result.data);
        setCached(result.cached || false);
      } else {
        setError(result.message || 'Failed to load epics');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDependencies = async (forceRefresh = false) => {
    if (!credentials || boardIds.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const result = await api.getProductDependencies(
        credentials.jiraUrl, credentials.email, credentials.apiToken,
        boardIds, forceRefresh
      );

      if (result.success) {
        setDepData(result.data);
      } else {
        setError(result.message || 'Failed to load dependencies');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'dependencies' && !depData) {
      loadDependencies();
    }
  };

  const handleRefresh = () => {
    if (activeTab === 'epics') {
      loadEpics(true);
    } else {
      loadDependencies(true);
    }
  };

  const tabs = [
    { key: 'epics', label: t('pmEpicOverview') },
    { key: 'dependencies', label: t('pmDependencies') }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4">
      {/* Sub-tab navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {epicData?.projectKeys && (
            <span className="text-xs text-gray-500">
              {t('pmProjectKeys')}: {epicData.projectKeys.join(', ')}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="btn-primary text-sm"
          >
            {loading ? t('pmRefreshing') : t('pmRefresh')}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !epicData && (
        <div className="card text-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">{t('pmLoadingEpics')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('pmMayTakeMinute')}</p>
        </div>
      )}

      {/* No data state */}
      {!loading && !epicData && !error && (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">📦</div>
          <p className="text-gray-600 mb-4">{t('pmNoEpics')}</p>
          <button onClick={() => loadEpics(false)} className="btn-primary">
            {t('pmLoadEpics')}
          </button>
        </div>
      )}

      {/* Content */}
      {epicData && activeTab === 'epics' && (
        <>
          <EpicHealthSummary summary={epicData.summary} t={t} />
          <EpicList
            epics={epicData.epics || []}
            initiatives={epicData.initiatives || []}
            locale={locale}
            t={t}
          />
        </>
      )}

      {activeTab === 'dependencies' && (
        <>
          {loading && !depData && (
            <div className="card text-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-4" />
              <p className="text-gray-600">{t('pmLoadingEpics')}</p>
            </div>
          )}
          {depData && <DependencyView data={depData} t={t} />}
          {!loading && !depData && !error && (
            <div className="card text-center py-16 text-gray-500">
              {t('pmNoDependencies')}
            </div>
          )}
        </>
      )}
    </div>
  );
}
