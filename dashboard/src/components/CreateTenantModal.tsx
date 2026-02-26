import { useState } from 'react';
import { adminFetch, AdminTenant } from '../utils/adminApi';
import './CreateTenantModal.css';

interface CreateTenantModalProps {
  onCreated: (tenant: AdminTenant) => void;
  onCancel: () => void;
}

function CreateTenantModal({ onCreated, onCancel }: CreateTenantModalProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const res = await adminFetch('/v1/admin/tenants', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `Failed: ${res.status}` }));
        throw new Error(errData.error || 'Failed to create tenant');
      }

      const tenant: AdminTenant = await res.json();
      onCreated(tenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tenant');
      setLoading(false);
    }
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onCancel();
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal-card">
        <h2 id="modal-title" className="modal-title">New Tenant</h2>
        <form onSubmit={handleSubmit}>
          <label htmlFor="tenant-name" className="modal-label">Tenant Name</label>
          <input
            id="tenant-name"
            type="text"
            className="modal-input"
            placeholder="e.g., Acme Corp"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={loading}
            autoFocus
            aria-label="Tenant Name"
          />
          {error && <div className="modal-error">{error}</div>}
          <div className="modal-actions">
            <button
              type="button"
              className="modal-btn modal-btn-cancel"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="modal-btn modal-btn-primary"
              disabled={!name.trim() || loading}
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateTenantModal;
