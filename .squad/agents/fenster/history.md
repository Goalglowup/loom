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

## 2026-02-25T01:05:00Z: Startup Warning — Missing ENCRYPTION_MASTER_KEY

**Event:** Added boot-time warning for missing `ENCRYPTION_MASTER_KEY` environment variable  
**Artifact:** `src/index.ts` (startup check after dotenv import)

**What was added:**
- Check for `process.env.ENCRYPTION_MASTER_KEY` immediately after `import 'dotenv/config'`
- `console.warn()` to stderr with loud emoji prefix: `⚠️  WARNING: ENCRYPTION_MASTER_KEY is not set...`
- Gateway still starts (non-blocking) — trace recording fails silently downstream in `tracing.ts`, but this catches the misconfiguration early

**Why:**
- Trace recording silently swallows encryption errors (try/catch in `tracing.ts`)
- Without this warning, operators discover missing traces hours/days later (bad UX)
- Boot-time warnings surface configuration issues immediately during startup, not in production after traffic arrives

**Learning:**
- **Fail-fast on config, fail-soft on runtime**: Configuration validation should be loud and early (boot time). Runtime errors in non-critical paths (like trace recording) can be swallowed to avoid cascading failures, but the misconfiguration should never be silent at startup.

## 2026-02-25T02:00:00Z: Multi-Tenant Management Migrations (F-MT1, F-MT2)

**Event:** Implemented first two schema migrations for multi-tenant lifecycle management  
**Artifacts:** `migrations/1000000000007_alter-tenants-add-status.cjs`, `migrations/1000000000008_alter-api-keys-add-management.cjs`

**Migration F-MT1 (1000000000007_alter-tenants-add-status.cjs):**
- Added `status varchar(20) NOT NULL DEFAULT 'active'` to `tenants` table (values: `active`, `inactive`)
- Added `updated_at timestamptz NOT NULL DEFAULT now()` for last modification tracking
- Created `idx_tenants_status` index for filtering queries
- Existing rows backfilled automatically via DEFAULT values

**Migration F-MT2 (1000000000008_alter-api-keys-add-management.cjs):**
- Added `name varchar(255) NOT NULL DEFAULT 'Default Key'` for user-friendly key identification
- Added `key_prefix varchar(20) NOT NULL DEFAULT ''` for display in UI (e.g., "loom_1234...")
- Added `status varchar(20) NOT NULL DEFAULT 'active'` (values: `active`, `revoked`)
- Added `revoked_at timestamptz` (nullable) to track revocation timestamp
- Created `idx_api_keys_status` index for filtering active vs revoked keys
- Existing rows backfilled automatically via DEFAULT values

**Application Code:** None yet — schema-only changes per task requirements. Future work will add tenant status filtering in auth middleware and API key management endpoints.

**Learnings:**
- **node-pg-migrate DEFAULT behavior**: Using `default: 'value'` in `addColumns()` automatically applies the default to existing rows during migration, making backfill seamless for NOT NULL columns
- **Index naming convention**: node-pg-migrate auto-generates index names like `{table}_{column}_index` when using `pgm.createIndex(table, column)`
- **Migration numbering**: Incremented to 1000000000007 and 1000000000008 sequentially after the existing 1000000000006
- **Status column pattern**: Using `varchar(20)` with application-enforced enums (not PostgreSQL ENUMs) provides flexibility for adding new status values without schema migrations

## 2026-02-25T03:00:00Z: Multi-Tenant Auth Foundation (F-MT3, F-MT4a)

**Event:** Implemented admin users table and enhanced auth middleware with revocation/deactivation filters  
**Tasks:** F-MT4a (admin users migration), F-MT3 (auth middleware updates)  
**Artifacts:** `migrations/1000000000009_create-admin-users.cjs`, `src/auth.ts` (updated)

**F-MT4a — Admin Users Migration:**
- Created `admin_users` table with id, username (unique), password_hash, created_at, last_login
- Index on username for login lookups
- Password hashing uses Node.js built-in `crypto.scrypt` (no new dependencies)
  - Salt: 16-byte random hex
  - Derived key: 64-byte scrypt output
  - Stored format: `${salt}:${derivedKey}`
- Migration seeds default admin user from env vars:
  - `ADMIN_USERNAME` (default: `admin`)
  - `ADMIN_PASSWORD` (default: `changeme`)
- `ON CONFLICT (username) DO NOTHING` for idempotent re-runs
- Migration applied successfully via `npm run migrate:up`

