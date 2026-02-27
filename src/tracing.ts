import { randomUUID } from 'node:crypto';
import { encryptTraceBody } from './encryption.js';
import { query } from './db.js';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface TraceInput {
  tenantId: string;
  agentId?: string;
  /** Caller-supplied request ID; a UUID is generated if omitted. */
  requestId?: string;
  model: string;
  provider: string;
  endpoint?: string;
  requestBody: unknown;
  responseBody: unknown;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  statusCode?: number;
  /** Elapsed ms from gateway start to first SSE byte forwarded (non-streaming: equals latencyMs). */
  ttfbMs?: number;
  /** Pre/post-LLM overhead in ms (total_latency - llm_latency). */
  gatewayOverheadMs?: number;
}

// ---------------------------------------------------------------------------
// Internal batch row shape
// ---------------------------------------------------------------------------

interface BatchRow {
  tenant_id: string;
  agent_id: string | null;
  request_id: string;
  model: string;
  provider: string;
  endpoint: string;
  request_body_ct: string;   // AES-256-GCM ciphertext hex
  request_iv: string;
  response_body_ct: string | null;
  response_iv: string | null;
  latency_ms: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  status_code: number | null;
  ttfb_ms: number | null;
  gateway_overhead_ms: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 5_000;

// ---------------------------------------------------------------------------
// TraceRecorder
// ---------------------------------------------------------------------------

/**
 * Collects traces from the request path (fire-and-forget) and flushes them
 * to PostgreSQL in batches of up to 100 rows, or every 5 seconds.
 *
 * A write failure is logged and swallowed — it must never crash the gateway.
 */
export class TraceRecorder {
  private batch: BatchRow[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.timer = setInterval(() => { void this.flush(); }, FLUSH_INTERVAL_MS);
    // Prevent the interval from keeping the Node process alive during tests.
    this.timer.unref?.();
  }

  /**
   * Enqueue a completed trace for asynchronous persistence.
   * Never throws — all errors are caught internally.
   */
  record(trace: TraceInput): void {
    try {
      const reqBodyJson = JSON.stringify(trace.requestBody);
      const { ciphertext: reqCt, iv: reqIv } = encryptTraceBody(trace.tenantId, reqBodyJson);

      let resCt: string | null = null;
      let resIv: string | null = null;
      if (trace.responseBody != null) {
        const enc = encryptTraceBody(trace.tenantId, JSON.stringify(trace.responseBody));
        resCt = enc.ciphertext;
        resIv = enc.iv;
      }

      this.batch.push({
        tenant_id: trace.tenantId,
        agent_id: trace.agentId ?? null,
        request_id: trace.requestId ?? randomUUID(),
        model: trace.model,
        provider: trace.provider,
        endpoint: trace.endpoint ?? '/v1/chat/completions',
        request_body_ct: reqCt,
        request_iv: reqIv,
        response_body_ct: resCt,
        response_iv: resIv,
        latency_ms: trace.latencyMs,
        prompt_tokens: trace.promptTokens ?? null,
        completion_tokens: trace.completionTokens ?? null,
        total_tokens: trace.totalTokens ?? null,
        status_code: trace.statusCode ?? null,
        ttfb_ms: trace.ttfbMs ?? null,
        gateway_overhead_ms: trace.gatewayOverheadMs ?? null,
      });

      if (this.batch.length >= BATCH_SIZE) {
        void this.flush();
      }
    } catch (err) {
      console.error('[tracing] record() failed (encryption/serialization):', err);
    }
  }

  /**
   * Drain the current batch to the database.
   * Called automatically by the interval timer and by record() when the batch
   * is full.  Safe to call directly (e.g. in tests or on shutdown).
   */
  async flush(): Promise<void> {
    if (this.batch.length === 0) return;

    // Swap out the batch atomically so concurrent record() calls aren't lost.
    const rows = this.batch.splice(0);

    try {
      for (const row of rows) {
        await query(
          `INSERT INTO traces
             (tenant_id, agent_id, request_id, model, provider, endpoint,
              request_body, request_iv,
              response_body, response_iv,
              latency_ms, prompt_tokens, completion_tokens, total_tokens,
              status_code, ttfb_ms, gateway_overhead_ms, encryption_key_version)
           VALUES
             ($1,$2,$3,$4,$5,$6,
              to_jsonb($7::text),$8,
              to_jsonb($9::text),$10,
              $11,$12,$13,$14,
              $15,$16,$17,1)`,
          [
            row.tenant_id, row.agent_id, row.request_id, row.model, row.provider, row.endpoint,
            row.request_body_ct, row.request_iv,
            row.response_body_ct, row.response_iv,
            row.latency_ms, row.prompt_tokens, row.completion_tokens, row.total_tokens,
            row.status_code, row.ttfb_ms, row.gateway_overhead_ms,
          ],
        );
      }
    } catch (err) {
      console.error('[tracing] flush() DB write failed:', err);
    }
  }

  /** Stop the background flush timer (useful for clean test teardown). */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

/** Gateway-wide singleton — import and call .record() from any module. */
export const traceRecorder = new TraceRecorder();
