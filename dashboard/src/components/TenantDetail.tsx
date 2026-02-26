import { useState, useEffect } from 'react';
import { adminFetch, AdminTenant } from '../utils/adminApi';
import ProviderConfigForm from './ProviderConfigForm';
import ApiKeysTable from './ApiKeysTable';
import './TenantDetail.css';

interface TenantDetailProps {
  tenantId: string;
  onBack: () => void;
}

function TenantDetail({ tenantId, onBack }: TenantDetailProps) {
  const [tenant, setTenant] = useState<AdminTenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadTenant();
  }, [tenantId]);

  async function loadTenant() {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`/v1/admin/tenants/${tenantId}`);
      if (!res.ok) {
        throw new Error(`Failed to load tenant: ${res.status}`);
      }
      const data = await res.json();
      setTenant(data);
      setNewName(data.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tenant');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveName() {
    if (!tenant || !newName.trim()) return;
    
    setSaving(true);
    try {
      const res = await adminFetch(`/v1/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: newName.trim() }),
      });
      
      if (!res.ok) {
        throw new Error(`Failed to update tenant: ${res.status}`);
      }
      
      const updated = await res.json();
      setTenant(updated);
      setEditingName(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update tenant name');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!tenant) return;
    
    const newStatus = tenant.status === 'active' ? 'inactive' : 'active';
    setSaving(true);
    try {
      const res = await adminFetch(`/v1/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      
      if (!res.ok) {
        throw new Error(`Failed to update tenant status: ${res.status}`);
      }
      
      const updated = await res.json();
      setTenant(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update tenant status');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await adminFetch(`/v1/admin/tenants/${tenantId}?confirm=true`, {
        method: 'DELETE',
      });
      
      if (!res.ok) {
        throw new Error(`Failed to delete tenant: ${res.status}`);
      }
      
      onBack();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete tenant');
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="tenant-detail">
        <button className="back-btn" onClick={onBack}>← Back to Tenants</button>
        <div className="loading-state">Loading tenant...</div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="tenant-detail">
        <button className="back-btn" onClick={onBack}>← Back to Tenants</button>
        <div className="error-state">⚠️ {error || 'Tenant not found'}</div>
      </div>
    );
  }

  return (
    <div className="tenant-detail">
      <button className="back-btn" onClick={onBack}>← Back to Tenants</button>
      
      <div className="tenant-info-card">
        <div className="tenant-header">
          {editingName ? (
            <div className="name-edit">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                disabled={saving}
                autoFocus
              />
              <button onClick={handleSaveName} disabled={saving || !newName.trim()}>
                Save
              </button>
              <button onClick={() => {
                setEditingName(false);
                setNewName(tenant.name);
              }} disabled={saving}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="name-display">
              <h2>{tenant.name}</h2>
              <button className="edit-btn" onClick={() => setEditingName(true)}>
                Edit
              </button>
            </div>
          )}
          
          <span className={`status-badge status-${tenant.status}`}>
            {tenant.status}
          </span>
        </div>
        
        <div className="tenant-meta">
          <div className="meta-item">
            <span className="meta-label">ID:</span>
            <span className="meta-value">{tenant.id}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Created:</span>
            <span className="meta-value">
              {new Date(tenant.created_at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Updated:</span>
            <span className="meta-value">
              {new Date(tenant.updated_at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>
        
        <div className="tenant-actions">
          <button
            className="toggle-status-btn"
            onClick={handleToggleStatus}
            disabled={saving}
          >
            {tenant.status === 'active' ? 'Deactivate Tenant' : 'Reactivate Tenant'}
          </button>
        </div>
      </div>

      <ProviderConfigForm tenantId={tenantId} />
      <ApiKeysTable tenantId={tenantId} />

      <div className="danger-zone">
        <h3>Danger Zone</h3>
        <p>Permanently delete this tenant and all associated data. This action cannot be undone.</p>
        {showDeleteConfirm ? (
          <div className="delete-confirm">
            <p className="confirm-warning">
              ⚠️ Are you sure? This will delete all traces, API keys, and configuration for this tenant.
            </p>
            <button
              className="confirm-delete-btn"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Yes, Delete Permanently'}
            </button>
            <button
              className="cancel-delete-btn"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="delete-tenant-btn"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete Tenant
          </button>
        )}
      </div>
    </div>
  );
}

export default TenantDetail;
