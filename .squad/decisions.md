# Team Decisions

## 2026-02-24T02:33:16.822Z: Tech Stack

**By:** Michael Brown  
**What:** Node.js + TypeScript for Loom implementation  
**Why:** User decision during team setup  
**Impact:** All code will be TypeScript-first

## 2026-02-24T02:33:16.822Z: Phase 1 Scope

**By:** Michael Brown (via PRD)  
**What:** Phase 1 focuses on Gateway (Auditability Foundation) — OpenAI-compatible proxy, streaming support, structured trace recording, token/cost/latency tracking, multi-tenant architecture, minimal observability dashboard  
**Why:** PRD defines phased rollout; Phase 1 establishes audit foundation before governance layer  
**Impact:** Team will defer A/B testing, policy enforcement, memory abstraction, agent orchestration, PII detection, and budget controls to Phase 2+

## 2026-02-24T02:33:16.822Z: Architecture Discussion Required

**By:** Michael Brown  
**What:** Hold architecture conversation before building  
**Why:** User requested architecture discussion before implementation  
**Impact:** Keaton will facilitate design meeting to align on gateway architecture, trace schema, and multi-tenant design before Fenster/McManus start building

## 2026-02-24T02:47:45Z: Architecture Constraints

**By:** Michael Brown (via Copilot)  
**What:** Multi-provider Phase 1 (Azure OpenAI + OpenAI), full body storage enabled, single process topology, 1000 req/sec capacity target  
**Why:** User decisions during architecture discussion — Azure for free testing tokens, auditability requires full bodies, pragmatic Phase 1 scope  
**Impact:** Provider abstraction supports both OpenAI and Azure OpenAI; trace schema stores complete request/response bodies in JSONB; single Fastify process hosts gateway and dashboard; performance validation at 1000 req/sec

## 2026-02-24: Architecture Approved — Loom Phase 1 (Gateway/Auditability Foundation)

**By:** Keaton (Lead), approved by Michael Brown  
**What:** Complete architecture for Phase 1 including Fastify gateway, multi-provider support (OpenAI + Azure OpenAI), SSE streaming with transform stream tee, PostgreSQL with JSONB traces (partitioned by month), API key-based multi-tenant isolation, 3-6ms overhead target, REST dashboard API  
**Why:** Addresses all open questions, validated for 1000 req/sec, balances auditability needs with performance  
**Impact:** Defines work breakdown for Fenster (10 backend items), McManus (5 frontend items), Hockney (7 test items); establishes critical path through F1→F4→F6→F7→H6; locks architecture for Wave 1-4 execution

## 2026-02-24: Provider Abstraction Pattern

**By:** Fenster (Backend)  
**What:** Implemented provider abstraction using BaseProvider abstract class with shared authentication logic and provider-specific proxy implementations using undici HTTP client  
**Why:** Need consistent interface for multiple LLM providers (OpenAI, Azure OpenAI initially, more later)  
**Impact:** Easy to add new providers by extending BaseProvider; consistent error handling; stream and non-stream responses handled uniformly; provider configuration encapsulated

## 2026-02-24: Database Partitioning Strategy

**By:** Fenster (Backend)  
**What:** PostgreSQL native table partitioning for traces table by month on created_at column; 4 initial monthly partitions; indexes inherited automatically  
**Why:** Traces table will grow rapidly (1000 req/sec = ~2.6M req/day); need efficient querying and retention management  
**Impact:** Query performance via partition pruning; retention via dropping old month partitions; faster VACUUM/ANALYZE on smaller partitions; independent archival per month

## 2026-02-24: Database Tests Skip-by-Default Pattern

**By:** Hockney (Tester)  
**What:** Database tests skip by default, require explicit TEST_DB_ENABLED=1 environment variable to run  
**Why:** Improve developer experience — tests work immediately after npm install without PostgreSQL dependency  
**Impact:** Mock server tests (6 tests, 520ms) provide immediate validation; database fixture tests validate schema when PostgreSQL available; CI can enable selectively

## 2026-02-24: Test Framework — Vitest

