import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ProviderConfig, ProviderConfigSafe } from '../lib/api';
import { getToken } from '../lib/auth';
import ProviderConfigForm from '../components/ProviderConfigForm';

export default function SettingsPage() {
  const [config, setConfig] = useState<ProviderConfigSafe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api.me(token)
      .then(({ tenant }) => setConfig(tenant.providerConfig))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(providerConfig: ProviderConfig) {
    const token = getToken()!;
    const { providerConfig: updated } = await api.updateSettings(token, providerConfig);
    setConfig(updated);
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

          <p className="text-xs text-gray-500 border-t border-gray-700 pt-4">
            These settings are inherited by all agents in this org unless the agent defines its own.
          </p>
        </div>
      )}
    </div>
  );
}
