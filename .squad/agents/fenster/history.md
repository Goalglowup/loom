# Fenster's Project Knowledge

## Project Context

**Project:** Loom — AI runtime control plane  
**Owner:** Michael Brown  
**Stack:** Node.js + TypeScript  
**Description:** Provider-agnostic OpenAI-compatible proxy with auditability, structured trace recording, streaming support, multi-tenant architecture, and observability dashboard.

**Backend Scope:**
- OpenAI-compatible `/v1/chat/completions` endpoint
- Full streaming support (SSE)
- Structured trace recording with immutable history
- Token usage and cost estimation
- Latency tracking
- Multi-tenant architecture with tenant isolation
- Database schema for trace storage
- Internal APIs for dashboard

**Performance Target:** Gateway overhead under 20ms

## Core Context — Waves 1–2 Summary

**Wave 1 (F1–F6) Architecture:**
- Fastify + undici + PostgreSQL (partitioned traces table by month)
- Provider abstraction (BaseProvider interface) with OpenAI + Azure OpenAI adapters
- SSE streaming with Transform streams (push early, flush on EOF)
- Tenant auth via SHA-256 API key hashing (LRU cache, <3ms per request)
- AES-256-GCM encryption-at-rest for request/response bodies
- Encryption module (`src/encryption.ts`) with per-tenant key derivation

**Database Schema (Traces):**
- Partitioned by month; columns: id, tenant_id, model, provider, status_code, request/response body (encrypted JSONB), latency_ms, prompt_tokens, completion_tokens, created_at, request_iv, response_iv, encryption_key_version
- 3 composite indexes: (tenant_id, created_at), (tenant_id, model), (created_at)
- Auth via `api_keys` + `tenants` tables; key hash stored (SHA-256)

**Key Learnings:**
- Undici response.body is Node.js Readable (not Web ReadableStream); use async iteration
- Transform streams work natively with Fastify reply.send()
- JSONB scalar strings store ciphertext; no schema migration needed
- batch.splice(0) atomically drains batch before async flush
- Timer.unref() prevents test hangs

---

### 2026-02-24: Wave 3 Implementation (F8, F9, F10)

**F8 — Analytics Engine (`src/analytics.ts`)**
- `getAnalyticsSummary(tenantId, windowHours)` → `{ totalRequests, totalTokens, estimatedCostUSD, avgLatencyMs, p95LatencyMs, errorRate }`
- `getTimeseriesMetrics(tenantId, windowHours, bucketMinutes)` → array of time-bucketed metrics
- Cost computed entirely in SQL via CASE expressions: GPT-3.5 ($0.0000005/$0.0000015 per token), all others default to GPT-4o rates ($0.000005/$0.000015)
- `percentile_cont(0.95) WITHIN GROUP` for p95 latency
- Error rate = `SUM(CASE WHEN status_code >= 400)::float / COUNT(*)`
- Time bucketing via `floor(extract(epoch) / bucketSeconds) * bucketSeconds` → `to_timestamp()`

**F9 — Dashboard API (`src/routes/dashboard.ts`)**
- `GET /v1/traces` — cursor pagination on `created_at`, sorted DESC, limit capped at 200
- `GET /v1/analytics/summary` — delegates to `getAnalyticsSummary()`
- `GET /v1/analytics/timeseries` — delegates to `getTimeseriesMetrics()`
- Routes registered via `fastify.register()` in index.ts; global authMiddleware already applies
- Trace responses exclude encrypted request/response bodies (DB-only per spec)

**F10 — Provider Registry (`src/providers/registry.ts`)**
- `getProviderForTenant(tenantCtx)` — lazily constructs and caches provider per tenantId
- Checks `tenantCtx.providerConfig.provider` for `"azure"` → `AzureProvider`, else `OpenAIProvider`
- Falls back to `OPENAI_API_KEY` env var when no providerConfig set
- `evictProvider(tenantId)` for cache invalidation on config change
- Updated `src/index.ts` to use registry; removed hardcoded `new OpenAIProvider`

**Schema Change**
- Migration `1000000000006_add-trace-status-code.cjs` adds `status_code smallint NULL`
- Updated `src/tracing.ts` BatchRow + INSERT to persist `statusCode` from `TraceInput`

**Status:** ✅ Complete — Issues #5, #6, #7 closed. 61 tests still passing.

## Learnings

