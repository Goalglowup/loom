import { query } from './db.js';

export interface AnalyticsSummary {
  totalRequests: number;
  totalTokens: number;
  estimatedCostUSD: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errorRate: number;
}

export interface TimeseriesBucket {
  bucket: Date;
  requests: number;
  tokens: number;
  costUSD: number;
  avgLatencyMs: number;
}

/**
 * Cost estimation SQL fragment (applied inline to avoid per-row application code).
 *
 * Rates per token (i.e. per-1K-token rate / 1000):
 *   GPT-4o     input $0.000005  output $0.000015
 *   GPT-3.5    input $0.0000005 output $0.0000015
 *   unknown    defaults to GPT-4o rates
 */
const COST_EXPR = `
  COALESCE(prompt_tokens,      0)::numeric * CASE
    WHEN model ILIKE '%gpt-3.5%' OR model ILIKE '%gpt-35%' THEN 0.0000005
    ELSE 0.000005
  END +
  COALESCE(completion_tokens, 0)::numeric * CASE
    WHEN model ILIKE '%gpt-3.5%' OR model ILIKE '%gpt-35%' THEN 0.0000015
    ELSE 0.000015
  END
`;

/**
 * Return a single-row summary of all traces for the given tenant within
 * the specified time window.
 */
export async function getAnalyticsSummary(
  tenantId: string,
  windowHours = 24,
): Promise<AnalyticsSummary> {
  const result = await query(
    `SELECT
       COUNT(*)::int                                                  AS total_requests,
       COALESCE(SUM(total_tokens), 0)::bigint                        AS total_tokens,
       COALESCE(SUM(${COST_EXPR}), 0)::float                        AS estimated_cost_usd,
       COALESCE(AVG(latency_ms), 0)::float                           AS avg_latency_ms,
       COALESCE(
         percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0
       )::float                                                       AS p95_latency_ms,
       COALESCE(
         SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END)::float
           / NULLIF(COUNT(*), 0),
         0
       )::float                                                       AS error_rate
     FROM traces
     WHERE tenant_id = $1
       AND created_at >= NOW() - ($2 || ' hours')::interval`,
    [tenantId, windowHours],
  );

  const row = result.rows[0];
  return {
    totalRequests:    row.total_requests     ?? 0,
    totalTokens:      Number(row.total_tokens ?? 0),
    estimatedCostUSD: row.estimated_cost_usd ?? 0,
    avgLatencyMs:     row.avg_latency_ms     ?? 0,
    p95LatencyMs:     row.p95_latency_ms     ?? 0,
    errorRate:        row.error_rate         ?? 0,
  };
}

/**
 * Admin variant: summary across all tenants (or one if tenantId provided).
 */
export async function getAdminAnalyticsSummary(
  tenantId?: string,
  windowHours = 24,
): Promise<AnalyticsSummary> {
  const params: unknown[] = [windowHours];
  const tenantFilter = tenantId ? `AND tenant_id = $${params.push(tenantId)}` : '';

  const result = await query(
    `SELECT
       COUNT(*)::int                                                  AS total_requests,
       COALESCE(SUM(total_tokens), 0)::bigint                        AS total_tokens,
       COALESCE(SUM(${COST_EXPR}), 0)::float                        AS estimated_cost_usd,
       COALESCE(AVG(latency_ms), 0)::float                           AS avg_latency_ms,
       COALESCE(
         percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0
       )::float                                                       AS p95_latency_ms,
       COALESCE(
         SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END)::float
           / NULLIF(COUNT(*), 0),
         0
       )::float                                                       AS error_rate
     FROM traces
     WHERE created_at >= NOW() - ($1 || ' hours')::interval
     ${tenantFilter}`,
    params,
  );

  const row = result.rows[0];
  return {
    totalRequests:    row.total_requests     ?? 0,
    totalTokens:      Number(row.total_tokens ?? 0),
    estimatedCostUSD: row.estimated_cost_usd ?? 0,
    avgLatencyMs:     row.avg_latency_ms     ?? 0,
    p95LatencyMs:     row.p95_latency_ms     ?? 0,
    errorRate:        row.error_rate         ?? 0,
  };
}

/**
 * Admin variant: time-bucketed metrics across all tenants (or one if tenantId provided).
 */
export async function getAdminTimeseriesMetrics(
  tenantId?: string,
  windowHours = 24,
  bucketMinutes = 60,
): Promise<TimeseriesBucket[]> {
  const params: unknown[] = [windowHours, bucketMinutes];
  const tenantFilter = tenantId ? `AND tenant_id = $${params.push(tenantId)}` : '';

  const result = await query(
    `SELECT
       to_timestamp(
         floor(extract(epoch from created_at) / ($2 * 60)) * ($2 * 60)
       )                                                            AS bucket,
       COUNT(*)::int                                                AS requests,
       COALESCE(SUM(total_tokens), 0)::bigint                      AS tokens,
       COALESCE(SUM(${COST_EXPR}), 0)::float                      AS cost_usd,
       COALESCE(AVG(latency_ms), 0)::float                         AS avg_latency_ms
     FROM traces
     WHERE created_at >= NOW() - ($1 || ' hours')::interval
     ${tenantFilter}
     GROUP BY 1
     ORDER BY 1 ASC`,
    params,
  );

  return result.rows.map((row) => ({
    bucket:       new Date(row.bucket),
    requests:     row.requests,
    tokens:       Number(row.tokens),
    costUSD:      row.cost_usd,
    avgLatencyMs: row.avg_latency_ms,
  }));
}

/**
 * Return time-bucketed metrics for the given tenant.
 * Bucket size is configurable (default 60 minutes).
 */
export async function getTimeseriesMetrics(
  tenantId: string,
  windowHours = 24,
  bucketMinutes = 60,
): Promise<TimeseriesBucket[]> {
  const result = await query(
    `SELECT
       to_timestamp(
         floor(extract(epoch from created_at) / ($3 * 60)) * ($3 * 60)
       )                                                            AS bucket,
       COUNT(*)::int                                                AS requests,
       COALESCE(SUM(total_tokens), 0)::bigint                      AS tokens,
       COALESCE(SUM(${COST_EXPR}), 0)::float                      AS cost_usd,
       COALESCE(AVG(latency_ms), 0)::float                         AS avg_latency_ms
     FROM traces
     WHERE tenant_id = $1
       AND created_at >= NOW() - ($2 || ' hours')::interval
     GROUP BY 1
     ORDER BY 1 ASC`,
    [tenantId, windowHours, bucketMinutes],
  );

  return result.rows.map((row) => ({
    bucket:       new Date(row.bucket),
    requests:     row.requests,
    tokens:       Number(row.tokens),
    costUSD:      row.cost_usd,
    avgLatencyMs: row.avg_latency_ms,
  }));
}
