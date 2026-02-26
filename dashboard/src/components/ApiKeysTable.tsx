import { useState, useEffect } from 'react';
import { adminFetch, AdminApiKey } from '../utils/adminApi';
import CreateApiKeyModal from './CreateApiKeyModal';
import './ApiKeysTable.css';

interface ApiKeysTableProps {
  tenantId: string;
}

function ApiKeysTable({ tenantId }: ApiKeysTableProps) {
  const [keys, setKeys] = useState<AdminApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadKeys();
  }, [tenantId]);

  async function loadKeys() {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`/v1/admin/tenants/${tenantId}/api-keys`);
      if (!res.ok) {
        throw new Error(`Failed to load API keys: ${res.status}`);
      }
      const data = await res.json();
      setKeys(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(keyId: string) {
    if (!confirm('Revoke this API key? It will no longer authenticate requests.')) {
      return;
    }
    
    setRevoking(keyId);
    try {
      const res = await adminFetch(`/v1/admin/tenants/${tenantId}/api-keys/${keyId}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) {
        throw new Error(`Failed to revoke API key: ${res.status}`);
      }
      
      await loadKeys();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke API key');
    } finally {
      setRevoking(null);
    }
  }

  async function handleDelete(keyId: string) {
    if (!confirm('Permanently delete this API key? This action cannot be undone.')) {
      return;
    }
    
    setDeleting(keyId);
    try {
      const res = await adminFetch(
        `/v1/admin/tenants/${tenantId}/api-keys/${keyId}?permanent=true`,
        { method: 'DELETE' }
      );
      
      if (!res.ok) {
        throw new Error(`Failed to delete API key: ${res.status}`);
      }
      
      await loadKeys();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete API key');
    } finally {
      setDeleting(null);
    }
  }

  function handleKeyCreated(key: AdminApiKey) {
    setKeys(prev => [key, ...prev]);
    setShowCreateModal(false);
  }

  if (loading) {
    return (
      <div className="api-keys-card">
        <h3>API Keys</h3>
        <div className="loading-state">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="api-keys-card">
        <h3>API Keys</h3>
        <div className="error-state">⚠️ {error}</div>
      </div>
    );
  }

  return (
    <div className="api-keys-card">
      <div className="card-header">
        <h3>API Keys</h3>
        <button className="create-key-btn" onClick={() => setShowCreateModal(true)}>
          Create API Key
        </button>
      </div>

      {keys.length === 0 ? (
        <div className="empty-keys-state">
          <p>No API keys yet. Create one to authenticate requests for this tenant.</p>
        </div>
      ) : (
        <div className="keys-table-container">
          <table className="keys-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key Prefix</th>
                <th>Status</th>
                <th className="align-right">Created</th>
                <th className="align-right">Revoked</th>
                <th className="align-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(key => (
                <tr key={key.id}>
                  <td className="key-name">{key.name}</td>
                  <td className="key-prefix">{key.keyPrefix || 'loom_sk_...'}</td>
                  <td>
                    <span className={`status-badge status-${key.status}`}>
                      {key.status}
                    </span>
                  </td>
                  <td className="align-right timestamp">
                    {new Date(key.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="align-right timestamp">
                    {key.revoked_at
                      ? new Date(key.revoked_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : '—'}
                  </td>
                  <td className="align-right actions-cell">
                    {key.status === 'active' ? (
                      <button
                        className="revoke-btn"
                        onClick={() => handleRevoke(key.id)}
                        disabled={revoking === key.id}
                      >
                        {revoking === key.id ? 'Revoking...' : 'Revoke'}
                      </button>
                    ) : (
                      <button
                        className="delete-btn"
                        onClick={() => handleDelete(key.id)}
                        disabled={deleting === key.id}
                      >
                        {deleting === key.id ? 'Deleting...' : 'Delete'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateApiKeyModal
          tenantId={tenantId}
          onCreated={handleKeyCreated}
          onCancel={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

export default ApiKeysTable;