- **SQL-side cost calculation preferred over app-layer**: Embedding cost CASE expressions directly in analytics SQL avoids extra round-trips and keeps all aggregation in one query. `ILIKE '%gpt-3.5%' OR ILIKE '%gpt-35%'` covers both OpenAI and Azure model name variants cleanly.
- **Cursor pagination on timestamptz**: Use `created_at < $cursor::timestamptz` with `ORDER BY created_at DESC` for stable pagination. The existing `idx_traces_tenant_created` composite index covers this query pattern efficiently.
- **Module-level Map cache for providers**: A simple `Map<tenantId, BaseProvider>` at module scope is sufficient for Phase 1 provider caching. No TTL needed; `evictProvider()` handles config change invalidation.
- **Register routes as Fastify plugins**: Using `fastify.register()` for dashboard routes keeps `index.ts` clean and makes the route module independently importable for testing.
- **Add schema columns early**: `status_code` was carried in `TraceInput` but never persisted — it's better to add the migration column alongside the interface field to avoid this drift.
- **Seed scripts: check-then-insert, not ON CONFLICT**: `tenants.name` and `api_keys.tenant_id` have no unique constraints, so `ON CONFLICT` clauses don't apply. Use a `SELECT` + conditional `INSERT` pattern instead; for api_keys, `DELETE`+`INSERT` is simplest for "replace the dev key" semantics.
- **ESM seed scripts with dotenv**: Use `import 'dotenv/config'` at the top (not `dotenv.config()`) in ESM TypeScript files run with `tsx` — this is the cleanest pattern and mirrors what the rest of the codebase does.
- **TTFB in streaming via closure flag**: Use a `firstChunkSeen` boolean + `firstChunkMs` in Transform closure scope to capture time-to-first-byte. The `transform()` callback fires synchronously per chunk, so the first invocation reliably marks the moment the first byte is forwarded to the client.
- **gatewayOverheadMs = upstreamStartMs - startTimeMs**: The cleanest way to express pre-LLM overhead is to compute it at flush time as `upstreamStartMs - startTimeMs` rather than subtracting two `Date.now()` calls. This captures all auth, routing, and serialization work that happens before the upstream fetch is initiated.
- **Non-streaming traces need explicit record() calls in index.ts**: The SSE proxy's `flush()` handles streaming traces automatically, but non-streaming JSON responses bypass the Transform entirely. `traceRecorder.record()` must be called explicitly in the non-streaming branch with `ttfbMs: latencyMs` (TTFB equals total latency for non-streaming).
- **INSERT parameter index drift is a silent bug**: Adding columns to `BatchRow` and `TraceInput` without updating the INSERT `$N` indices compiles cleanly but fails at runtime. Always audit the full parameter array and column list together when extending the schema.

## Wave 3 Cross-Agent Learnings

**From Hockney's test suite (H4/H6/H7):**
- Multi-tenant isolation enforced correctly; auth middleware SHA-256 validation tested with 10 test cases covering key isolation and race conditions.
- Streaming + batch flush integration works correctly; fire-and-forget tracing during SSE passthrough validated with 7 tests.
- Encryption-at-rest implementation solid; per-tenant key derivation, unique IVs, and AES-256-GCM modes all tested (7 tests, all passing).
- **Implication:** F7–F10 backend surface area fully validated. Production-ready for Wave 4 integration testing.

**From McManus's dashboard (M2–M5):**
- `/v1/analytics` queries (summary + timeseries) are correctly wired to AnalyticsSummary and TimeseriesCharts components.
- Cursor pagination on `/v1/traces` with ISO timestamp working correctly; IntersectionObserver infinite scroll matches pagination contract.
- API key injection via localStorage + Authorization header works end-to-end; no backend session state needed.
- **Implication:** F8–F10 APIs are production-ready; dashboard provides real-time visibility into gateway traffic and costs.

**Test Coverage Status:** 85 tests (61 existing + 24 new Wave 3), 100% passing. All multi-tenant, streaming, and encryption edge cases covered.

## 2026-02-24T15:12:45Z: Seed Script + Chat Example Setup

**Event:** Built dev seed script and gateway quickstart docs  
**Artifacts:** `scripts/seed.ts`, `examples/chat/GATEWAY_SETUP.md`, `package.json` (seed script)  
**Coordination:** Background spawn; McManus delivered chat UI in same wave

**Key Patterns:**
- `import 'dotenv/config'` (ESM-compatible dotenv loading, consistent with codebase)
- Check-then-insert for idempotent tenant upsert (no unique constraint on `tenants.name`)
- DELETE + INSERT for "replace dev key" semantics
- `tsx scripts/seed.ts` via `npm run seed`

## 2026-02-25T00:21:37Z: Instrumentation Complete — TTFB + Overhead Metrics

**Event:** Completed instrumentation of `ttfb_ms` and `gateway_overhead_ms` throughout streaming and non-streaming paths  
**Artifacts:** `src/tracing.ts`, `src/streaming.ts`, `src/index.ts`, `src/routes/dashboard.ts`

**What was wired:**
- `TraceInput` and `BatchRow` interfaces now include `ttfbMs` and `gatewayOverheadMs` fields
- `src/streaming.ts` Transform captures `firstChunkMs` on first SSE byte; computes metrics in flush()
- `src/index.ts` records `upstreamStartMs` before provider.proxy(); passes to streaming context; non-streaming path records latency metrics
- `src/routes/dashboard.ts` exports both fields in `/v1/traces` cursor and non-cursor variants

**Metrics:**
- `ttfb_ms = firstChunkMs - startTimeMs` (streaming) or `latencyMs` (non-streaming)
- `gateway_overhead_ms = upstreamStartMs - startTimeMs` (pre-LLM gateway work)

**Build Status:** ✅ Passed (npm run build, zero TypeScript errors)

**Note:** No DB schema migration needed; columns already existed in traces table. All INSERT parameter indices kept in sync (16 positional params now).

**Cross-team impact:** McManus can now display latency breakdown in trace views; full observability cycle complete.
