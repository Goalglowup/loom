import { useState, useEffect } from 'react';
import { adminFetch, AdminTenant } from '../utils/adminApi';
import CreateTenantModal from './CreateTenantModal';
import './TenantsList.css';

interface TenantsListProps {
  onTenantSelect: (tenantId: string) => void;
}

function TenantsList({ onTenantSelect }: TenantsListProps) {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadTenants();
  }, []);

  async function loadTenants() {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch('/v1/admin/tenants');
      if (!res.ok) {
        throw new Error(`Failed to load tenants: ${res.status}`);
      }
      const data = await res.json();
      setTenants(data.tenants ?? data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }

  function handleTenantCreated(tenant: AdminTenant) {
    setTenants(prev => [tenant, ...prev]);
    setShowCreateModal(false);
  }

  function handleRowClick(tenantId: string) {
    onTenantSelect(tenantId);
  }

  if (loading) {
    return (
      <div className="tenants-list">
        <div className="tenants-header">
          <h2>Tenants</h2>
          <button className="new-tenant-btn" disabled>New Tenant</button>
        </div>
        <div className="tenants-table-container">
          <table className="tenants-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th className="align-right">API Keys</th>
                <th className="align-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map(i => (
                <tr key={i} className="skeleton-row">
                  <td><div className="skeleton-cell" /></td>
                  <td><div className="skeleton-cell" /></td>
                  <td className="align-right"><div className="skeleton-cell" /></td>
                  <td className="align-right"><div className="skeleton-cell" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tenants-list">
        <div className="tenants-header">
          <h2>Tenants</h2>
          <button className="new-tenant-btn" onClick={() => loadTenants()}>Retry</button>
        </div>
        <div className="error-state">
          <p>⚠️ {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tenants-list">
      <div className="tenants-header">
        <h2>Tenants</h2>
        <button className="new-tenant-btn" onClick={() => setShowCreateModal(true)}>
          New Tenant
        </button>
      </div>

      {tenants.length === 0 ? (
        <div className="empty-state">
          <p>No tenants yet. Create your first tenant to get started.</p>
        </div>
      ) : (
        <div className="tenants-table-container">
          <table className="tenants-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th className="align-right">API Keys</th>
                <th className="align-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(tenant => (
                <tr
                  key={tenant.id}
                  className="tenant-row"
                  onClick={() => handleRowClick(tenant.id)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={e => e.key === 'Enter' && handleRowClick(tenant.id)}
                >
                  <td className="tenant-name">{tenant.name}</td>
                  <td>
                    <span className={`status-badge status-${tenant.status}`}>
                      {tenant.status}
                    </span>
                  </td>
                  <td className="align-right">—</td>
                  <td className="align-right timestamp">
                    {new Date(tenant.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateTenantModal
          onCreated={handleTenantCreated}
          onCancel={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

export default TenantsList;
