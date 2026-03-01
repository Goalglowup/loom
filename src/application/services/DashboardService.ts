/**
 * DashboardService — encapsulates all data access for dashboard routes.
 * Route handlers stay thin: parse HTTP → call DashboardService → return DTO.
 */
import type { EntityManager } from '@mikro-orm/core';
import { getAnalyticsSummary, getTimeseriesMetrics } from '../../analytics.js';
import type { AnalyticsSummary, TimeseriesBucket } from '../../analytics.js';

export interface TraceRow {
  id: string;
  tenant_id: string;
  model: string;
  provider: string;
  status_code: number;
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  ttfb_ms: number | null;
  gateway_overhead_ms: number | null;
  created_at: Date;
}

export interface TracesResult {
  traces: TraceRow[];
  nextCursor: string | null;
}

export class DashboardService {
  constructor(private readonly em: EntityManager) {}

  private async rawQuery<T extends object = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    const knex = (this.em as any).getKnex();
    const result = await knex.raw(sql, params);
    return { rows: result.rows as T[] };
  }

  async getTraces(tenantId: string, limit: number, cursor?: string): Promise<TracesResult> {
    let result: { rows: TraceRow[] };

    if (cursor) {
      result = await this.rawQuery<TraceRow>(
        `SELECT id, tenant_id, model, provider, status_code, latency_ms,
                prompt_tokens, completion_tokens, ttfb_ms, gateway_overhead_ms, created_at
         FROM   traces
         WHERE  tenant_id = $1
           AND  created_at < $2::timestamptz
         ORDER  BY created_at DESC
         LIMIT  $3`,
        [tenantId, cursor, limit],
      );
    } else {
      result = await this.rawQuery<TraceRow>(
        `SELECT id, tenant_id, model, provider, status_code, latency_ms,
                prompt_tokens, completion_tokens, ttfb_ms, gateway_overhead_ms, created_at
         FROM   traces
         WHERE  tenant_id = $1
         ORDER  BY created_at DESC
         LIMIT  $2`,
        [tenantId, limit],
      );
    }

    const traces = result.rows;
    const nextCursor =
      traces.length === limit
        ? (traces[traces.length - 1].created_at as Date).toISOString()
        : null;

    return { traces, nextCursor };
  }

  async getAnalyticsSummary(tenantId: string, windowHours: number): Promise<AnalyticsSummary> {
    return getAnalyticsSummary(tenantId, windowHours);
  }

  async getTimeseriesMetrics(tenantId: string, windowHours: number, bucketMinutes: number): Promise<TimeseriesBucket[]> {
    return getTimeseriesMetrics(tenantId, windowHours, bucketMinutes);
  }
}
