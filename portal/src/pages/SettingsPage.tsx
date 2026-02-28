import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ProviderConfig, ProviderConfigSafe } from '../lib/api';
import { getToken } from '../lib/auth';
import ProviderConfigForm from '../components/ProviderConfigForm';
import ModelListEditor from '../components/ModelListEditor';
import { COMMON_MODELS } from '../lib/models';

export default function SettingsPage() {
  const [config, setConfig] = useState<ProviderConfigSafe | null>(null);
  const [availableModels, setAvailableModels] = useState<string[] | null>(null);
  const [currentProviderConfig, setCurrentProviderConfig] = useState<ProviderConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modelSaveStatus, setModelSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api.me(token)
      .then(({ tenant }) => {
        setConfig(tenant.providerConfig);
        setAvailableModels(tenant.availableModels ?? null);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(providerConfig: ProviderConfig) {
    const token = getToken()!;
    setCurrentProviderConfig(providerConfig);
    const { providerConfig: updated } = await api.updateSettings(token, { ...providerConfig, availableModels });
    setConfig(updated);
  }

  async function handleModelsChange(models: string[] | null) {
    setAvailableModels(models);
    const token = getToken()!;
    setModelSaveStatus('saving');
    try {
      await api.updateSettings(token, {
        ...(currentProviderConfig ?? { provider: config?.provider as ProviderConfig['provider'] ?? 'openai' }),
        availableModels: models,
      });
      setModelSaveStatus('saved');
      setTimeout(() => setModelSaveStatus('idle'), 2000);
    } catch {
      setModelSaveStatus('error');
    }
  }

  return (
    <div className="p-8 space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Org Defaults</h1>
        <p className="text-gray-400 text-sm mt-1">
          Default settings inherited by agents. Agents can override these or leave them blank to use these values.
        </p>
      </div>

      {loading && <p className="text-gray-500 animate-pulse">Loading…</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && !error && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 space-y-4">
          {/* Current state summary */}
          {config?.provider && (
            <div className="flex items-center gap-2 text-sm text-gray-400 border-b border-gray-700 pb-4">
              <span className="text-green-400">✓</span>
              <span>
                Currently using <span className="text-gray-200 font-medium">{config.provider}</span>
                {config.hasApiKey ? ' · API key set' : ''}
                {config.baseUrl ? ` · ${config.baseUrl}` : ''}
              </span>
            </div>
          )}

          <ProviderConfigForm
            initialConfig={config ?? { provider: null, baseUrl: null, deployment: null, apiVersion: null, hasApiKey: false }}
            onSave={handleSave}
          />

          <div className="border-t border-gray-700 pt-4">
            <ModelListEditor
              models={availableModels}
              onChange={handleModelsChange}
              defaultModels={COMMON_MODELS}
              label="Available Models"
            />
            {modelSaveStatus === 'saving' && <p className="text-xs text-gray-500 mt-2">Saving…</p>}
            {modelSaveStatus === 'saved' && <p className="text-xs text-green-400 mt-2">Saved.</p>}
            {modelSaveStatus === 'error' && <p className="text-xs text-red-400 mt-2">Failed to save model list.</p>}
          </div>

          <p className="text-xs text-gray-500 border-t border-gray-700 pt-4">
            These settings are inherited by all agents in this org unless the agent defines its own.
          </p>
        </div>
      )}
    </div>
  );
}