**F-MT3 — Auth Middleware Updates:**
- Updated `lookupTenant()` query to filter out revoked keys and inactive tenants:
  - Added `AND ak.status = 'active'` to WHERE clause
  - Added `AND t.status = 'active'` to WHERE clause
- Exported two cache invalidation helpers:
  - `invalidateCachedKey(keyHash: string)`: Invalidate single key by hash (for key revocation)
  - `invalidateAllKeysForTenant(tenantId: string, pool: pg.Pool)`: Query all key hashes for tenant and invalidate each (for tenant deactivation)
- LRU cache method used: `invalidate()` (already existed in the LRUCache class)

**Build Status:** ✅ Clean compile (npm run build, zero TypeScript errors)

**Learnings:**
- **crypto.scrypt for admin passwords**: Using Node's built-in `crypto.scrypt` avoids adding bcrypt dependency. Format `${salt}:${derivedKey}` is simple and secure. Unlike bcrypt's cost parameter, scrypt parameters (N, r, p) are fixed in Node's implementation, which is fine for admin login (not on hot path).
- **Migration-time password seeding**: Reading env vars in migration `exports.up` function works cleanly with node-pg-migrate. The `ON CONFLICT DO NOTHING` ensures idempotent migrations even with seeded data.
- **Auth query enhancement pattern**: Adding status filters to the existing JOIN query is zero-overhead — indexes already exist on both status columns from prior migrations (F-MT1, F-MT2).
- **Cache invalidation by hash**: The invalidation helpers bridge the gap between key_id (used in management APIs) and key_hash (used as cache key). The `invalidateAllKeysForTenant` function queries all hashes first, then invalidates each — necessary because the cache is keyed by hash, not ID.
- **Pool injection for invalidation**: The `invalidateAllKeysForTenant` helper takes `pool` as a parameter rather than importing it — keeps auth.ts decoupled from DB initialization and makes testing easier (same pattern as `registerAuthMiddleware`).

## 2026-02-25T10:20:10Z: Multi-Tenant Wave A Complete — F-MT1, F-MT2, Startup Check

**Event:** Completed migration foundations and startup validation for multi-tenant management  
**Status:** ✅ All tasks completed per spawn manifest

**What was delivered:**

1. **F-MT1 Migration (1000000000007):** ALTER TABLE tenants ADD status, updated_at with indexes
2. **F-MT2 Migration (1000000000008):** ALTER TABLE api_keys ADD name, key_prefix, status, revoked_at with indexes
3. **Startup Env Check:** Boot-time validation warning for missing `ENCRYPTION_MASTER_KEY`

**Key Design Decisions Recorded:**
- **Status columns:** varchar(20) not PostgreSQL ENUMs — allows future expansion without schema locks
- **Revoked_at:** Nullable timestamptz (not boolean flag) — tracks audit timestamp
- **Key prefix:** NOT NULL empty string default — cleaner TypeScript types, simpler UI rendering
- **Backfill:** Via DEFAULT clauses in ALTER TABLE — zero-downtime, automatic
- **Indexes:** idx_tenants_status and idx_api_keys_status for fast filtering

**Startup Warning Pattern:**
- Fail-fast on config (loud warning at boot), fail-soft on runtime (swallow non-critical errors)
- Early warning prevents hours of debugging missing traces
- Extends to other env vars (DATABASE_URL, provider keys) in future

**Next Wave (B):** F-MT3 (auth middleware tightening), F-MT4a/4b (admin users + login), F-MT5/6/7 (CRUD endpoints + encryption)

**Cross-Team Context:** Keaton finalized multi-tenant design document incorporating Michael's Q&A decisions (per-user JWT admin auth, soft+hard delete, provider key encryption). Migrations provide schema foundation; future backend work adds endpoints, frontend work adds admin UI.

## 2026-02-25T10:30:00Z: Admin Auth + Route Scaffold (F-MT4b)

**Event:** Implemented admin JWT authentication and scaffolded all admin routes for tenant management  
**Tasks:** F-MT4b (admin login endpoint + JWT middleware + route stubs)  
**Artifacts:** `src/middleware/adminAuth.ts`, `src/routes/admin.ts`, `src/index.ts`, `src/auth.ts`

**What was delivered:**

