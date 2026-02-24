import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db.js';
import { getAnalyticsSummary, getTimeseriesMetrics } from '../analytics.js';

/**
 * Register dashboard REST endpoints on the given Fastify instance.
 * All routes rely on the global authMiddleware (registered in src/index.ts)
 * to populate request.tenant before these handlers run.
 */
export async function registerDashboardRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /v1/traces?limit=50&cursor={created_at_ISO}
   *
   * Returns paginated traces for the authenticated tenant, sorted by
   * created_at DESC.  Cursor is the created_at timestamp of the last item
   * returned in the previous page.
   *
   * Response: { traces: [...], nextCursor: string | null }
   * Trace fields: id, tenant_id, model, provider, status_code, latency_ms,
   *               prompt_tokens, completion_tokens, created_at
   * NOTE: encrypted request/response bodies are intentionally excluded.
   */
  fastify.get('/v1/traces', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenant = request.tenant!;
    const qs = request.query as Record<string, string>;
    const limit = Math.min(parseInt(qs.limit ?? '50', 10), 200);
    const cursor = qs.cursor;

    let result;
    if (cursor) {
      result = await query(
        `SELECT id, tenant_id, model, provider, status_code, latency_ms,
                prompt_tokens, completion_tokens, created_at
         FROM   traces
         WHERE  tenant_id = $1
           AND  created_at < $2::timestamptz
         ORDER  BY created_at DESC
         LIMIT  $3`,
        [tenant.tenantId, cursor, limit],
      );
    } else {
      result = await query(
        `SELECT id, tenant_id, model, provider, status_code, latency_ms,
                prompt_tokens, completion_tokens, created_at
         FROM   traces
         WHERE  tenant_id = $1
         ORDER  BY created_at DESC
         LIMIT  $2`,
        [tenant.tenantId, limit],
      );
    }

    const traces = result.rows;
    const nextCursor =
      traces.length === limit
        ? (traces[traces.length - 1].created_at as Date).toISOString()
        : null;

    return reply.send({ traces, nextCursor });
  });

  /**
   * GET /v1/analytics/summary?window=24
   * Returns aggregated metrics for the tenant over the given hour window.
   */
  fastify.get('/v1/analytics/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenant = request.tenant!;
    const qs = request.query as Record<string, string>;
    const windowHours = parseInt(qs.window ?? '24', 10);

    const summary = await getAnalyticsSummary(tenant.tenantId, windowHours);
    return reply.send(summary);
  });

  /**
   * GET /v1/analytics/timeseries?window=24&bucket=60
   * Returns time-bucketed metrics for the tenant.
   */
  fastify.get('/v1/analytics/timeseries', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenant = request.tenant!;
    const qs = request.query as Record<string, string>;
    const windowHours  = parseInt(qs.window ?? '24', 10);
    const bucketMinutes = parseInt(qs.bucket ?? '60', 10);

    const timeseries = await getTimeseriesMetrics(tenant.tenantId, windowHours, bucketMinutes);
    return reply.send(timeseries);
  });
}
