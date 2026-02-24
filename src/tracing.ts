import { randomUUID } from 'node:crypto';
import { encryptTraceBody } from './encryption.js';
import { query } from './db.js';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface TraceInput {
  tenantId: string;
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
}

// ---------------------------------------------------------------------------
// Internal batch row shape
// ---------------------------------------------------------------------------

interface BatchRow {
  tenant_id: string;
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
      });

      if (this.batch.length >= BATCH_SIZE) {
        void this.flush();
      }
    } catch {
      // Trace errors must never crash the gateway.
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
             (tenant_id, request_id, model, provider, endpoint,
              request_body, request_iv,
              response_body, response_iv,
              latency_ms, prompt_tokens, completion_tokens, total_tokens,
              status_code, encryption_key_version)
           VALUES
             ($1,$2,$3,$4,$5,
              to_jsonb($6::text),$7,
              to_jsonb($8::text),$9,
              $10,$11,$12,$13,
              $14,1)`,
          [
            row.tenant_id, row.request_id, row.model, row.provider, row.endpoint,
            row.request_body_ct, row.request_iv,
            row.response_body_ct, row.response_iv,
            row.latency_ms, row.prompt_tokens, row.completion_tokens, row.total_tokens,
            row.status_code,
          ],
        );
      }
    } catch {
      // DB write failure is swallowed — gateway stability takes priority.
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