1. **JWT Library:** Installed `@fastify/jwt` — integrates cleanly with Fastify request/reply lifecycle
2. **Admin Auth Middleware (`src/middleware/adminAuth.ts`):**
   - `adminAuthMiddleware()` verifies Bearer tokens via Fastify's `request.jwtVerify()`
   - Extracts `{ sub: adminUserId, username }` payload and attaches to `request.adminUser`
   - Returns 401 for missing or invalid tokens
   - Boot-time warning for missing `ADMIN_JWT_SECRET` (similar to `ENCRYPTION_MASTER_KEY`)
3. **Admin Routes (`src/routes/admin.ts`):**
   - `POST /v1/admin/auth/login` — Username/password login endpoint:
     - Queries `admin_users` table by username
     - Verifies password using `crypto.scrypt` (matches migration format `salt:derivedKey`)
     - Issues JWT with 8-hour expiry containing `{ sub, username }`
     - Updates `last_login` timestamp
     - Returns `{ token, username }` on success; 401 on failure
   - **10 route stubs** for tenant CRUD, provider config, and API key management — all return 501 with `adminAuthMiddleware` preHandler (except login)
4. **Integration (`src/index.ts`):**
   - Registered `@fastify/jwt` plugin with `ADMIN_JWT_SECRET` (fallback to dev secret if missing)
   - Registered admin routes via `fastify.register()`
   - Added `ADMIN_JWT_SECRET` startup warning check
5. **Auth Skip List (`src/auth.ts`):**
   - Added `/v1/admin` to tenant API key auth skip list — admin routes use JWT auth, not tenant API keys

**Build Status:** ✅ Clean compile (npm run build, zero TypeScript errors)

**Learnings:**
- **@fastify/jwt integration:** Registering `fastifyJWT` plugin makes `request.jwtVerify()` and `fastify.jwt.sign()` available throughout the app. Much cleaner than manual jsonwebtoken imports.
- **scrypt verification:** Promisified `crypto.scrypt` with `timingSafeEqual` for constant-time comparison matches migration's hash format perfectly. No external bcrypt dependency needed.
- **Route stub pattern:** Registering all routes upfront with 501 responses establishes the API surface immediately — easier for frontend to start integration work even before backend CRUD logic exists.
- **Fastify log.error object pattern:** Use `fastify.log.error({ err }, 'message')` instead of `fastify.log.error('message', err)` for proper pino logging format.
- **JWT payload simplicity:** `{ sub: userId, username }` is sufficient for Phase 1. Future RBAC can extend this with `role` or `permissions` fields without breaking existing tokens (JWT parsers ignore unknown fields).
- **Auth skip list for admin routes:** Tenant API key middleware must skip `/v1/admin` prefix entirely — admin routes are an orthogonal auth domain (per-user JWT vs per-tenant API key).

## 2026-02-25T11:00:00Z: Admin CRUD Implementation Complete (F-MT5, F-MT6, F-MT7)

**Event:** Implemented all 10 admin CRUD route handlers for tenant lifecycle, provider config, and API key management  
**Tasks:** F-MT5 (tenant CRUD), F-MT6 (API key management), F-MT7 (provider config with encryption)  
**Artifacts:** `src/routes/admin.ts` (all 501 stubs replaced), `src/providers/registry.ts` (decryption logic)

**What was delivered:**

1. **F-MT5 — Tenant CRUD (5 endpoints):**
   - `POST /v1/admin/tenants` — Creates tenant, returns 201 with tenant row
   - `GET /v1/admin/tenants` — Lists tenants with pagination (limit/offset), status filter, returns `{ tenants, total }`
   - `GET /v1/admin/tenants/:id` — Returns tenant details with API key count and provider config summary (hasApiKey: boolean, never raw key)
   - `PATCH /v1/admin/tenants/:id` — Updates name or status; on status→inactive, invalidates all tenant keys and evicts provider from cache
   - `DELETE /v1/admin/tenants/:id?confirm=true` — Hard deletes tenant with cascade (requires confirmation query param); invalidates cache and evicts provider before deletion

2. **F-MT6 — API Key Management (3 endpoints):**
   - `POST /v1/admin/tenants/:id/api-keys` — Creates API key with format `loom_sk_{24-byte-base64url}`; stores key_prefix (first 12 chars) and key_hash (SHA-256); returns 201 with raw key shown ONCE
   - `GET /v1/admin/tenants/:id/api-keys` — Lists all keys for tenant (never returns key_hash or raw key), ordered by created_at DESC
   - `DELETE /v1/admin/tenants/:id/api-keys/:keyId` — Default: soft revoke (sets status='revoked', revoked_at=now()); with `?permanent=true`: hard delete; both invalidate cache by key_hash

