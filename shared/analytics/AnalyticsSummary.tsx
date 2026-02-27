import type { SummaryData, WindowHours } from './types';
import './AnalyticsSummary.css';

const WINDOW_OPTIONS: { label: string; value: WindowHours }[] = [
  { label: '1h', value: 1 },
  { label: '6h', value: 6 },
  { label: '24h', value: 24 },
  { label: '7d', value: 168 },
];

function SkeletonCard() {
  return (
    <div className="summary-card skeleton-card" aria-hidden="true">
      <span className="skeleton-line short" />
      <span className="skeleton-line tall" />
    </div>
  );
}

interface AnalyticsSummaryProps {
  summary: SummaryData | null;
  loading: boolean;
  win: WindowHours;
  onWinChange: (w: WindowHours) => void;
}

function AnalyticsSummary({ summary, loading, win, onWinChange }: AnalyticsSummaryProps) {
  const cards = summary
    ? [
        { label: 'Total Requests', value: summary.totalRequests.toLocaleString() },
        { label: 'Total Tokens', value: summary.totalTokens.toLocaleString() },
        { label: 'Estimated Cost', value: `$${summary.estimatedCostUSD.toFixed(4)}` },
        { label: 'Avg Latency', value: `${summary.avgLatencyMs.toFixed(0)} ms` },
        { label: 'P95 Latency', value: `${summary.p95LatencyMs.toFixed(0)} ms` },
        { label: 'P99 Latency', value: `${summary.p99LatencyMs.toFixed(0)} ms` },
        { label: 'Error Rate', value: `${(summary.errorRate * 100).toFixed(1)}%` },
        { label: 'Avg Overhead', value: `${summary.avgOverheadMs.toFixed(0)} ms` },
        { label: 'Avg TTFB', value: `${summary.avgTtfbMs.toFixed(0)} ms` },
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
          ? Array.from({ length: 9 }, (_, i) => <SkeletonCard key={i} />)
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
