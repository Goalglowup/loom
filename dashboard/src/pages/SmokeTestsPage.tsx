import { useState, useEffect, useRef } from 'react';
import { getSmokeTestRuns, triggerSmokeTestRun, getSmokeTestRun, type SmokeTestRunSummary } from '../utils/adminApi';
import './SmokeTestsPage.css';

function SmokeTestsPage() {
  const [runs, setRuns] = useState<SmokeTestRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<SmokeTestRunSummary | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadRuns();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Poll while any run is in progress
  useEffect(() => {
    const hasRunning = runs.some((r) => r.status === 'running');
    if (hasRunning && !pollRef.current) {
      pollRef.current = setInterval(loadRuns, 5000);
    } else if (!hasRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [runs]);

  async function loadRuns() {
    try {
      setError(null);
      const data = await getSmokeTestRuns();
      setRuns(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load smoke test runs');
    } finally {
      setLoading(false);
    }
  }

  async function handleTrigger() {
    try {
      setTriggering(true);
      setError(null);
      await triggerSmokeTestRun();
      // Reload immediately to show the new running entry
      await loadRuns();
    } catch (err: any) {
      setError(err.message || 'Failed to trigger smoke test run');
    } finally {
      setTriggering(false);
    }
  }

  async function handleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedRun(null);
      return;
    }
    try {
      const run = await getSmokeTestRun(id);
      setExpandedId(id);
      setExpandedRun(run);
    } catch {
      setError('Failed to load run details');
    }
  }

  function statusBadgeClass(status: string) {
    switch (status) {
      case 'passed': return 'smoke-status-passed';
      case 'failed': return 'smoke-status-failed';
      case 'running': return 'smoke-status-running';
      case 'error': return 'smoke-status-error';
      default: return '';
    }
  }

  function formatDuration(ms: number | null): string {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }

  if (loading) {
    return (
      <div className="smoke-tests-page">
        <div className="loading">Loading smoke test runs...</div>
      </div>
    );
  }

  return (
    <div className="smoke-tests-page">
      <div className="smoke-tests-header">
        <h1>Smoke Tests</h1>
        <button
          className="run-tests-btn"
          onClick={handleTrigger}
          disabled={triggering || runs.some((r) => r.status === 'running')}
        >
          {triggering ? 'Triggering...' : 'Run Tests'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {runs.length === 0 ? (
        <div className="empty-state">No smoke test runs yet</div>
      ) : (
        <div className="smoke-table-container">
          <table className="smoke-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Triggered By</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Passed</th>
                <th>Failed</th>
                <th>Skipped</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <>
                  <tr
                    key={run.id}
                    className={`smoke-row ${expandedId === run.id ? 'expanded' : ''}`}
                    onClick={() => handleExpand(run.id)}
                  >
                    <td>
                      <span className={`status-badge ${statusBadgeClass(run.status)}`}>
                        {run.status}
                      </span>
                    </td>
                    <td>{run.triggeredBy}</td>
                    <td>{formatTime(run.startedAt)}</td>
                    <td>{formatDuration(run.durationMs)}</td>
                    <td className="count-passed">{run.passed ?? '—'}</td>
                    <td className="count-failed">{run.failed ?? '—'}</td>
                    <td>{run.skipped ?? '—'}</td>
                    <td>{run.total ?? '—'}</td>
                  </tr>
                  {expandedId === run.id && expandedRun && (
                    <tr key={`${run.id}-detail`} className="detail-row">
                      <td colSpan={8}>
                        <div className="run-detail">
                          {run.errorMessage && (
                            <div className="run-error">
                              <strong>Error:</strong> {run.errorMessage}
                            </div>
                          )}
                          {expandedRun.results && expandedRun.results.length > 0 ? (
                            <table className="results-table">
                              <thead>
                                <tr>
                                  <th>Test</th>
                                  <th>Status</th>
                                  <th>Duration</th>
                                  <th>Error</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expandedRun.results.map((t, i) => (
                                  <tr key={i}>
                                    <td className="test-name">{t.name}</td>
                                    <td>
                                      <span className={`status-badge ${statusBadgeClass(t.status)}`}>
                                        {t.status}
                                      </span>
                                    </td>
                                    <td>{formatDuration(t.duration_ms)}</td>
                                    <td className="error-cell">{t.error || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="no-results">No detailed results available</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default SmokeTestsPage;