3. **F-MT7 — Provider Config Encryption (2 endpoints):**
   - `PUT /v1/admin/tenants/:id/provider-config` — Sets/replaces provider config; encrypts apiKey using `encryptTraceBody(tenantId, apiKey)` (reuses encryption.ts pattern); stores as `encrypted:{ciphertext}:{iv}` in provider_config JSONB; evicts provider cache after update
   - `DELETE /v1/admin/tenants/:id/provider-config` — Removes provider config (sets to NULL), evicts provider cache

4. **Provider Registry Decryption:**
   - Updated `getProviderForTenant()` to detect encrypted API keys (format: `encrypted:{ciphertext}:{iv}`)
   - Decrypts using `decryptTraceBody(tenantId, ciphertext, iv)` before passing to provider constructor
   - Falls back gracefully on decryption failure (logs error, provider fails auth downstream)

**Build Status:** ✅ Clean compile (npm run build, zero TypeScript errors)

**Learnings:**
- **Reuse encryption pattern for provider keys:** The existing `encryptTraceBody/decryptTraceBody` functions from `src/encryption.ts` work perfectly for provider API key encryption — same AES-256-GCM + per-tenant key derivation pattern. Storing as `encrypted:{ciphertext}:{iv}` prefix makes detection trivial in registry.ts.
- **Cache invalidation is critical:** Every operation that changes tenant status, deletes tenants, or revokes keys must call the appropriate cache invalidation helper (`invalidateCachedKey`, `invalidateAllKeysForTenant`) AND `evictProvider()`. Missing either leaves stale data in hot path.
- **Dynamic SQL parameter indexing:** Building dynamic UPDATE queries requires careful parameter index tracking (`$${paramIndex++}`). The pattern: build updates array, push params, then append final WHERE clause with tenant ID at `$${paramIndex}`.
- **Soft vs hard delete query param pattern:** Using `?confirm=true` for hard delete and `?permanent=true` for permanent key deletion provides clear UI affordance and prevents accidental destructive operations. Returns 400 if confirmation missing.
- **API key generation format:** `loom_sk_` prefix + 24-byte base64url = 40 total chars, sufficient entropy (192 bits). Storing key_prefix (first 12 chars) allows UI to show "loom_sk_abc..." without exposing full key.
- **Provider config summary redaction:** GET tenant detail returns `hasApiKey: boolean` instead of encrypted or raw key — never leak key material in read endpoints, even encrypted form.
- **Parallel count query optimization:** Using `Promise.all()` to fetch tenants list and total count simultaneously reduces latency for paginated list endpoints.

## 2026-02-25T10:39:35Z: Multi-Tenant Admin Feature Complete

**Summary:** All backend work for Phase 1 multi-tenant management complete. 10 CRUD endpoints fully implemented, tested, and ready for production.

**Wave Completion:**
- ✅ F-MT3: Auth middleware enhanced with revocation/deactivation filters + cache invalidation helpers
- ✅ F-MT4a: Admin users table + default admin user seeding
- ✅ F-MT4b: JWT-based admin authentication + login endpoint + route scaffolding
- ✅ F-MT5: Tenant CRUD (5 endpoints) with cache invalidation
- ✅ F-MT6: API key management (3 endpoints) with prefix generation + soft/hard delete
- ✅ F-MT7: Provider config management (2 endpoints) with AES-256-GCM encryption

**Key Achievements:**
- Per-user admin authentication via JWT (not shared secret) — enables audit trail for Phase 2
- Provider API keys encrypted at rest using existing encryption.ts (AES-256-GCM + per-tenant derivation)
- Cache invalidation helpers ensure immediate auth rejection on tenant/key status changes
- Soft-delete by default with hard-delete option via query params (GDPR compliance)
- Dynamic SQL parameter indexing supports flexible partial updates
- Parallel queries optimize hot paths

**Cross-Team Coordination:**
- **With McManus:** All 10 endpoints provide complete API surface for admin UI (M-MT1–M-MT6 components)
- **With Hockney:** Integration test suite validates all endpoints + encryption + cache behavior (28 tests, all passing)

**Build Status:**
- ✅ npm run build — zero TypeScript errors
- ✅ All 113 tests passing (85 existing + 28 new)
- ✅ No breaking changes to existing auth or provider logic

**Phase 2 Readiness:**
- Auth infrastructure supports RBAC extension (JWT payload can carry role/permissions)
- Admin action logging ready for audit trail implementation
- Encryption key versioning support in schema
- Cache invalidation pattern proven; can extend to other entities

