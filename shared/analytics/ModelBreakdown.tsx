import type { ModelBreakdown } from './types';
import './ModelBreakdown.css';

function SkeletonRow() {
  return (
    <tr className="model-skeleton-row" aria-hidden="true">
      {[1, 2, 3, 4, 5].map(i => (
        <td key={i}><span className="model-skeleton-cell" /></td>
      ))}
    </tr>
  );
}

interface ModelBreakdownProps {
  models: ModelBreakdown[] | null;
  loading: boolean;
}

function ModelBreakdownTable({ models, loading }: ModelBreakdownProps) {
  return (
    <div className="model-breakdown">
      <h3 className="model-breakdown-title">Top Models</h3>
      <div className="model-table-container">
        <table className="model-table">
          <thead>
            <tr>
              <th>Model</th>
              <th className="align-right">Requests</th>
              <th className="align-right">Error Rate</th>
              <th className="align-right">Avg Latency</th>
              <th className="align-right">Tokens</th>
              <th className="align-right">Est. Cost</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }, (_, i) => <SkeletonRow key={i} />)
            ) : !models || models.length === 0 ? (
              <tr>
                <td colSpan={6} className="model-empty">No data for this window.</td>
              </tr>
            ) : (
              models.map(m => (
                <tr key={m.model} className="model-row">
                  <td className="model-name">{m.model}</td>
                  <td className="align-right">{m.requests.toLocaleString()}</td>
                  <td className="align-right">
                    <span className={`error-badge ${m.errorRate > 0.05 ? 'error-high' : m.errorRate > 0 ? 'error-low' : ''}`}>
                      {(m.errorRate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="align-right">{m.avgLatencyMs.toFixed(0)} ms</td>
                  <td className="align-right">{m.totalTokens.toLocaleString()}</td>
                  <td className="align-right">${m.estimatedCostUSD.toFixed(4)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ModelBreakdownTable;
