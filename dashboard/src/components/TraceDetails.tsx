import { useEffect } from 'react';
import type { Trace } from './TracesTable';
import { statusClass } from './TracesTable';
import './TraceDetails.css';

interface TraceDetailsProps {
  trace: Trace | null;
  onClose: () => void;
}

function estimateCost(t: Trace): string {
  // Rough approximation: prompt @ $0.01/1k tokens, completion @ $0.03/1k tokens
  const cost = (t.prompt_tokens * 0.01 + t.completion_tokens * 0.03) / 1000;
  return `$${cost.toFixed(4)}`;
}

function TraceDetails({ trace, onClose }: TraceDetailsProps) {
  useEffect(() => {
    if (!trace) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [trace, onClose]);

  if (!trace) return null;

  return (
    <>
      <div className="panel-overlay" onClick={onClose} aria-hidden="true" />
      <aside
        className="trace-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Trace Details"
      >
        <div className="panel-header">
          <h2 className="panel-title">Trace Details</h2>
          <button className="panel-close" onClick={onClose} aria-label="Close trace details">
            ✕
          </button>
        </div>

        <div className="panel-body">
          <section className="detail-section">
            <h3 className="section-title">Overview</h3>
            <dl className="detail-grid">
              <dt>Timestamp</dt>
              <dd>{new Date(trace.created_at).toLocaleString()}</dd>

              <dt>Model</dt>
              <dd className="mono">{trace.model}</dd>

              <dt>Provider</dt>
              <dd>{trace.provider}</dd>

              <dt>Status Code</dt>
              <dd>
                <span className={`status-badge ${statusClass(trace.status_code)}`}>
                  {trace.status_code}
                </span>
              </dd>

              <dt>Latency</dt>
              <dd>{trace.latency_ms.toLocaleString()} ms</dd>

              <dt>Prompt Tokens</dt>
              <dd>{trace.prompt_tokens.toLocaleString()}</dd>

              <dt>Completion Tokens</dt>
              <dd>{trace.completion_tokens.toLocaleString()}</dd>

              <dt>Estimated Cost</dt>
              <dd>{estimateCost(trace)}</dd>
            </dl>
          </section>

          <section className="detail-section">
            <h3 className="section-title">Request Body</h3>
            <div className="encrypted-placeholder" aria-label="Request body encrypted">
              🔒 Encrypted (stored securely)
            </div>
          </section>

          <section className="detail-section">
            <h3 className="section-title">Response Body</h3>
            <div className="encrypted-placeholder" aria-label="Response body encrypted">
              🔒 Encrypted (stored securely)
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}

export default TraceDetails;
