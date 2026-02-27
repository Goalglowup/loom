import { useState, useEffect } from 'react';
import { getAdminToken, ADMIN_BASE, adminAuthHeaders, type AdminTenant } from '../utils/adminApi';
import AnalyticsSummary, { type WindowHours } from '../components/AnalyticsSummary';
import TimeseriesCharts from '../components/TimeseriesCharts';
import './AnalyticsPage.css';

function AnalyticsPage() {
  const [hasToken] = useState(() => !!getAdminToken());
  const [win, setWin] = useState<WindowHours>(24);
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
            <a href="/dashboard/admin" style={{ color: '#6366f1' }}>Sign in as admin</a> to view analytics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Analytics</h2>
      </div>

      <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <label htmlFor="tenant-filter-analytics" style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Tenant
        </label>
        <select
          id="tenant-filter-analytics"
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

      <div className="analytics-sections">
        <AnalyticsSummary adminMode tenantId={tenantId || undefined} win={win} onWinChange={setWin} />
        <TimeseriesCharts adminMode tenantId={tenantId || undefined} win={win} />
      </div>
    </div>
  );
}

export default AnalyticsPage;
