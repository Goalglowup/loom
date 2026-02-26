import { useState } from 'react';
import type { ProviderConfig, ProviderConfigSafe } from '../lib/api';

interface Props {
  initialConfig: ProviderConfigSafe;
  onSave: (config: ProviderConfig) => Promise<void>;
}

export default function ProviderConfigForm({ initialConfig, onSave }: Props) {
  const [provider, setProvider] = useState<'openai' | 'azure' | 'ollama'>(
    (initialConfig.provider as 'openai' | 'azure' | 'ollama') || 'openai'
  );
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(initialConfig.baseUrl || '');
  const [deployment, setDeployment] = useState(initialConfig.deployment || '');
  const [apiVersion, setApiVersion] = useState(initialConfig.apiVersion || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const config: ProviderConfig = { provider };
      if (apiKey && provider !== 'ollama') config.apiKey = apiKey;
      if (baseUrl) config.baseUrl = baseUrl;
      if (provider === 'azure') {
        if (deployment) config.deployment = deployment;
        if (apiVersion) config.apiVersion = apiVersion;
      }
      await onSave(config);
      setApiKey('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Provider selector */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">Provider</label>
        <select
          value={provider}
          onChange={e => setProvider(e.target.value as 'openai' | 'azure' | 'ollama')}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-indigo-500"
        >
          <option value="openai">OpenAI</option>
          <option value="azure">Azure OpenAI</option>
          <option value="ollama">Ollama (local)</option>
        </select>
      </div>

      {/* API Key — not needed for Ollama */}
      {provider !== 'ollama' && (
      <div>
        <label className="block text-sm text-gray-400 mb-1">
          {provider === 'azure' ? 'Azure API Key' : 'OpenAI API Key'}
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={initialConfig.hasApiKey ? '••••••••• (set — enter new value to change)' : 'Enter API key'}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        />
      </div>
      )}

      {/* Base URL */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">
          Base URL {provider !== 'ollama' && <span className="text-gray-600">(optional)</span>}
        </label>
        <input
          type="url"
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder={
            provider === 'azure' ? 'https://your-resource.openai.azure.com' :
            provider === 'ollama' ? 'http://localhost:11434' :
            'https://api.openai.com/v1'
          }
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Azure-specific fields */}
      {provider === 'azure' && (
        <>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Deployment name</label>
            <input
              type="text"
              value={deployment}
              onChange={e => setDeployment(e.target.value)}
              placeholder="gpt-4"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">API Version</label>
            <input
              type="text"
              value={apiVersion}
              onChange={e => setApiVersion(e.target.value)}
              placeholder="2024-02-15-preview"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </>
      )}

      {error && (
        <p className="text-sm text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {success && (
        <p className="text-sm text-green-400 bg-green-950/30 border border-green-800 rounded-lg px-3 py-2">
          ✓ Settings saved
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  );
}
