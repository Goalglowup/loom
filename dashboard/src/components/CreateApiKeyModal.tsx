import { useState } from 'react';
import { adminFetch, AdminApiKey } from '../utils/adminApi';
import './CreateApiKeyModal.css';

interface CreateApiKeyModalProps {
  tenantId: string;
  onCreated: (key: AdminApiKey) => void;
  onCancel: () => void;
}

interface CreateApiKeyResponse {
  key: AdminApiKey;
  rawKey: string;
}

function CreateApiKeyModal({ tenantId, onCreated, onCancel }: CreateApiKeyModalProps) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    
    setCreating(true);
    setError(null);
    
    try {
      const res = await adminFetch(`/v1/admin/tenants/${tenantId}/api-keys`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to create API key: ${res.status} ${errorText}`);
      }
      
      const data: CreateApiKeyResponse = await res.json();
      setRawKey(data.rawKey);
      onCreated(data.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  }

  function handleCopy() {
    if (rawKey) {
      navigator.clipboard.writeText(rawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleClose(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      if (!rawKey || confirm('Close without saving the API key? You won\'t see it again.')) {
        onCancel();
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && !rawKey) {
      onCancel();
    }
  }

  return (
    <div className="modal-overlay" onClick={handleClose} onKeyDown={handleKeyDown}>
      <div className="modal-card">
        <h2>{rawKey ? 'API Key Created' : 'Create API Key'}</h2>
        
        {!rawKey ? (
          <form onSubmit={handleSubmit}>
            <div className="modal-form-group">
              <label htmlFor="keyName">Key Name</label>
              <input
                type="text"
                id="keyName"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Production Key"
                disabled={creating}
                autoFocus
              />
            </div>
            
            {error && <div className="modal-error">{error}</div>}
            
            <div className="modal-actions">
              <button type="submit" className="modal-submit-btn" disabled={creating || !name.trim()}>
                {creating ? 'Creating...' : 'Create Key'}
              </button>
              <button
                type="button"
                className="modal-cancel-btn"
                onClick={onCancel}
                disabled={creating}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="key-reveal">
            <div className="warning-banner">
              <span className="warning-icon">⚠️</span>
              <span>Save this key now. You won't be able to see it again.</span>
            </div>
            
            <div className="raw-key-container">
              <code className="raw-key">{rawKey}</code>
              <button
                className="copy-key-btn"
                onClick={handleCopy}
                disabled={copied}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            
            <div className="modal-actions">
              <button className="modal-done-btn" onClick={onCancel}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CreateApiKeyModal;