**By:** Hockney (Tester)  
**What:** Selected Vitest over Jest for test infrastructure  
**Why:** Native ESM support aligns with project's "type": "module"; faster execution; better Node.js compatibility; Vite ecosystem consistency  
**Impact:** All future tests use Vitest; test command is npm test; Fenster and McManus should use Vitest for their test suites

## 2026-02-24: Dashboard Architecture — React + Vite SPA

**By:** McManus (Frontend)  
**What:** Implemented observability dashboard as React 19 + Vite SPA in dashboard/ subdirectory, served by Fastify at /dashboard via @fastify/static plugin  
**Why:** Fast development, modern tooling, TypeScript support; SPA architecture with client-side routing; keeps frontend code isolated  
**Impact:** Build output at dashboard/dist/ served statically; base path /dashboard/ configured; routes for Traces and Analytics; ready for REST API consumption in Wave 3

## 2026-02-24: Security Architecture — Tenant Data Encryption-at-Rest

**By:** Keaton (Lead), approved by Michael Brown  
**What:** Use encryption-at-rest for all tenant data in PostgreSQL (request_body and response_body columns). Application-level AES-256-GCM encryption with per-tenant key derivation. Dashboard analytics lag is acceptable for Phase 1 observability use case.  
**Why:** Protect against unauthorized database console access (insider threat, compromised admin credentials). Phase 1 threat model focuses on DB access boundary; full KMS migration deferred to Phase 2.  
**Impact:** Fenster adds encryption utility module and IV columns to traces migration; Hockney adds encrypted storage validation tests; schema includes encryption_key_version column for Phase 2 key rotation; key management strategy documented for GA compliance planning. Performance impact negligible (<0.01ms per trace encryption). No blockers identified.  
**Alternatives Considered:** PostgreSQL TDE (rejected: all-or-nothing, limited tenant isolation); no encryption + access controls (rejected: fails threat model); selective field encryption (rejected: complex PII detection logic).  
**Risk:** LOW. Standard encryption pattern, negligible performance impact, proven libraries.  
**Deferred to Phase 2:** External KMS integration, key rotation implementation, PII detection layer, ETL pipeline for real-time analytics.

## 2026-02-24: F3 — Tenant Auth Middleware: SHA-256 (not bcrypt)

**By:** Fenster (Backend)  
**What:** API key validation uses SHA-256 for hashing; LRU cache implemented with JavaScript Map (no external library); cache key = SHA-256 hash of raw API key; tenant provider_config nullable JSONB  
**Why:** bcrypt is intentionally slow (incompatible with 20ms overhead budget). SHA-256 sufficient for opaque random tokens; brute-force resistance from entropy. Map maintains insertion order for LRU eviction. Avoids storing raw keys in memory. Nullable config allows gradual rollout without backfill.  
**Impact:** Fast key validation in hot path; zero new dependencies; DB lookup and cache use same hash function; tenants without provider config can use global env defaults

## 2026-02-24: F5 — Azure OpenAI Adapter: api-key header strategy

**By:** Fenster (Backend)  
**What:** Azure authentication uses `api-key: <key>` header (not Authorization Bearer); error mapping at adapter boundary; only `x-request-id` forwarded as pass-through header  
**Why:** Azure OpenAI requires `api-key` per Microsoft docs; Bearer returns 401. Consistent error shape simplifies gateway. Forward only safe headers to avoid leaking internal metadata.  
**Impact:** Callers see unified error responses; Azure-specific quirks encapsulated; upstream header leakage prevented

## 2026-02-24: F6 — SSE Streaming Proxy: Transform stream design

**By:** Fenster (Backend)  
**What:** Push data before parse to minimize latency; onComplete in flush() not on [DONE] sentinel; Node.js Transform stream (not Web TransformStream)  
**Why:** Early push ensures client receives bytes immediately. flush() fires on upstream EOF regardless of [DONE] presence (robust to provider quirks). Node.js Transform avoids type adaptation overhead with undici Readable.  
**Impact:** Low-latency streaming; robust to provider edge cases; native Fastify integration

## 2026-02-24: H2 — Proxy Tests: Direct provider testing

