import { useState } from 'react';
import { setApiKey } from '../utils/api';
import './ApiKeyPrompt.css';

interface ApiKeyPromptProps {
  onSaved: () => void;
}

function ApiKeyPrompt({ onSaved }: ApiKeyPromptProps) {
  const [value, setValue] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      setApiKey(trimmed);
      onSaved();
    }
  }

  return (
    <div className="api-key-overlay" role="dialog" aria-modal="true" aria-label="API Key Required">
      <div className="api-key-card">
        <h2 className="api-key-title">API Key Required</h2>
        <p className="api-key-desc">
          Enter your Loom API key to load dashboard data. You can find it in your tenant settings.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            className="api-key-input"
            placeholder="sk-loom-..."
            value={value}
            onChange={e => setValue(e.target.value)}
            autoFocus
            aria-label="API Key"
          />
          <button type="submit" className="api-key-btn" disabled={!value.trim()}>
            Save &amp; Continue
          </button>
        </form>
      </div>
    </div>
  );
}

export default ApiKeyPrompt;
