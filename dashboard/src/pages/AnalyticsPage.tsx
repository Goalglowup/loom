import { useState } from 'react';
import { getAdminToken, ADMIN_BASE, adminAuthHeaders, type AdminTenant } from '../utils/adminApi';
import { AnalyticsPage as SharedAnalyticsPage } from '@shared/analytics';
import type { SummaryData, TimeseriesData, ModelBreakdown, Tenant } from '@shared/analytics';
import { BUCKET_MINUTES } from '@shared/analytics';
import type { WindowHours } from '@shared/analytics';
import './AnalyticsPage.css';

function AnalyticsPage() {
  const [hasToken] = useState(() => !!getAdminToken());

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

  async function fetchSummary(tenantId?: string, window?: string): Promise<SummaryData> {
    const params = new URLSearchParams();
    if (window) params.set('window', window);
    if (tenantId) params.set('tenant_id', tenantId);
    const res = await fetch(`${ADMIN_BASE}/v1/admin/analytics/summary?${params}`, { headers: adminAuthHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<SummaryData>;
  }

  async function fetchTimeseries(tenantId?: string, window?: string): Promise<TimeseriesData[]> {
    const params = new URLSearchParams();
    if (window) params.set('window', window);
    if (window) {
      const bucket = BUCKET_MINUTES[parseInt(window) as WindowHours];
      if (bucket) params.set('bucket', String(bucket));
    }
    if (tenantId) params.set('tenant_id', tenantId);
    const res = await fetch(`${ADMIN_BASE}/v1/admin/analytics/timeseries?${params}`, { headers: adminAuthHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<TimeseriesData[]>;
  }

  async function fetchTenants(): Promise<Tenant[]> {
    const res = await fetch(`${ADMIN_BASE}/v1/admin/tenants`, { headers: adminAuthHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { tenants: AdminTenant[] };
    return data.tenants.map(t => ({ id: t.id, name: t.name }));
  }

  async function fetchModels(tenantId?: string, window?: string): Promise<ModelBreakdown[]> {
    const params = new URLSearchParams();
    if (window) params.set('window', window);
    if (tenantId) params.set('tenant_id', tenantId);
    const res = await fetch(`${ADMIN_BASE}/v1/admin/analytics/models?${params}`, { headers: adminAuthHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { models: ModelBreakdown[] };
    return data.models;
  }

  return (
    <div className="page">
      <SharedAnalyticsPage
        isAdmin={true}
        fetchSummary={fetchSummary}
        fetchTimeseries={fetchTimeseries}
        fetchModels={fetchModels}
        fetchTenants={fetchTenants}
      />
    </div>
  );
}

export default AnalyticsPage;