**By:** Hockney (Tester)  
**What:** Test OpenAIProvider.proxy() directly instead of full gateway; gateway integration tests deferred until Fenster adds OPENAI_BASE_URL support  
**Why:** Fastify gateway cannot redirect to mock server without env var support from backend. Provider class IS the proxy mechanism.  
**Impact:** Proxy correctness validation complete (12 tests); gateway integration tests follow as F6+ follow-up

## 2026-02-24: H3 — Auth Tests: Inline reference implementation

**By:** Hockney (Tester)  
**What:** Implement reference Fastify gateway in tests/auth.test.ts mirroring expected auth contract; import swapped to src/auth.ts when Fenster ships  
**Why:** Contract well-understood (Bearer token, x-api-key, LRU, 401 on invalid). Tests document interface; immediate value; all assertions must pass once real module ships.  
**Impact:** Auth contract validated; 16 tests passing; zero flaky imports; seamless upgrade path to Fenster's F3

## 2026-02-24: H5 — Multi-Provider Streaming: Async iteration pattern

**By:** Hockney (Tester)  
**What:** All streaming test helpers use `for await...of` (async iteration protocol), not Web ReadableStream API  
**Why:** undici response.body is Node.js Readable; .getReader() fails on Node 25+. Async iteration works for Node Readable, Web ReadableStream, any async iterable.  
**Impact:** Canonical streaming test pattern for codebase; 33 multi-provider streaming tests passing; future proof

## 2026-02-24: Wave 2 Test Infrastructure — Port range 3011–3040

**By:** Hockney (Tester)  
**What:** Wave 2 test mock servers use ports 3011–3040 (existing mocks at 3001–3002); future waves continue upward (3041+)  
**Why:** Avoid port conflicts in parallel test runs  
**Impact:** 61 tests can run in parallel; scalable port allocation for future waves

## 2026-02-24: F7 — Trace Recording & Persistence

**By:** Fenster (Backend)  
**Issue:** #4  
**Decisions:**
1. **JSONB Column Storage** — Encrypted ciphertext (hex) stored as PostgreSQL JSONB scalar string via `to_jsonb($1::text)`. Avoids breaking ALTER TABLE while keeping schema consistent. Decryption: read JSONB string → JSON.parse → decrypt hex.
2. **IV Columns** — `request_iv varchar(24)` and `response_iv varchar(24)` added via migration 1000000000005. Nullable for backward compatibility; all new inserts populate both.
3. **Migration Numbering** — Used 1000000000005 (sequential after 1000000000004, which was taken by `add-tenant-provider-config.cjs`).
4. **Batch Flushing** — `this.batch.splice(0)` atomically drains batch before async DB writes. Any `record()` calls during flush land in fresh array, caught by next flush (prevents data loss).
5. **Timer Management** — 5-second setInterval is `unref()`'d to prevent test hangs (process can exit cleanly during vitest runs).
6. **Streaming Integration** — `traceContext` passed as optional field on `StreamProxyOptions` rather than re-architecting provider layer. `index.ts` populates when `request.tenant` available.

**Impact:** Encryption-at-rest foundation complete; streaming traces captured without provider awareness; batch atomicity prevents data loss.

## 2026-02-24: F8 — Analytics Engine Cost Calculation Strategy

**By:** Fenster (Backend)  
**Issue:** #5  
**Decision:** Inline SQL CASE expressions for cost estimation rather than application-layer model map.

**What:** Cost rates embedded as SQL CASE expressions using `ILIKE '%gpt-3.5%' OR ILIKE '%gpt-35%'` pattern matching, defaulting to GPT-4o rates for all other models.

**Why:** Single DB round trip computes all analytics in one query. No need to pull raw token rows into application memory. Supports new models automatically (falls back to GPT-4o rates). ILIKE covers both OpenAI (`gpt-3.5-turbo`) and Azure (`gpt-35-turbo`) model name variants.

**Rates (per token):**
- GPT-4o input: $0.000005, output: $0.000015
- GPT-3.5 input: $0.0000005, output: $0.0000015

