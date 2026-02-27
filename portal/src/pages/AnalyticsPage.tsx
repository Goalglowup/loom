import { useState } from 'react';
import { getToken } from '../lib/auth';
import { AnalyticsPage as SharedAnalyticsPage } from '@shared/analytics';
import type { SummaryData, TimeseriesData, ModelBreakdown } from '@shared/analytics';
import { BUCKET_MINUTES } from '@shared/analytics';
import type { WindowHours } from '@shared/analytics';

export default function AnalyticsPage() {
  const [rollup, setRollup] = useState(true);

  function fetchSummary(_tenantId?: string, window?: string): Promise<SummaryData> {
    const token = getToken();
    const params = new URLSearchParams();
    if (window) params.set('window', window);
    if (rollup) params.set('rollup', 'true');
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
    if (rollup) params.set('rollup', 'true');
    return fetch(`/v1/portal/analytics/timeseries?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<TimeseriesData[]>;
    });
  }

  function fetchModels(_tenantId?: string, window?: string): Promise<ModelBreakdown[]> {
    const token = getToken();
    const params = new URLSearchParams();
    if (window) params.set('window', window);
    if (rollup) params.set('rollup', 'true');
    return fetch(`/v1/portal/analytics/models?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json().then((d: { models: ModelBreakdown[] }) => d.models);
    });
  }

  return (
    <div>
      <div className="px-8 pt-6 flex items-center gap-3">
        <span className="text-sm text-gray-400 font-medium">Scope:</span>
        <select
          value={rollup ? 'rollup' : 'org'}
          onChange={e => setRollup(e.target.value === 'rollup')}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-indigo-500"
        >
          <option value="rollup">All — roll up subtenants + agents</option>
          <option value="org">This org only</option>
        </select>
      </div>
      <SharedAnalyticsPage
        key={rollup ? 'rollup' : 'org'}
        isAdmin={false}
        fetchSummary={fetchSummary}
        fetchTimeseries={fetchTimeseries}
        fetchModels={fetchModels}
      />
    </div>
  );
}
