import { useState, useEffect } from 'react';
import { getAdminToken, ADMIN_BASE, adminAuthHeaders, type AdminTenant } from '../utils/adminApi';
import TracesTable, { type Trace } from '../components/TracesTable';
import TraceDetails from '../components/TraceDetails';
import './TracesPage.css';

function TracesPage() {
  const [hasToken] = useState(() => !!getAdminToken());
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [tenantId, setTenantId] = useState('');

  useEffect(() => {
    if (!hasToken) return;
    fetch(`${ADMIN_BASE}/v1/admin/tenants`, { headers: adminAuthHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: { tenants: AdminTenant[] }) => setTenants(data.tenants))
      .catch(() => {});
  }, [hasToken]);

  if (!hasToken) {
    return (
      <div className="page">
        <div className="page-header">
          <h2 className="page-title">Admin session required</h2>
          <p className="page-subtitle">
            <a href="/dashboard/admin" style={{ color: '#6366f1' }}>Sign in as admin</a> to view traces.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Traces</h2>
        <p className="page-subtitle">All tenants — scroll to load more</p>
      </div>

      <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <label htmlFor="tenant-filter" style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Tenant
        </label>
        <select
          id="tenant-filter"
          className="filter-select"
          value={tenantId}
          onChange={e => setTenantId(e.target.value)}
        >
          <option value="">All tenants</option>
          {tenants.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <TracesTable
        adminMode
        tenantId={tenantId || undefined}
        onRowClick={setSelectedTrace}
      />

      <TraceDetails trace={selectedTrace} onClose={() => setSelectedTrace(null)} />
    </div>
  );
}

export default TracesPage;
