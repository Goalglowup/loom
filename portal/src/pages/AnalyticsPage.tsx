import { useState, useEffect } from 'react';
import { getToken } from '../lib/auth';

interface Summary {
  totalRequests: number;
  totalTokens: number;
  estimatedCostUSD: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errorRate: number;
}

interface Bucket {
  bucket: string;
  requests: number;
  tokens: number;
  avgLatencyMs: number;
}

type WindowHours = 1 | 6 | 24 | 168;

const WINDOWS: { label: string; value: WindowHours }[] = [
  { label: '1h', value: 1 },
  { label: '6h', value: 6 },
  { label: '24h', value: 24 },
  { label: '7d', value: 168 },
];

const BUCKET_MINUTES: Record<WindowHours, number> = { 1: 5, 6: 30, 24: 60, 168: 360 };

export default function AnalyticsPage() {
  const [win, setWin] = useState<WindowHours>(24);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    setLoading(true);
    const bucket = BUCKET_MINUTES[win];
    Promise.all([
      fetch(`/v1/analytics/summary?window=${win}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/v1/analytics/timeseries?window=${win}&bucket=${bucket}`, { headers: { Authorization: `Bearer ${token}` } }),
    ])
      .then(async ([sr, tr]) => {
        if (!sr.ok) throw new Error(`Summary HTTP ${sr.status}`);
        if (!tr.ok) throw new Error(`Timeseries HTTP ${tr.status}`);
        const [s, t] = await Promise.all([sr.json(), tr.json()]);
        setSummary(s as Summary);
        setBuckets(t as Bucket[]);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [win]);

  const summaryCards = summary
    ? [
        { label: 'Total Requests', value: summary.totalRequests.toLocaleString(), icon: '📊' },
        { label: 'Avg Latency', value: `${summary.avgLatencyMs.toFixed(0)} ms`, icon: '⚡' },
        { label: 'Total Tokens', value: summary.totalTokens.toLocaleString(), icon: '🔤' },
        { label: 'Error Rate', value: `${(summary.errorRate * 100).toFixed(1)}%`, icon: '⚠️' },
      ]
    : [];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-gray-400 text-sm mt-1">Usage metrics for your tenant</p>
        </div>

        <div className="flex gap-1 bg-gray-800 rounded-lg p-1" role="group" aria-label="Time window">
          {WINDOWS.map(w => (
            <button
              key={w.value}
              onClick={() => setWin(w.value)}
              aria-pressed={win === w.value}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                win === w.value
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="bg-gray-900 border border-gray-700 rounded-xl p-5 animate-pulse space-y-2">
                <div className="h-3 bg-gray-800 rounded w-2/3" />
                <div className="h-7 bg-gray-800 rounded w-1/2" />
              </div>
            ))
          : summaryCards.map(card => (
              <div key={card.label} className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-1">
                <p className="text-xs uppercase tracking-wide text-gray-500">{card.icon} {card.label}</p>
                <p className="text-2xl font-bold text-white tabular-nums">{card.value}</p>
              </div>
            ))}
      </div>

      {/* Request volume table */}
      {!loading && buckets.length > 0 && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-700">
            <h2 className="text-sm font-semibold text-gray-200">Request volume</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium text-left">Bucket</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium text-right">Requests</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium text-right">Tokens</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-medium text-right">Avg Latency</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map(b => (
                  <tr key={b.bucket} className="border-b border-gray-800 hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs">
                      {new Date(b.bucket).toLocaleString('en-US', {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit', hour12: false,
                      })}
                    </td>
                    <td className="px-4 py-3 text-gray-200 text-right tabular-nums">{b.requests.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-200 text-right tabular-nums">{b.tokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-200 text-right tabular-nums">{b.avgLatencyMs.toFixed(0)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
