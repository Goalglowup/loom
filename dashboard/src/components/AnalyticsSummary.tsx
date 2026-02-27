import { useState, useEffect } from 'react';
import { API_BASE, authHeaders } from '../utils/api';
import { ADMIN_BASE, adminAuthHeaders } from '../utils/adminApi';
import './AnalyticsSummary.css';

interface Summary {
  totalRequests: number;
  totalTokens: number;
  estimatedCostUSD: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errorRate: number;
}

export type WindowHours = 1 | 6 | 24 | 168;

const WINDOW_OPTIONS: { label: string; value: WindowHours }[] = [
  { label: '1h', value: 1 },
  { label: '6h', value: 6 },
  { label: '24h', value: 24 },
  { label: '7d', value: 168 },
];

interface AnalyticsSummaryProps {
  win: WindowHours;
  onWinChange: (w: WindowHours) => void;
  adminMode?: boolean;
  tenantId?: string;
}

function SkeletonCard() {
  return (
    <div className="summary-card skeleton-card" aria-hidden="true">
      <span className="skeleton-line short" />
      <span className="skeleton-line tall" />
    </div>
  );
}

function AnalyticsSummary({ win, onWinChange, adminMode, tenantId }: AnalyticsSummaryProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ window: String(win) });
        if (adminMode && tenantId) params.set('tenant_id', tenantId);
        const base = adminMode ? ADMIN_BASE : API_BASE;
        const path = adminMode ? '/v1/admin/analytics/summary' : '/v1/analytics/summary';
        const headers = adminMode ? adminAuthHeaders() : authHeaders();
        const res = await fetch(`${base}${path}?${params}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Summary;
        if (!cancelled) setSummary(data);
      } catch (err) {
        console.error('Failed to fetch analytics summary:', err);
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
  }, [win, adminMode, tenantId]);

  const cards = summary
    ? [
        { label: 'Total Requests', value: summary.totalRequests.toLocaleString() },
        { label: 'Total Tokens', value: summary.totalTokens.toLocaleString() },
        { label: 'Estimated Cost', value: `$${summary.estimatedCostUSD.toFixed(2)}` },
        { label: 'Avg Latency', value: `${summary.avgLatencyMs.toFixed(0)} ms` },
        { label: 'P95 Latency', value: `${summary.p95LatencyMs.toFixed(0)} ms` },
        { label: 'Error Rate', value: `${(summary.errorRate * 100).toFixed(1)}%` },
      ]
    : [];

  return (
    <div className="analytics-summary">
      <div className="summary-header">
        <h3 className="summary-heading">Summary</h3>
        <div className="window-selector" role="group" aria-label="Time window">
          {WINDOW_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`window-btn ${win === opt.value ? 'active' : ''}`}
              onClick={() => onWinChange(opt.value)}
              aria-pressed={win === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="summary-cards" role="list" aria-label="Analytics metrics">
        {loading
          ? Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)
          : cards.map(card => (
              <div className="summary-card" key={card.label} role="listitem">
                <span className="card-label">{card.label}</span>
                <span className="card-value">{card.value}</span>
              </div>
            ))}
      </div>
    </div>
  );
}

export default AnalyticsSummary;
