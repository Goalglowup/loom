import { useState, useEffect, useRef } from 'react';
import AnalyticsSummary from './AnalyticsSummary';
import TimeseriesCharts from './TimeseriesCharts';
import TenantSelector from './TenantSelector';
import type { SummaryData, TimeseriesData, Tenant, WindowHours } from './types';
import './AnalyticsPage.css';

export interface AnalyticsPageProps {
  isAdmin?: boolean;
  fetchSummary: (tenantId?: string, window?: string) => Promise<SummaryData>;
  fetchTimeseries: (tenantId?: string, window?: string) => Promise<TimeseriesData[]>;
  fetchTenants?: () => Promise<Tenant[]>;
}

function AnalyticsPage({ isAdmin, fetchSummary, fetchTimeseries, fetchTenants }: AnalyticsPageProps) {
  const [win, setWin] = useState<WindowHours>(24);
  const [tenantId, setTenantId] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesData[]>([]);
  const [loading, setLoading] = useState(true);

  // Keep stable refs so the effect doesn't re-run when wrapper re-renders
  const fetchSummaryRef = useRef(fetchSummary);
  fetchSummaryRef.current = fetchSummary;
  const fetchTimeseriesRef = useRef(fetchTimeseries);
  fetchTimeseriesRef.current = fetchTimeseries;
  const fetchTenantsRef = useRef(fetchTenants);
  fetchTenantsRef.current = fetchTenants;

  // Load tenant list once (admin only)
  useEffect(() => {
    if (!isAdmin || !fetchTenantsRef.current) return;
    fetchTenantsRef.current()
      .then(setTenants)
      .catch(() => {});
  }, [isAdmin]);

  // Load analytics data whenever window or tenant selection changes; poll every 30s
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const tid = tenantId || undefined;
        const [s, t] = await Promise.all([
          fetchSummaryRef.current(tid, String(win)),
          fetchTimeseriesRef.current(tid, String(win)),
        ]);
        if (!cancelled) {
          setSummary(s);
          setTimeseries(t);
        }
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [win, tenantId]);

  return (
    <div className="shared-analytics-page">
      <div className="shared-analytics-header">
        <h2 className="shared-analytics-title">Analytics</h2>
      </div>

      {isAdmin && fetchTenants && (
        <TenantSelector
          tenants={tenants}
          tenantId={tenantId}
          onChange={id => setTenantId(id)}
        />
      )}

      <div className="shared-analytics-sections">
        <AnalyticsSummary summary={summary} loading={loading} win={win} onWinChange={setWin} />
        <TimeseriesCharts data={timeseries} loading={loading} win={win} />
      </div>
    </div>
  );
}

export default AnalyticsPage;
