import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/core';
import { encryptTraceBody } from './encryption.js';
import { Trace } from './domain/entities/Trace.js';
import { Tenant } from './domain/entities/Tenant.js';
import { Agent } from './domain/entities/Agent.js';

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
  // RAG fields
  knowledgeBaseId?: string;
  embeddingAgentId?: string;
  ragRetrievalLatencyMs?: number;
  embeddingLatencyMs?: number;
  vectorSearchLatencyMs?: number;
  retrievedChunkCount?: number;
  topChunkSimilarity?: number;
  avgChunkSimilarity?: number;
  contextTokensAdded?: number;
  ragOverheadTokens?: number;
  ragCostOverheadUsd?: number;
  ragStageFailed?: string;
  fallbackToNoRag?: boolean;
}

// ---------------------------------------------------------------------------
// Internal pending trace shape (pre-entity)
// ---------------------------------------------------------------------------

interface PendingTrace {
  input: TraceInput;
  reqCt: string;
  reqIv: string;
  resCt: string | null;
  resIv: string | null;
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
 * Uses MikroORM entity persistence via a forked EntityManager per batch.
 * A write failure is logged and swallowed — it must never crash the gateway.
 */
export class TraceRecorder {
  private batch: PendingTrace[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private em: EntityManager | null = null;

  constructor() {
    this.timer = setInterval(() => { void this.flush(); }, FLUSH_INTERVAL_MS);
    // Prevent the interval from keeping the Node process alive during tests.
    this.timer.unref?.();
  }

  /**
   * Initialize with an EntityManager reference from the ORM.
   * Must be called once at startup before any flush() calls will persist.
   */
  init(em: EntityManager): void {
    this.em = em;
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

      this.batch.push({ input: trace, reqCt, reqIv, resCt, resIv });

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
    if (!this.em) {
      console.error('[tracing] flush() called before init() — traces will be lost');
      this.batch.splice(0);
      return;
    }

    // Swap out the batch atomically so concurrent record() calls aren't lost.
    const pending = this.batch.splice(0);

    try {
      const forkedEm = this.em.fork();

      for (const { input, reqCt, reqIv, resCt, resIv } of pending) {
        const trace = new Trace();
        trace.id = randomUUID();
        trace.tenant = forkedEm.getReference(Tenant, input.tenantId);
        trace.agent = input.agentId ? forkedEm.getReference(Agent, input.agentId) : null;
        trace.requestId = input.requestId ?? randomUUID();
        trace.model = input.model;
        trace.provider = input.provider;
        trace.endpoint = input.endpoint ?? '/v1/chat/completions';
        trace.requestBody = reqCt;
        trace.requestIv = reqIv;
        trace.responseBody = resCt;
        trace.responseIv = resIv;
        trace.latencyMs = input.latencyMs;
        trace.promptTokens = input.promptTokens ?? null;
        trace.completionTokens = input.completionTokens ?? null;
        trace.totalTokens = input.totalTokens ?? null;
        trace.estimatedCostUsd = null;
        trace.encryptionKeyVersion = 1;
        trace.statusCode = input.statusCode ?? null;
        trace.ttfbMs = input.ttfbMs ?? null;
        trace.gatewayOverheadMs = input.gatewayOverheadMs ?? null;
        trace.createdAt = new Date();
        // RAG fields
        trace.knowledgeBaseId = input.knowledgeBaseId ?? null;
        trace.embeddingAgentId = input.embeddingAgentId ?? null;
        trace.ragRetrievalLatencyMs = input.ragRetrievalLatencyMs ?? null;
        trace.embeddingLatencyMs = input.embeddingLatencyMs ?? null;
        trace.vectorSearchLatencyMs = input.vectorSearchLatencyMs ?? null;
        trace.retrievedChunkCount = input.retrievedChunkCount ?? null;
        trace.topChunkSimilarity = input.topChunkSimilarity ?? null;
        trace.avgChunkSimilarity = input.avgChunkSimilarity ?? null;
        trace.contextTokensAdded = input.contextTokensAdded ?? null;
        trace.ragOverheadTokens = input.ragOverheadTokens ?? null;
        trace.ragCostOverheadUsd = input.ragCostOverheadUsd ?? null;
        trace.ragStageFailed = input.ragStageFailed ?? null;
        trace.fallbackToNoRag = input.fallbackToNoRag ?? null;

        forkedEm.persist(trace);
      }

      await forkedEm.flush();
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
