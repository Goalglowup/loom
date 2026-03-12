/**
 * DashboardService — encapsulates all data access for dashboard routes.
 * Route handlers stay thin: parse HTTP → call DashboardService → return DTO.
 *
 * Migrated getTraces() from raw SQL (Knex) to MikroORM.
 * Analytics delegation stays as-is (legitimately needs raw SQL).
 */
import type { EntityManager } from '@mikro-orm/core';
import { Trace } from '../../domain/entities/Trace.js';
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

  async getTraces(tenantId: string, limit: number, cursor?: string): Promise<TracesResult> {
    const traces = await this.em.find(
      Trace,
      {
        tenant: tenantId,
        ...(cursor ? { createdAt: { $lt: new Date(cursor) } } : {}),
      },
      {
        orderBy: { createdAt: 'DESC' },
        limit,
      },
    );

    const rows: TraceRow[] = traces.map((t) => ({
      id: t.id,
      tenant_id: (t.tenant as any)?.id ?? tenantId,
      model: t.model,
      provider: t.provider,
      status_code: t.statusCode!,
      latency_ms: t.latencyMs!,
      prompt_tokens: t.promptTokens!,
      completion_tokens: t.completionTokens!,
      ttfb_ms: t.ttfbMs,
      gateway_overhead_ms: t.gatewayOverheadMs,
      created_at: t.createdAt,
    }));

    const nextCursor =
      rows.length === limit
        ? rows[rows.length - 1].created_at.toISOString()
        : null;

    return { traces: rows, nextCursor };
  }

  async getAnalyticsSummary(tenantId: string, windowHours: number): Promise<AnalyticsSummary> {
    return getAnalyticsSummary(tenantId, windowHours);
  }

  async getTimeseriesMetrics(tenantId: string, windowHours: number, bucketMinutes: number): Promise<TimeseriesBucket[]> {
    return getTimeseriesMetrics(tenantId, windowHours, bucketMinutes);
  }
}