**Impact:** All analytics queries complete in a single SQL call. Cost estimation available on any model without code changes; unknown models default to GPT-4o rates (conservative estimate).

## 2026-02-24: F9 — Dashboard API: Cursor Pagination

**By:** Fenster (Backend)  
**Issue:** #6  
**Decision:** Cursor pagination uses `created_at` ISO timestamp as the cursor value.

**What:** `GET /v1/traces?cursor={ISO_timestamp}` filters `created_at < cursor` ordered by `created_at DESC`. `nextCursor` is `null` when fewer than `limit` rows are returned.

**Why:** Offset pagination breaks under concurrent inserts (rows shift). Timestamp cursor is stable, human-readable, and maps directly to the existing `idx_traces_tenant_created` composite index. Limit capped at 200 rows per page to avoid unbounded queries.

**Impact:** Efficient paginated listing; no offset calculation; consistent results under write load.

## 2026-02-24: F9 — Dashboard Routes Registered via Plugin

**By:** Fenster (Backend)  
**Issue:** #6  
**Decision:** Dashboard routes registered via `fastify.register(registerDashboardRoutes)` — not inline in index.ts.

**Why:** Keeps index.ts focused on server bootstrap. Routes encapsulated in `src/routes/dashboard.ts` are independently testable. Auth middleware already applied globally via `addHook('preHandler')` — no extra auth wiring needed per route.

**Impact:** Clean separation of concerns; dashboard routes independently testable; global auth inheritance.

## 2026-02-24: F10 — Provider Registry: Per-Tenant Lazy Cache

**By:** Fenster (Backend)  
**Issue:** #7  
**Decision:** Module-level `Map<tenantId, BaseProvider>` for instance caching. No TTL; `evictProvider()` exposed for manual invalidation.

**What:** `getProviderForTenant(tenantCtx)` checks the module-level cache before constructing a new provider. Azure provider uses `tenantCtx.providerConfig.baseUrl` as the Azure endpoint and `deployment`/`apiVersion` from the same config.

**Why:** Provider construction is cheap but avoids object churn on every request. No TTL needed in Phase 1 — provider config changes are rare. `evictProvider()` provides an escape hatch when config changes without server restart.

**Impact:** Provider selection is O(1) on the hot path. Falls back to OpenAI + `OPENAI_API_KEY` env var when no `providerConfig` is set (backwards-compatible with existing deployments).

## 2026-02-24: Schema Addition: `status_code` column on `traces`

**By:** Fenster (Backend)  
**Issue:** #7  
**Decision:** Added `status_code smallint NULL` via migration `1000000000006`.

**Why:** F9 trace listing spec requires `status_code` in responses. `TraceInput` already carried an optional `statusCode` field but it was not persisted. Migration adds the column; `tracing.ts` INSERT updated to include it.

**Impact:** HTTP status codes tracked per trace; analytics dashboard can filter/display by response status; migration maintains backward compatibility (nullable column).

## 2026-02-24: H4 — Multi-Tenant Isolation Tests

**By:** Hockney (Tester)  
**Issue:** #14  
**Decisions:**
1. **fastify.inject() for Auth Tests** — Use Fastify's built-in `inject()` method for testing `registerAuthMiddleware` instead of binding to a real port. Avoids port allocation and bind-race conditions; tests are synchronous and isolated; no network stack overhead.
2. **Mocked pg.Pool** — Pass a `{ query: vi.fn() }` object as the `pg.Pool` argument to `registerAuthMiddleware`. No real PostgreSQL required; mock returns tenant fixtures keyed by SHA-256 hash of API key.
3. **Inactive Tenant Behavior (Deferred)** — Current behavior for deleted/inactive tenants is 401 (DB returns 0 rows, middleware has no 403 path). Future work: add `tenants.active` column, filter in query, return 403 for inactive tenants.

**Impact:** Auth and multi-tenant tests run in-process without any port conflicts; consistent with Wave 3 additions; test documents current behavior with TODO for Phase 2.

## 2026-02-24: H6 — Streaming + Trace Recording Tests

