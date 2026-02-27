import { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { API_BASE, authHeaders } from '../utils/api';
import { ADMIN_BASE, adminAuthHeaders } from '../utils/adminApi';
import type { WindowHours } from './AnalyticsSummary';
import './TimeseriesCharts.css';

interface Bucket {
  bucket: string;
  requests: number;
  tokens: number;
  costUSD: number;
  avgLatencyMs: number;
}

interface TimeseriesChartsProps {
  win: WindowHours;
  adminMode?: boolean;
  tenantId?: string;
}

const BUCKET_MINUTES: Record<WindowHours, number> = {
  1: 5,
  6: 30,
  24: 60,
  168: 360,
};

function formatBucketLabel(isoStr: string, win: WindowHours): string {
  const d = new Date(isoStr);
  if (win <= 24) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', hour12: false });
}

function LoadingChart() {
  return (
    <div className="chart-loading" aria-label="Loading chart data">
      <div className="chart-skeleton" aria-hidden="true" />
    </div>
  );
}

function TimeseriesCharts({ win, adminMode, tenantId }: TimeseriesChartsProps) {
  const [data, setData] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const bucket = BUCKET_MINUTES[win];
        const params = new URLSearchParams({ window: String(win), bucket: String(bucket) });
        if (adminMode && tenantId) params.set('tenant_id', tenantId);
        const base = adminMode ? ADMIN_BASE : API_BASE;
        const path = adminMode ? '/v1/admin/analytics/timeseries' : '/v1/analytics/timeseries';
        const headers = adminMode ? adminAuthHeaders() : authHeaders();
        const res = await fetch(`${base}${path}?${params}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = (await res.json()) as Bucket[];
        if (!cancelled) setData(raw);
      } catch (err) {
        console.error('Failed to fetch timeseries:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [win, adminMode, tenantId]);

  const chartData = data.map(b => ({
    ...b,
    label: formatBucketLabel(b.bucket, win),
  }));

  return (
    <div className="timeseries-charts">
      <div className="chart-block">
        <h3 className="chart-title">Requests over Time</h3>
        {loading ? (
          <LoadingChart />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="reqGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{ fontSize: '0.8125rem', borderRadius: 6, border: '1px solid #e5e7eb' }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Area
                type="monotone"
                dataKey="requests"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#reqGradient)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="chart-block">
        <h3 className="chart-title">Avg Latency over Time (ms)</h3>
        {loading ? (
          <LoadingChart />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="latGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{ fontSize: '0.8125rem', borderRadius: 6, border: '1px solid #e5e7eb' }}
                labelStyle={{ fontWeight: 600 }}
                formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(0)} ms`, 'Avg Latency']}
              />
              <Area
                type="monotone"
                dataKey="avgLatencyMs"
                stroke="#059669"
                strokeWidth={2}
                fill="url(#latGradient)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default TimeseriesCharts;
