import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE, authHeaders } from '../utils/api';
import { ADMIN_BASE, adminAuthHeaders, type AdminTenant } from '../utils/adminApi';
import './TracesTable.css';

export interface Trace {
  id: string;
  tenant_id: string;
  model: string;
  provider: string;
  status_code: number | null;
  latency_ms: number;
  gateway_overhead_ms?: number | null;
  ttfb_ms?: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: string;
}

interface TracesTableProps {
  onRowClick: (trace: Trace) => void;
  adminMode?: boolean;
  tenantId?: string;
  tenants?: AdminTenant[];
}

export function statusClass(code: number | null): string {
  if (code == null) return '';
  if (code >= 200 && code < 300) return 'status-2xx';
  if (code >= 400 && code < 500) return 'status-4xx';
  if (code >= 500) return 'status-5xx';
  return '';
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const SKELETON_COUNT = 8;

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="skeleton-row" aria-hidden="true">
      {Array.from({ length: cols }, (_, i) => (
        <td key={i}>
          <span className="skeleton-cell" />
        </td>
      ))}
    </tr>
  );
}

function TracesTable({ onRowClick, adminMode, tenantId, tenants }: TracesTableProps) {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | '2xx' | '4xx' | '5xx'>('all');
  const sentinelRef = useRef<HTMLDivElement>(null);

  const tenantMap = Object.fromEntries((tenants ?? []).map(t => [t.id, t.name]));

  const fetchTraces = useCallback(async (cursor?: string) => {
    const isInitial = !cursor;
    if (isInitial) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (cursor) params.set('cursor', cursor);
      if (adminMode && tenantId) params.set('tenant_id', tenantId);
      const base = adminMode ? ADMIN_BASE : API_BASE;
      const path = adminMode ? '/v1/admin/traces' : '/v1/traces';
      const headers = adminMode ? adminAuthHeaders() : authHeaders();
      const res = await fetch(`${base}${path}?${params}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { traces: Trace[]; nextCursor: string | null };
      setTraces(prev => (isInitial ? data.traces : [...prev, ...data.traces]));
      setNextCursor(data.nextCursor);
    } catch (err) {
      console.error('Failed to fetch traces:', err);
    } finally {
      if (isInitial) setLoading(false);
      else setLoadingMore(false);
    }
  }, [adminMode, tenantId]);

  useEffect(() => {
    fetchTraces();
  }, [fetchTraces]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current || !nextCursor || loadingMore) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && nextCursor && !loadingMore) {
          fetchTraces(nextCursor);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [nextCursor, loadingMore, fetchTraces]);

  const allModels = Array.from(new Set(traces.map(t => t.model))).sort();

  const filtered = traces.filter(t => {
    if (modelFilter !== 'all' && t.model !== modelFilter) return false;
    const code = t.status_code ?? 0;
    if (statusFilter === '2xx' && !(code >= 200 && code < 300)) return false;
    if (statusFilter === '4xx' && !(code >= 400 && code < 500)) return false;
    if (statusFilter === '5xx' && !(code >= 500)) return false;
    return true;
  });

  return (
    <div className="traces-table-wrapper">
      <div className="filter-bar" role="search" aria-label="Filter traces">
        <label htmlFor="model-filter" className="filter-label">
          Model
        </label>
        <select
          id="model-filter"
          className="filter-select"
          value={modelFilter}
          onChange={e => setModelFilter(e.target.value)}
        >
          <option value="all">All models</option>
          {allModels.map(m => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <span className="filter-sep" aria-hidden="true" />

        <span className="filter-label">Status</span>
        <div className="status-filter-group" role="group" aria-label="Status filter">
          {(['all', '2xx', '4xx', '5xx'] as const).map(s => (
            <button
              key={s}
              className={`status-filter-btn ${statusFilter === s ? 'active' : ''} ${s !== 'all' ? `sfb-${s}` : ''}`}
              onClick={() => setStatusFilter(s)}
              aria-pressed={statusFilter === s}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      <div className="traces-table-container">
        <table className="traces-table">
          <thead>
            <tr>
              <th>Time</th>
              {adminMode && <th>Tenant</th>}
              <th>Model</th>
              <th>Provider</th>
              <th>Status</th>
              <th className="align-right">Latency (ms)</th>
              <th className="align-right">Overhead</th>
              <th className="align-right">TTFB</th>
              <th className="align-right">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: SKELETON_COUNT }, (_, i) => <SkeletonRow key={i} cols={adminMode ? 9 : 8} />)
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={adminMode ? 9 : 8} className="empty-state">
                  No traces yet. Make your first API call.
                </td>
              </tr>
            ) : (
              filtered.map(trace => (
                <tr
                  key={trace.id}
                  className="trace-row"
                  onClick={() => onRowClick(trace)}
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && onRowClick(trace)}
                  role="button"
                  aria-label={`Open trace ${trace.id}`}
                >
                  <td className="timestamp">{formatTime(trace.created_at)}</td>
                  {adminMode && (
                    <td className="tenant">{tenantMap[trace.tenant_id] ?? trace.tenant_id}</td>
                  )}
                  <td className="model">{trace.model}</td>
                  <td className="provider">{trace.provider}</td>
                  <td>
                    <span className={`status-badge ${statusClass(trace.status_code)}`}>
                      {trace.status_code}
                    </span>
                  </td>
                  <td className="align-right">{trace.latency_ms.toLocaleString()}</td>
                  <td className="align-right">
                    {trace.gateway_overhead_ms != null ? `${trace.gateway_overhead_ms.toLocaleString()}ms` : '—'}
                  </td>
                  <td className="align-right">
                    {trace.ttfb_ms != null ? `${trace.ttfb_ms.toLocaleString()}ms` : '—'}
                  </td>
                  <td className="align-right">
                    {((trace.prompt_tokens ?? 0) + (trace.completion_tokens ?? 0)).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
            {loadingMore && Array.from({ length: 3 }, (_, i) => <SkeletonRow key={`more-${i}`} cols={adminMode ? 9 : 8} />)}
          </tbody>
        </table>
      </div>
      <div ref={sentinelRef} className="scroll-sentinel" aria-hidden="true" />
    </div>
  );
}

export default TracesTable;