**By:** Hockney (Tester)  
**Issue:** #16  
**Decisions:**
1. **vi.mock + importOriginal Pattern** — Mock `src/tracing.js` using `importOriginal` — preserves the real `TraceRecorder` class while replacing the exported `traceRecorder` singleton with a spy object. SSE proxy tests need to spy on `traceRecorder.record()` (the singleton); batch/timer tests need the real class instantiated fresh per test.
2. **Single Mock for Dual Purpose** — Real class gets real encryption + real db.js mock for flush tests; single mock declaration serves all test suites.

**Impact:** Streaming integrity validated; batch flush timing confirmed; fire-and-forget trace recording during streaming verified; tests are maintainable and independent.

## 2026-02-24: H7 — Encryption-at-Rest Tests

**By:** Hockney (Tester)  
**Issue:** #17  
**Decisions:**
1. **INSERT Parameter Index Constants** — Document the positional SQL parameter indices (`IDX` object) at the top of `encryption-at-rest.test.ts`. TraceRecorder's INSERT uses 13 positional params; magic numbers in assertions are unmaintainable. If Fenster reorders INSERT params, tests fail loudly at the index documentation layer, not silently.

**Impact:** Per-tenant key derivation validated; unique IVs per trace confirmed; AES-256-GCM success and failure modes thoroughly tested.

## 2026-02-24: H4/H6/H7 — Wave 3 Test Infrastructure Port Allocation

**By:** Hockney (Tester)  
**Issues:** #14, #16, #17  
**Decision:** Wave 3 tests (H4, H6, H7) use `fastify.inject()` exclusively — no ports allocated.

**Why:** All three test suites test in-process behavior; no mock HTTP servers needed.

**Impact:** No port conflicts; Wave 3 port range (3041+) remains available for future integration test suites; 85 tests passing with 100% pass rate.

## 2026-02-24: M2 — Traces Table: Infinite Scroll & Client-Side Filtering

**By:** McManus (Frontend)  
**Issue:** #8  
**Decisions:**
1. **IntersectionObserver Pagination** — Infinite scroll uses an `IntersectionObserver` on a sentinel `<div>` below the table with `rootMargin: 200px`. When the sentinel enters the viewport, the next page is fetched using `nextCursor` from the last API response.
2. **Client-Side Filtering** — Model and status filters in TracesTable operate on the client-side set of loaded traces (up to 50 per page). The `/v1/traces` API does not expose filter query params. Acceptable for Phase 1 volume — revisit if server-side filtering is needed at scale.

**Impact:** Seamless infinite scroll UX; client-side filters enable rapid iteration; deferred server-side filtering to Phase 2 when volume demands optimization.

## 2026-02-24: M3 — Trace Details: Encrypted Body Placeholder

**By:** McManus (Frontend)  
**Issue:** #9  
**Decision:** Request and response bodies are displayed as "🔒 Encrypted (stored securely)" per the security architecture decision (AES-256-GCM encryption at rest). Bodies are not returned by the dashboard API.

**Why:** Aligns with encryption-at-rest design; prevents accidental plaintext leakage through dashboard; phase 1 focuses on auditability metadata (tokens, latency, cost) rather than request/response inspection.

**Impact:** Users see explicit security indicator; no accidental exposure of encrypted data through UI; database remains the trust boundary.

## 2026-02-24: M4 — Analytics Summary: Time Window State Management

**By:** McManus (Frontend)  
**Issue:** #10  
**Decision:** The time window selector (1h/6h/24h/7d) lives in `AnalyticsPage` and is passed as a prop to both `AnalyticsSummary` and `TimeseriesCharts`. This keeps both components in sync without extra state management overhead.

**Impact:** Single source of truth for time window; both summary cards and charts reflect selected window; no state synchronization bugs.

## 2026-02-24: M5 — Timeseries Charts: recharts AreaChart with Auto-Bucketing

**By:** McManus (Frontend)  
**Issue:** #11  
**Decisions:**
1. **recharts AreaChart** — Used `recharts` (added to `dashboard/package.json`) with `AreaChart` + `ResponsiveContainer` for both charts. Responsive by default.
2. **Time-Aware Bucketing** — Bucket size derived from selected time window: 1h→5min, 6h→30min, 24h→60min, 7d→360min. Ensures chart readability across all time scales.

