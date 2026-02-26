import { useState, useEffect } from 'react';
import { adminFetch, AdminProviderConfig } from '../utils/adminApi';
import './ProviderConfigForm.css';

interface ProviderConfigFormProps {
  tenantId: string;
}

interface ProviderConfigFormData {
  provider: 'openai' | 'azure' | 'ollama';
  apiKey: string;
  baseUrl: string;
  deployment?: string;
  apiVersion?: string;
}

function ProviderConfigForm({ tenantId }: ProviderConfigFormProps) {
  const [config, setConfig] = useState<AdminProviderConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<ProviderConfigFormData>({
    provider: 'openai',
    apiKey: '',
    baseUrl: '',
    deployment: '',
    apiVersion: '',
  });
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    loadConfig();
  }, [tenantId]);

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await adminFetch(`/v1/admin/tenants/${tenantId}`);
      if (!res.ok) {
        throw new Error(`Failed to load tenant: ${res.status}`);
      }
      const data = await res.json();
      setConfig(data.providerConfig || null);
      
      if (data.providerConfig) {
        setFormData({
          provider: data.providerConfig.provider,
          apiKey: '',
          baseUrl: data.providerConfig.baseUrl || '',
          deployment: data.providerConfig.deployment || '',
          apiVersion: data.providerConfig.apiVersion || '',
        });
      }
    } catch (err) {
      console.error('Failed to load provider config:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    setSaving(true);
    try {
      const payload: any = {
        provider: formData.provider,
        baseUrl: formData.baseUrl || undefined,
      };
      
      if (formData.apiKey) {
        payload.apiKey = formData.apiKey;
      }
      
      if (formData.provider === 'azure') {
        if (formData.deployment) payload.deployment = formData.deployment;
        if (formData.apiVersion) payload.apiVersion = formData.apiVersion;
      }
      
      const res = await adminFetch(`/v1/admin/tenants/${tenantId}/provider-config`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to save provider config: ${res.status} ${errorText}`);
      }
      
      await loadConfig();
      setEditing(false);
      setFormData(prev => ({ ...prev, apiKey: '' }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save provider config');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      const res = await adminFetch(`/v1/admin/tenants/${tenantId}/provider-config`, {
        method: 'DELETE',
      });
      
      if (!res.ok) {
        throw new Error(`Failed to delete provider config: ${res.status}`);
      }
      
      setConfig(null);
      setShowDeleteConfirm(false);
      setEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete provider config');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="provider-config-card">
        <h3>Provider Configuration</h3>
        <div className="loading-state">Loading...</div>
      </div>
    );
  }

  return (
    <div className="provider-config-card">
      <div className="card-header">
        <h3>Provider Configuration</h3>
        {config && !editing && (
          <button className="edit-config-btn" onClick={() => setEditing(true)}>
            Update
          </button>
        )}
      </div>

      {!editing && config && (
        <div className="config-display">
          <div className="config-item">
            <span className="config-label">Provider:</span>
            <span className="config-value">{config.provider}</span>
          </div>
          {config.baseUrl && (
            <div className="config-item">
              <span className="config-label">Base URL:</span>
              <span className="config-value">{config.baseUrl}</span>
            </div>
          )}
          <div className="config-item">
            <span className="config-label">API Key:</span>
            <span className="config-value">
              {config.hasApiKey ? '🔒 Set (encrypted)' : 'Not set'}
            </span>
          </div>
          
          <div className="config-actions">
            {showDeleteConfirm ? (
              <div className="delete-confirm-inline">
                <span className="confirm-text">Delete this configuration?</span>
                <button
                  className="confirm-delete-inline-btn"
                  onClick={handleDelete}
                  disabled={saving}
                >
                  {saving ? 'Deleting...' : 'Yes, Delete'}
                </button>
                <button
                  className="cancel-delete-inline-btn"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="remove-config-btn"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Remove Config
              </button>
            )}
          </div>
        </div>
      )}

      {(!config || editing) && (
        <form onSubmit={handleSubmit} className="config-form">
          <div className="form-group">
            <label htmlFor="provider">Provider</label>
            <select
              id="provider"
              value={formData.provider}
              onChange={e => setFormData(prev => ({
                ...prev,
                provider: e.target.value as 'openai' | 'azure' | 'ollama',
              }))}
              disabled={saving}
            >
              <option value="openai">OpenAI</option>
              <option value="azure">Azure OpenAI</option>
              <option value="ollama">Ollama</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="apiKey">
              API Key {config ? '(leave blank to keep existing)' : ''}
            </label>
            <input
              type="password"
              id="apiKey"
              value={formData.apiKey}
              onChange={e => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
              disabled={saving}
              placeholder={config ? 'Enter new key to update' : 'Enter API key'}
            />
          </div>

          <div className="form-group">
            <label htmlFor="baseUrl">Base URL (optional)</label>
            <input
              type="text"
              id="baseUrl"
              value={formData.baseUrl}
              onChange={e => setFormData(prev => ({ ...prev, baseUrl: e.target.value }))}
              disabled={saving}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          {formData.provider === 'azure' && (
            <>
              <div className="form-group">
                <label htmlFor="deployment">Deployment (Azure only)</label>
                <input
                  type="text"
                  id="deployment"
                  value={formData.deployment}
                  onChange={e => setFormData(prev => ({ ...prev, deployment: e.target.value }))}
                  disabled={saving}
                  placeholder="gpt-4o"
                />
              </div>
              <div className="form-group">
                <label htmlFor="apiVersion">API Version (Azure only)</label>
                <input
                  type="text"
                  id="apiVersion"
                  value={formData.apiVersion}
                  onChange={e => setFormData(prev => ({ ...prev, apiVersion: e.target.value }))}
                  disabled={saving}
                  placeholder="2024-02-15-preview"
                />
              </div>
            </>
          )}

          <div className="form-actions">
            <button type="submit" className="save-config-btn" disabled={saving}>
              {saving ? 'Saving...' : config ? 'Update Configuration' : 'Save Configuration'}
            </button>
            {editing && (
              <button
                type="button"
                className="cancel-config-btn"
                onClick={() => {
                  setEditing(false);
                  setFormData(prev => ({ ...prev, apiKey: '' }));
                }}
                disabled={saving}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

export default ProviderConfigForm;
