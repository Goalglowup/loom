import { getToken } from '../lib/auth';
import { AnalyticsPage as SharedAnalyticsPage } from '@shared/analytics';
import type { SummaryData, TimeseriesData } from '@shared/analytics';
import { BUCKET_MINUTES } from '@shared/analytics';
import type { WindowHours } from '@shared/analytics';

export default function AnalyticsPage() {
  function fetchSummary(_tenantId?: string, window?: string): Promise<SummaryData> {
    const token = getToken();
    const params = new URLSearchParams();
    if (window) params.set('window', window);
    return fetch(`/v1/portal/analytics/summary?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<SummaryData>;
    });
  }

  function fetchTimeseries(_tenantId?: string, window?: string): Promise<TimeseriesData[]> {
    const token = getToken();
    const params = new URLSearchParams();
    if (window) params.set('window', window);
    if (window) {
      const bucket = BUCKET_MINUTES[parseInt(window) as WindowHours];
      if (bucket) params.set('bucket', String(bucket));
    }
    return fetch(`/v1/portal/analytics/timeseries?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<TimeseriesData[]>;
    });
  }

  return (
    <SharedAnalyticsPage
      isAdmin={false}
      fetchSummary={fetchSummary}
      fetchTimeseries={fetchTimeseries}
    />
  );
}