**Impact:** Production-ready timeseries visualization; responsive design works on all devices; automatic bucketing prevents over-plotting at different scales.

## 2026-02-24: M2–M5 — Frontend API Integration: localStorage API Key

**By:** McManus (Frontend)  
**Issues:** #8–#11  
**Decision:** API key stored in `localStorage` under key `loom_api_key`. Prompted via modal overlay on first visit (or if key is missing). Simple and sufficient for Phase 1; no server-side session needed.

**Why:** Eliminates multi-step auth flow; API key naturally scoped to browser origin; localStorage persists across sessions without server state.

**Impact:** Users provide API key once per device/browser; dashboard automatically includes key in Authorization header for all API requests; no session backend required for Phase 1.

## 2026-02-24: M3 — Trace Details: Estimated Cost Calculation (Rough)

**By:** McManus (Frontend)  
**Issue:** #9  
**Decision:** TraceDetails shows estimated cost using: `(promptTokens * 0.01 + completionTokens * 0.03) / 1000`. This is GPT-4-class pricing approximation. The actual cost is not returned by `/v1/traces`. Should be replaced with real cost data when the API adds it.

**Why:** Provides visibility into cost implications during Phase 1; approximation acceptable when actual costs not available.

**Impact:** Users see cost estimates in trace details; Phase 2 API enhancement will replace with real cost from backend analytics engine.

## 2026-02-25: F — Instrumentation: TTFB + Gateway Overhead Metrics

**By:** Fenster (Backend)  
**Date:** 2026-02-25  
**Status:** Implemented

**What:** Wired `ttfb_ms` and `gateway_overhead_ms` columns (pre-existing in DB schema) into the full request lifecycle — from capture through trace recording to dashboard API response.

**Metrics Defined:**
- `ttfb_ms` — Elapsed ms from gateway start to first SSE byte (for non-streaming: equals latency_ms)
- `gateway_overhead_ms` — Pre-LLM gateway work time (auth, routing, parsing, provider selection)

**Changes Made:**
- `src/tracing.ts` — Added `ttfbMs` and `gatewayOverheadMs` to `TraceInput` and `BatchRow` interfaces; updated INSERT to 16 positional params
- `src/streaming.ts` — Captures `firstChunkMs` on first SSE byte; computes `ttfbMs` (firstChunk - start) and `gatewayOverheadMs` (upstreamStart - start) in flush()
- `src/index.ts` — Records `upstreamStartMs` immediately before provider.proxy(); passes to streaming context; added non-streaming trace recording with latency metrics
- `src/routes/dashboard.ts` — Added both fields to cursor and non-cursor trace listing SELECT queries

**Why:** Phase 1 latency observability requires visibility into both time-to-first-token and gateway processing overhead. No schema migration needed — columns already existed.

**Impact:** Backend trace system now emits complete latency breakdown; dashboard API returns both metrics per trace; frontend can display granular latency insights.

## 2026-02-25: M — Dashboard Display: TTFB + Overhead Visibility

**By:** McManus (Frontend)  
**Date:** 2026-02-25  
**Status:** Implemented

**What:** Surfaced `ttfb_ms` and `gateway_overhead_ms` in TracesTable and TraceDetails views.

**Changes Made:**
- `dashboard/src/components/TracesTable.tsx` — Updated `Trace` interface; added "Overhead" and "TTFB" columns after Latency, before Tokens (null-safe rendering)
- `dashboard/src/components/TraceDetails.tsx` — Added `<dt>`/`<dd>` pairs for both metrics with inline italic hints
- `dashboard/src/components/TraceDetails.css` — Added `.field-hint` style for inline label explanations

**Column Format:** `Xms` or `—` if null (backward compatible with older traces)

**Why:** Users need latency breakdown to diagnose performance bottlenecks. Inline hints improve accessibility over hover-only tooltips.

**Impact:** Latency observability complete end-to-end; users can distinguish gateway overhead from LLM response time; Phase 1 observability goals achieved.
