import { useState, useEffect } from 'react';
import api from '../../services/api';

const STORAGE_KEY = 'scrum-dashboard-field-mappings';

const MAPPING_FIELDS = [
  { key: 'businessValue', label: 'Business Value', description: 'Numeric field for business value score' },
  { key: 'timeCriticality', label: 'Time Criticality', description: 'Numeric field for time urgency' },
  { key: 'riskReduction', label: 'Risk Reduction / Opportunity', description: 'Numeric field for risk reduction value' },
  { key: 'jobSize', label: 'Job Size', description: 'Numeric field for effort estimate (fallback: story points)' },
  { key: 'moscow', label: 'MoSCoW Category', description: 'Text/select field with Must/Should/Could/Won\'t values' }
];

export default function FieldMappingConfig({ credentials, onMappingsChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [availableFields, setAvailableFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [mappings, setMappings] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const hasMappings = Object.values(mappings).some(v => v);

  useEffect(() => {
    if (isOpen && availableFields.length === 0) {
      loadFields();
    }
  }, [isOpen]);

  useEffect(() => {
    onMappingsChange?.(hasMappings ? mappings : null);
  }, [mappings]);

  const loadFields = async () => {
    if (!credentials) return;
    setLoadingFields(true);
    try {
      const result = await api.discoverPrioritizationFields(
        credentials.jiraUrl,
        credentials.email,
        credentials.apiToken
      );
      if (result.success) {
        setAvailableFields(result.fields || []);
      }
    } catch (err) {
      console.error('Failed to discover fields:', err);
    } finally {
      setLoadingFields(false);
    }
  };

  const updateMapping = (key, fieldId) => {
    const updated = { ...mappings, [key]: fieldId || null };
    setMappings(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const clearMappings = () => {
    setMappings({});
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs text-gray-500 hover:text-purple-600 transition-colors"
      >
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
        Custom Field Mapping
        {hasMappings && (
          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded text-xs">
            {Object.values(mappings).filter(Boolean).length} mapped
          </span>
        )}
      </button>

      {isOpen && (
        <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500">
              Map your Jira custom fields for accurate WSJF scoring. Leave empty to use fallback calculations.
            </p>
            {hasMappings && (
              <button onClick={clearMappings} className="text-xs text-red-500 hover:text-red-700">
                Clear All
              </button>
            )}
          </div>

          {loadingFields ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600 mx-auto"></div>
              <p className="text-xs text-gray-400 mt-2">Discovering custom fields from Jira...</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {MAPPING_FIELDS.map(field => (
                <div key={field.key} className="flex items-center gap-3">
                  <div className="w-40">
                    <label className="text-xs font-medium text-gray-700">{field.label}</label>
                    <p className="text-xs text-gray-400">{field.description}</p>
                  </div>
                  <select
                    value={mappings[field.key] || ''}
                    onChange={(e) => updateMapping(field.key, e.target.value)}
                    className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1.5 text-gray-600"
                  >
                    <option value="">-- Use fallback --</option>
                    {availableFields.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.id})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {availableFields.length === 0 && !loadingFields && (
            <button
              onClick={loadFields}
              className="mt-2 text-xs text-purple-600 hover:text-purple-800 underline"
            >
              Reload fields from Jira
            </button>
          )}
        </div>
      )}
    </div>
  );
}
