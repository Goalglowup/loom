import { useState, useEffect } from 'react';
import { getSettings, updateSettings, type AdminSettings } from '../utils/adminApi';
import './SettingsPage.css';

function SettingsPage() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      setError(null);
      const data = await getSettings();
      setSettings(data);
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
      const updated = await updateSettings(enabled);
      setSettings(updated);
      setSuccessMessage('Settings saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
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

      {settings?.updatedAt && (
        <div className="settings-meta">
          Last updated: {new Date(settings.updatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

export default SettingsPage;
