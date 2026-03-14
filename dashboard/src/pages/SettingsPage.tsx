import { useState, useEffect } from 'react';
import { getSettings, updateSettings, type AdminSettings } from '../utils/adminApi';
import './SettingsPage.css';

function SettingsPage() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Embedder form state
  const [embedderProvider, setEmbedderProvider] = useState('');
  const [embedderModel, setEmbedderModel] = useState('');
  const [embedderApiKey, setEmbedderApiKey] = useState('');
  const [savingEmbedder, setSavingEmbedder] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      setError(null);
      const data = await getSettings();
      setSettings(data);
      setEmbedderProvider(data.defaultEmbedderProvider ?? '');
      setEmbedderModel(data.defaultEmbedderModel ?? '');
      setEmbedderApiKey('');
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleSignups(enabled: boolean) {
    if (!settings) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);
      const updated = await updateSettings({ signupsEnabled: enabled });
      setSettings(updated);
      setSuccessMessage('Settings saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEmbedder(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingEmbedder(true);
      setError(null);
      setSuccessMessage(null);
      const updates: Record<string, string | null> = {
        defaultEmbedderProvider: embedderProvider || null,
        defaultEmbedderModel: embedderModel || null,
      };
      // Only send API key if user typed a new one
      if (embedderApiKey) {
        updates.defaultEmbedderApiKey = embedderApiKey;
      }
      const updated = await updateSettings(updates);
      setSettings(updated);
      setEmbedderApiKey('');
      setSuccessMessage('Embedder configuration saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save embedder settings');
    } finally {
      setSavingEmbedder(false);
    }
  }

  async function handleClearEmbedder() {
    try {
      setSavingEmbedder(true);
      setError(null);
      setSuccessMessage(null);
      const updated = await updateSettings({
        defaultEmbedderProvider: null,
        defaultEmbedderModel: null,
        defaultEmbedderApiKey: null,
      });
      setSettings(updated);
      setEmbedderProvider('');
      setEmbedderModel('');
      setEmbedderApiKey('');
      setSuccessMessage('Embedder configuration cleared');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to clear embedder settings');
    } finally {
      setSavingEmbedder(false);
    }
  }

  if (loading) {
    return (
      <div className="settings-page">
        <div className="loading">Loading settings...</div>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="settings-page">
        <div className="error">Error: {error}</div>
        <button onClick={loadSettings}>Retry</button>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <h1>Gateway Settings</h1>

      {successMessage && (
        <div className="success-message">{successMessage}</div>
      )}

      {error && (
        <div className="error-message">{error}</div>
      )}

      <div className="settings-section">
        <div className="setting-item">
          <div className="setting-info">
            <h3>Self-Service Signups</h3>
            <p className="setting-description">
              Allow users to create accounts without an invitation code.
              When disabled, only beta signups and invite-based registration will be available.
            </p>
          </div>
          <div className="setting-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings?.signupsEnabled ?? false}
                onChange={(e) => handleToggleSignups(e.target.checked)}
                disabled={saving}
              />
              <span className="toggle-slider"></span>
            </label>
            <span className="toggle-label">
              {settings?.signupsEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h2>Default Embedding Model</h2>
        <p className="setting-description">
          Configure the default embedding model used for knowledge base creation.
          This is used when no agent-level or environment variable embedder is configured.
        </p>
        <form onSubmit={handleSaveEmbedder} className="embedder-form">
          <div className="form-group">
            <label htmlFor="embedder-provider">Provider</label>
            <select
              id="embedder-provider"
              value={embedderProvider}
              onChange={(e) => setEmbedderProvider(e.target.value)}
              disabled={savingEmbedder}
            >
              <option value="">-- Not configured --</option>
              <option value="openai">OpenAI</option>
              <option value="azure">Azure OpenAI</option>
              <option value="ollama">Ollama</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="embedder-model">Model</label>
            <input
              id="embedder-model"
              type="text"
              value={embedderModel}
              onChange={(e) => setEmbedderModel(e.target.value)}
              placeholder="e.g. text-embedding-3-small"
              disabled={savingEmbedder}
            />
          </div>
          <div className="form-group">
            <label htmlFor="embedder-api-key">API Key</label>
            <input
              id="embedder-api-key"
              type="password"
              value={embedderApiKey}
              onChange={(e) => setEmbedderApiKey(e.target.value)}
              placeholder={settings?.defaultEmbedderApiKey ? '(configured — enter new value to change)' : 'Enter API key'}
              disabled={savingEmbedder}
            />
          </div>
          <div className="form-actions">
            <button type="submit" disabled={savingEmbedder || !embedderProvider || !embedderModel}>
              {savingEmbedder ? 'Saving...' : 'Save Embedder Config'}
            </button>
            {settings?.defaultEmbedderProvider && (
              <button type="button" onClick={handleClearEmbedder} disabled={savingEmbedder} className="btn-secondary">
                Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {settings?.updatedAt && (
        <div className="settings-meta">
          Last updated: {new Date(settings.updatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

export default SettingsPage;
