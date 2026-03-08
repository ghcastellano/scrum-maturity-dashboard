import { useState, useEffect } from 'react';
import api from '../services/api';

const STORAGE_KEY_JIRA_URL = 'scrum-dashboard-jira-url';
const STORAGE_KEY_EMAIL = 'scrum-dashboard-email';
const STORAGE_KEY_TOKEN = 'scrum-dashboard-api-token';

export default function JiraConnection({ onConnectionSuccess, locale = 'en', t }) {
  const [formData, setFormData] = useState({
    jiraUrl: '',
    email: '',
    apiToken: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load saved credentials on mount
  useEffect(() => {
    try {
      const savedUrl = localStorage.getItem(STORAGE_KEY_JIRA_URL);
      const savedEmail = localStorage.getItem(STORAGE_KEY_EMAIL);
      const savedToken = localStorage.getItem(STORAGE_KEY_TOKEN);

      setFormData(prev => ({
        ...prev,
        jiraUrl: savedUrl || '',
        email: savedEmail || '',
        apiToken: savedToken || ''
      }));
    } catch (err) {
      console.error('Failed to load saved credentials:', err);
    }
  }, []);

  const saveCredentials = (jiraUrl, email) => {
    try {
      localStorage.setItem(STORAGE_KEY_JIRA_URL, jiraUrl);
      localStorage.setItem(STORAGE_KEY_EMAIL, email);
    } catch (err) {
      console.error('Failed to save credentials:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await api.testConnection(
        formData.jiraUrl,
        formData.email,
        formData.apiToken
      );

      if (result.success) {
        saveCredentials(formData.jiraUrl, formData.email);
        // Pass tenant and locale from server response
        onConnectionSuccess(formData, result.tenantId, result.locale);
      }
    } catch (err) {
      setError(err.response?.data?.message || (locale === 'pt-BR' ? 'Falha ao conectar ao Jira' : 'Failed to connect to Jira'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto card">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">{t('connectToJira')}</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('jiraUrl')}
          </label>
          <input
            type="url"
            className="input-field"
            placeholder="https://your-domain.atlassian.net"
            value={formData.jiraUrl}
            onChange={(e) => setFormData({ ...formData, jiraUrl: e.target.value })}
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            {t('preConfigured')}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('email')}
          </label>
          <input
            type="email"
            className="input-field"
            placeholder="your-email@company.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            {t('savedAutomatically')}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('apiToken')}
          </label>
          <input
            type="password"
            className="input-field"
            placeholder={locale === 'pt-BR' ? 'Seu token de API do Jira' : 'Your Jira API token'}
            value={formData.apiToken}
            onChange={(e) => setFormData({ ...formData, apiToken: e.target.value })}
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:underline"
            >
              {t('createTokenHere')}
            </a>
            {' • '}
            <span className="text-orange-600">{t('savedForAutoLogin')}</span>
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('connecting') : t('connectButton')}
        </button>
      </form>

      <div className="mt-6 space-y-4">
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <h3 className="font-semibold text-sm text-orange-900 mb-2">{t('securityNotice')}</h3>
          <p className="text-sm text-orange-800">
            {t('securityText')}
          </p>
        </div>

        <div className="p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-sm text-blue-900 mb-2">{t('howToGetToken')}</h3>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>{t('tokenStep1')}</li>
            <li>{t('tokenStep2')}</li>
            <li>{t('tokenStep3')}</li>
            <li>{t('tokenStep4')}</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
