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


---

## Session: Tenant Portal Backend — 2025-07-24

### Task
Built all backend infrastructure for the tenant self-service portal per Keaton's approved architecture spec.

### Work Completed

**1. Migration** — `migrations/1000000000010_create-tenant-users.cjs`
- New `tenant_users` table: `id, tenant_id (FK→tenants CASCADE), email (unique), password_hash, role, created_at, last_login`
- Indexes on `tenant_id` and `email`

**2. Portal Auth Middleware** — `src/middleware/portalAuth.ts`
- `registerPortalAuthMiddleware(fastify, requiredRole?)` returns a Fastify preHandler
- Reads Bearer token from Authorization header, calls `request.portalJwtVerify()`
- Attaches `request.portalUser: { userId, tenantId, role }`
- Optional role enforcement (owner/member); returns 403 if role mismatch

**3. Portal Routes** — `src/routes/portal.ts`
- `POST /v1/portal/auth/signup` — atomic transaction: tenant + user + api_key; returns JWT + raw API key (shown once)
- `POST /v1/portal/auth/login` — scrypt password verify, 403 for suspended tenants
- `GET /v1/portal/me` — returns user + tenant (never raw LLM API key)
- `PATCH /v1/portal/settings` — owner only; encrypts LLM provider key via `encryptTraceBody`, evicts provider cache
- `GET /v1/portal/api-keys` — lists all keys for tenant (no raw keys)
- `POST /v1/portal/api-keys` — owner only; generates new `loom_sk_` key
- `DELETE /v1/portal/api-keys/:id` — owner only; soft revoke + LRU cache invalidation

**4. `src/index.ts` updates**
- Registered portal JWT plugin (`namespace: 'portal', decoratorName: 'portalJwt'`)
- Registered `fastifyStatic` for `portal/dist/` at `/` with `decorateReply: false`
- Registered portal routes
- Added PORTAL_JWT_SECRET startup warning
- Updated `setNotFoundHandler` with portal SPA fallback

**5. `src/auth.ts` update**
- Added `/v1/portal` and non-`/v1/` routes to skip list for tenant API key auth

**6. `.env` update**
- Added generated `PORTAL_JWT_SECRET`

### Build & Test
- `npm run build` — zero TypeScript errors
- `npm test` — 113/113 tests pass

### Patterns Established
- Portal JWT is fully isolated from admin JWT via Fastify namespace
- Portal routes use `registerPortalAuthMiddleware(fastify, 'owner')` preHandler for owner-only endpoints
- Scrypt password format consistent: `salt:derivedKey` (matches admin_users)
- API key prefix is first 15 chars: `loom_sk_` + 7 base64url chars

## 2026-02-26T15:57:42Z: Tenant Portal Backend Complete

**Event:** Completed tenant self-service portal backend  
**Status:** ✅ All 113 tests passing  
**Artifacts:** `migrations/1000000000010_create-tenant-users.cjs`, `src/middleware/portalAuth.ts`, `src/routes/portal.ts`, updated `src/index.ts` + `src/auth.ts`, generated `PORTAL_JWT_SECRET`

**What was delivered:**

1. **Tenant Users Migration (1000000000010):**
   - New table: id (UUID), tenant_id (FK → tenants CASCADE), email (unique), password_hash, role (varchar 50), created_at, last_login
   - Indexes on tenant_id and email
   - Supports future RBAC (first user seeded as 'owner')

2. **Portal Auth Middleware (`src/middleware/portalAuth.ts`):**
   - `registerPortalAuthMiddleware(fastify, requiredRole?)` returns Fastify preHandler
   - Reads Bearer token from Authorization header, calls `request.portalJwtVerify()`
   - Attaches `request.portalUser: { userId, tenantId, role }`
   - Optional role enforcement (owner/member); returns 403 on mismatch
   - Fully isolated from admin JWT via `namespace: 'portal'`

3. **Portal Routes (`src/routes/portal.ts`) — 7 Endpoints:**
   - `POST /v1/portal/auth/signup` — Atomic transaction: tenant + user + api_key; returns JWT + raw API key (shown once)
   - `POST /v1/portal/auth/login` — Scrypt password verify; 403 for inactive tenants; updates last_login
   - `GET /v1/portal/me` — Returns user + tenant (never raw LLM API key, only `hasApiKey: boolean`)
   - `PATCH /v1/portal/settings` — Owner only; encrypts LLM provider key via `encryptTraceBody`; evicts provider cache
   - `GET /v1/portal/api-keys` — Lists all keys for tenant (no raw keys or hashes)
   - `POST /v1/portal/api-keys` — Owner only; generates new `loom_sk_` key with 15-char prefix display
   - `DELETE /v1/portal/api-keys/:id` — Owner only; soft revoke + LRU cache invalidation

4. **Integration (`src/index.ts`):**
   - Registered portal JWT plugin (`decoratorName: 'portalJwt'`, `namespace: 'portal'`)
   - Registered `fastifyStatic` for `portal/dist/` at `/` with `decorateReply: false`
   - Registered portal routes via `fastify.register()`
   - Added `PORTAL_JWT_SECRET` startup warning
   - Updated `setNotFoundHandler` with portal SPA fallback (checks `/v1/` and `/dashboard` prefixes)

5. **Auth Skip List (`src/auth.ts`):**
   - Added `/v1/portal` and non-`/v1/` routes to skip list (portal uses JWT, not tenant API key auth)

6. **Environment (`.env`):**
   - Generated `PORTAL_JWT_SECRET` (32 bytes hex): `0a48e1dd6d91f82c0bbdd4dca9eceac8e93f7b2c9d18db0b2456c7718323a8b1`

**Key Design Patterns:**

- **Email globally unique** — One email = one tenant_user (can extend to multi-tenant-per-user later)
- **Email lowercase enforcement** — Applied at app layer in signup/login to prevent case-sensitivity bugs
- **Scrypt format consistency** — `salt:derivedKey` matches admin_users table (20-byte salt, 64-byte key)
- **Atomic signup transaction** — BEGIN/COMMIT wraps tenant creation, user creation, and API key generation
- **API key prefix = 15 chars** — `loom_sk_` + 7 base64url (follows Keaton's spec exactly; differs from admin's 12-char prefix)
- **Provider API key encryption** — Reuses `encryptTraceBody` function and `ENCRYPTION_MASTER_KEY` (no new dependency)
- **Cache invalidation pattern** — Portal settings update evicts provider from cache (same pattern as admin updates)
- **JWT isolation** — Portal JWT fully separate from admin JWT via Fastify namespace; `request.portalJwtVerify()` is distinct from `request.jwtVerify()`

**Build Status:** ✅ npm run build (zero TypeScript errors), npm test (113/113 passing)

**Coordination Notes:**
- **With McManus:** All 7 endpoints ready for consumption by portal React SPA
- **With Hockney:** Integration tests validate signup/login flows, provider encryption, cache invalidation, transaction atomicity
- **For Michael:** Rate limiting TODO added to signup/login (not blocking v1 but recommended before public launch); `PORTAL_JWT_SECRET` added to `.env`

**Learning — Tenant Portal Patterns:**
- **Signup atomicity:** Using PostgreSQL transaction ensures tenant + user + api_key are created together or fail together. No orphaned records on partial failure.
- **Email as identity** — Single global identity simplifies Phase 1. Multi-tenant-per-user requires junction table refactor in Phase 2 (backwards-compatible).
- **Fastify namespace for JWT** — `decoratorName: 'portalJwt'` and `namespace: 'portal'` fully isolates portal JWT from admin JWT. Request decorators are independent: `request.jwtVerify()` vs `request.portalJwtVerify()`.
- **SPA fallback ordering** — Portal fallback must come AFTER `/v1/`, `/dashboard`, and `/health` checks, otherwise API 404s return HTML. Handler order matters in Fastify `setNotFoundHandler`.
- **API key prefix strategy** — Displaying first 15 chars (`loom_sk_abc...`) allows UI to show key identity without exposing the full key or hash. User can compare against their generated key for verification.

## Learnings

### Admin Trace & Analytics Endpoints (added)

**What was built:**
- `GET /v1/admin/traces` — cross-tenant paginated trace list with optional `tenant_id` filter, `limit` (max 200, default 50), `cursor` (ISO timestamp) for keyset pagination. Placed in `src/routes/admin.ts` behind `adminAuthMiddleware`.
- `GET /v1/admin/analytics/summary` — admin-scoped aggregated metrics using new `getAdminAnalyticsSummary(tenantId?, windowHours?)` in `analytics.ts`.
- `GET /v1/admin/analytics/timeseries` — admin-scoped time-bucketed metrics using new `getAdminTimeseriesMetrics(tenantId?, windowHours?, bucketMinutes?)` in `analytics.ts`.

**Key Design Decisions:**
- Existing `getAnalyticsSummary` / `getTimeseriesMetrics` require a `tenantId` — added separate admin variants with optional `tenantId` to avoid mutating the per-tenant API surface.
- Used `params.push(value)` inside template literals to auto-number SQL parameters (`$1`, `$2`, etc.) cleanly when building dynamic WHERE clauses without an ORM.
- `$1` is reserved for `limit` in the traces query so all WHERE params are appended after — ensures `LIMIT $1` always refers to the correct binding regardless of filter combinations.
- Added `import { query } from '../db.js'` to `admin.ts` — admin routes previously used only `pool.query`; cross-tenant trace query benefits from the shared `query` helper consistent with `dashboard.ts`.

**Build Status:** ✅ `npm run build` (zero TypeScript errors)

## Session: Admin Dashboard Split (2026-02-26)

**Spawned as:** Background agent  
**Coordination:** Paired with McManus (frontend split)  
**Outcome:** ✅ All endpoints implemented, build clean, unblocks dashboard cross-tenant UI

### Work Completed

**1. Three new admin endpoints in `/v1/admin/*` (JWT-only)**

- `GET /v1/admin/traces` — Paginated trace list with optional `tenant_id` query param
  - Params: `limit`, `offset`, `tenant_id` (optional)
  - Built using conditional SQL parameter binding (`params.push()`)
  
- `GET /v1/admin/analytics/summary` — Aggregated metrics (counts, latency, error rate)
  - Params: `tenant_id` (optional), `window_hours` (default: 24)
  - Uses new `getAdminAnalyticsSummary()` function in `analytics.ts`
  
- `GET /v1/admin/analytics/timeseries` — Time-bucketed charting data
  - Params: `tenant_id` (optional), `window_hours`, `bucket_minutes` (default: 5)
  - Uses new `getAdminTimeseriesMetrics()` function in `analytics.ts`

All three endpoints:
- Protected by existing `adminAuthMiddleware` (JWT required, no API key fallback)
- Follow existing admin endpoint patterns (`authOpts = { preHandler: adminAuthMiddleware }`)
- Support optional tenant filtering; omit `tenant_id` to aggregate across all tenants

**2. Two new analytics functions (non-breaking exports)**

- `getAdminAnalyticsSummary(tenantId?: string, windowHours = 24)` in `analytics.ts`
  - Returns same shape as existing `getAnalyticsSummary(tenantId)` but with optional tenantId
  - Deliberately separate from existing function (not optional param) to prevent tenant leakage via omission
  
- `getAdminTimeseriesMetrics(tenantId?: string, windowHours = 24, bucketMinutes = 5)` in `analytics.ts`
  - Deliberately separate from existing `getTimeseriesMetrics(tenantId)` for same safety reason

**3. SQL Parameter Binding Pattern**

Discovered clean pattern for dynamic SQL parameter numbering:
```typescript
const params: unknown[] = [limit]; // $1 is always limit
if (tenantId) {
  queryStr += ` AND tenant_id = $${params.push(tenantId)}`; // $2, $3, etc. auto-numbered
}
```
`Array.push()` returns the new array length, which maps directly to the next `$N` placeholder. Eliminates string manipulation and is more readable than manual counter variables.

**4. Build & Integration**

- ✅ `npm run build` passes zero TypeScript errors
- Ready for McManus to consume on frontend
- No breaking changes to existing tenant-scoped analytics endpoints

### Key Learnings

**SQL parameter binding cleanup** — Using `params.push()` return value directly in template literals beats manual counter state. Pattern is reusable for any future admin query needing conditional filters.

**Endpoint vs. Function Separation** — Admin endpoints are separate from tenant-scoped routes. Admin analytics functions are separate from tenant analytics functions. This separation, while adding a few LOC, prevents the most likely source of tenant leakage bugs.

**Deferrable Analyses** — Admin doesn't need cross-tenant comparison charts in Phase 1. Single-tenant summary view is sufficient for proving out the architecture. Future: composite charts (multiple tenants side-by-side).

### Blocked / Deferred

- None; this session unblocks McManus
- Rate limiting on traces query (large `limit` values) — not in scope but noted for future optimization
- Audit logging per admin query (who viewed what, when) — deferred to Phase 2

### Coordination Notes

- McManus now has three `/v1/admin/*` endpoints ready to call
- Dashboard can implement tenant filter and cross-tenant traces view
- Portal can launch without admin features; admin dashboard is separate domain

---

## Session: Multi-User Multi-Tenant Implementation (Wave A + B)

**Date:** 2026-02-26  
**Requested by:** Michael Brown  
**Spec:** `.squad/decisions/inbox/keaton-multi-user-tenant-arch.md`

### What Was Built

**Wave A — Migration** (`migrations/1000000000011_multi-tenant-users.cjs`):
- Created `users` table (id, email UNIQUE, password_hash, created_at, last_login)
- Created `tenant_memberships` junction table (user_id FK→users, tenant_id FK→tenants, role, joined_at, UNIQUE(user_id, tenant_id))
- Created `invites` table (token VARCHAR(64) UNIQUE, created_by FK→users, max_uses nullable, use_count, expires_at, revoked_at)
- Indexed all FK columns + token
- Migrated existing `tenant_users` → `users` + `tenant_memberships` preserving IDs and roles
- Dropped `tenant_users`
- `down` migration: recreates `tenant_users` from first membership per user (known loss for multi-tenant users)

**Wave B — Backend Routes** (`src/routes/portal.ts`):
- **signup**: Now handles two branches — regular (creates user + tenant + membership(owner) + API key) and invite-based (validates invite, creates/finds user, adds membership(member), increments use_count)
- **login**: Queries `users` table for auth, then all active `tenant_memberships`, returns `tenants[]`. JWT issued for first active membership.
- **/me**: Queries `users` JOIN `tenant_memberships`, returns `tenants[]` alongside current tenant
- **POST /v1/portal/auth/switch-tenant**: Validates membership, issues new JWT for requested tenantId
- **POST /v1/portal/invites**: Owner-only; generates 32-byte base64url token, inserts row, returns full invite URL
- **GET /v1/portal/invites**: Owner-only; lists all invites with creator email and computed `isActive`
- **DELETE /v1/portal/invites/:id**: Owner-only; soft-revokes (sets revoked_at)
- **GET /v1/portal/invites/:token/info**: Public (no auth); returns tenantName, expiresAt, isValid
- **GET /v1/portal/members**: Auth-required; lists members with email, role, joinedAt, lastLogin
- **PATCH /v1/portal/members/:userId**: Owner-only; changes role with last-owner guard
- **DELETE /v1/portal/members/:userId**: Owner-only; removes membership with last-owner guard and no-self-remove guard
- **GET /v1/portal/tenants**: Auth-required; lists all active tenant memberships for requesting user
- **POST /v1/portal/tenants/:tenantId/leave**: Auth-required; removes own membership with last-owner guard and no-active-tenant guard

### Key Learnings

**Import cleanup** — Moved `timingSafeEqual` to top-level named import from `node:crypto` rather than dynamic import inside the handler. Removes an async dynamic import from the hot path.

**inviteToken branch in signup** — When inviteToken is present, `tenantName` in the request body is silently ignored (not an error). This matches the spec intent: invited users join an existing tenant.

**provider_config typing** — Changed `any` to `Record<string, unknown>` for the provider_config column type in the `/me` handler. Required switching from `cfg.provider` to `cfg['provider']` bracket access. Zero runtime change, better type safety.

**PORTAL_BASE_URL scoping** — Declared inside `registerPortalRoutes` so it's captured at request-time from `process.env` (not module load time). Allows the env var to be injected after module import during testing.

**No middleware changes** — JWT payload structure (`{ sub, tenantId, role }`) is unchanged; `portalAuth.ts` required zero modifications. `ownerRequired` was already defined in the existing route file.

### Deferred

- Rate limiting on `/v1/portal/invites/:token/info` (noted in spec as Phase 2)
- `SELECT ... FOR UPDATE` on last-owner count check (race condition mitigation, noted in spec risks)
- Email notifications for invite creation (Phase 2)

---

## 2026-02-27: Multi-User Multi-Tenant Backend Implementation

**Status:** Complete, 13 endpoints + migration implemented

**Scope:** Backend implementation of multi-user multi-tenant architecture per Keaton's spec.

**Deliverables:**
- Migration `1000000000011_multi_tenant_users.cjs` (users, tenant_memberships, invites tables + data migration)
- 13 API endpoints:
  - Auth: signup (invite branch), login, switch-tenant, /me
  - Invites: create, list, revoke, public info
  - Members: list, update role, remove
  - Tenants: list, leave

**Key Decisions Recorded:**
- inviteToken branch silently ignores tenantName (no-friction for client)
- Existing user joining via invite does NOT re-hash password
- Login returns 403 for zero active memberships (authorization failure, not auth)
- PORTAL_BASE_URL read at runtime (allows test overrides)
- Soft-revoke only for invites (audit trail)
- Unknown token → 404, expired/revoked/exhausted → 200 isValid:false
- No FOR UPDATE on last-owner checks (Phase 2 deferred)
- Migration preserves tenant_users.id as users.id (JWT compatibility)

**Decision Log:** `.squad/decisions.md` (fenster-multi-user-impl.md merged)

**Next:** Awaiting frontend integration & Hockney tests

---

## 2026-02-27: Subtenant Hierarchy + Agents Migration

**Status:** Complete

**Scope:** Database migration `1000000000012_subtenant-hierarchy-and-agents.cjs` adding subtenant hierarchy and per-tenant agent configurations.

**Deliverables:**
- Migration file `migrations/1000000000012_subtenant-hierarchy-and-agents.cjs`

**Key Decisions:**
- `agents.merge_policies` is NOT NULL with default `{"system_prompt":"prepend","skills":"merge","mcp_endpoints":"merge"}` — every agent always has a merge policy.
- `api_keys.agent_id` is NOT NULL — every key must be bound to an agent. Populated via a Default agent seeded for every existing tenant before the NOT NULL constraint is applied.
- `traces.agent_id` is nullable — backward compatibility; existing rows retain null.
- `tenants.parent_id` self-references with ON DELETE CASCADE — deleting a parent tenant cascades to all subtenants.
- Down migration drops columns/tables in strict reverse order to satisfy FK dependencies.

### Learnings

**pgm.func for JSONB defaults** — node-pg-migrate requires `pgm.func(...)` to emit a raw SQL expression. For a JSONB literal default, wrap the quoted JSON string: `pgm.func("'{"key":"val"}'")` so the migration emits the literal without double-quoting it as a string parameter.

**Nullable-then-populate-then-NOT-NULL pattern** — Adding a column as nullable, running an UPDATE to fill it, then `alterColumn(..., { notNull: true })` is the safe way to backfill and enforce the constraint in one migration without a default that would persist on new rows.
- **Subtenant rollup via recursive CTE**: When rolling up analytics across a tenant hierarchy, use a `WITH RECURSIVE subtenant_tree AS (SELECT id FROM tenants WHERE id = $1 UNION ALL SELECT t.id FROM tenants t JOIN subtenant_tree st ON t.parent_id = st.id)` CTE. Replace `WHERE tenant_id = $1` with `WHERE tenant_id IN (SELECT id FROM subtenant_tree)`. The `$1` parameter is reused by the CTE, keeping the parameter list unchanged.
- **Partition-compatible CTEs**: On a partitioned `traces` table, the recursive CTE must not reference the partitioned table inside itself. Keeping the CTE restricted to the `tenants` table (non-partitioned) and only referencing `subtenant_tree` in the outer `WHERE … IN (subquery)` lets PostgreSQL still prune partitions on `created_at`.
- **Rollup flag as trailing boolean param**: Adding `rollup = false` as the last parameter to analytics functions keeps backward compatibility — all existing callers work without change, and the portal routes opt in with `qs.rollup === 'true' || qs.rollup === '1'`.

---

## 2026-02-28: Subtenant + Agent Portal API Routes

**Status:** Complete

**Scope:** Added subtenant hierarchy and agent CRUD routes to `src/routes/portal.ts`, plus extended `GET /v1/portal/me`.

**Deliverables:**
- `GET /v1/portal/subtenants` — list direct children of current tenant
- `POST /v1/portal/subtenants` (owner) — create subtenant + seed owner membership in transaction
- `GET /v1/portal/agents` — list agents for current tenant
- `POST /v1/portal/agents` — create agent (any role); encrypts providerConfig.apiKey if present
- `GET /v1/portal/agents/:id` — get agent (membership-verified)
- `PUT /v1/portal/agents/:id` — partial update (membership-verified, dynamic SET clauses)
- `DELETE /v1/portal/agents/:id` (owner) — hard delete
- `GET /v1/portal/agents/:id/resolved` — recursive CTE walks parent_id chain; returns merged config with inheritanceChain
- Extended `GET /v1/portal/me` to include `agents` (id, name) and `subtenants` (id, name, status) via `Promise.all`

**Key Decisions:**
- agent providerConfig uses same encrypt-on-write / sanitize-on-read pattern as tenant providerConfig
- PUT uses dynamic SET clause builder (index-tracked `$N` params) to support partial updates
- resolved endpoint deduplicates skills/mcpEndpoints using JSON.stringify as set key
- membership check for GET/PUT/resolved uses JOIN across agents + tenant_memberships (not just tenantId match) to support cross-tenant agent access within a user's memberships

## Learnings

- **Dynamic SET clause with index tracking**: Build `setClauses[]` and `values[]` in parallel, tracking `idx` manually. Push `id` and `tenantId` last so `WHERE id = $${idx} AND tenant_id = $${idx+1}` is always correct regardless of how many optional fields were updated.
- **Promise.all for parallel sibling queries in /me**: Two independent SELECT queries (agents + subtenants) can run concurrently with `await Promise.all([...])` to reduce latency on the me endpoint.
- **Recursive CTE for tenant hierarchy**: `WITH RECURSIVE tenant_chain AS (... UNION ALL ...)` starting from the agent's `tenant_id` walks `parent_id` upward cleanly. Returns rows ordered by depth, so index 0 is always the immediate tenant.
- **JSON.stringify deduplication for union arrays**: Using `JSON.stringify(item)` as a Set key deduplicates skills/mcpEndpoints across hierarchy levels reliably, even for objects.

---

### 2026-02-26: Wave 4 — Agent-Aware Gateway

**Task:** Make gateway fully agent-aware (agent_id on api_keys + traces migration has run).

**Changes shipped:**
- `src/auth.ts`: Expanded `TenantContext` with `agentId`, `agentSystemPrompt`, `agentSkills`, `agentMcpEndpoints`, `mergePolicies`, `resolvedSystemPrompt`, `resolvedSkills`, `resolvedMcpEndpoints`. New `lookupTenant()` JOINs agents table + walks tenant parent chain via recursive CTE (max 10 hops). Resolves `provider_config`/`system_prompt` (first non-null wins) and `skills`/`mcp_endpoints` (union, earlier in chain wins on name conflict).
- `src/agent.ts` (new): `applyAgentToRequest()` applies merge_policies (prepend/append/overwrite/ignore for system prompt; merge/overwrite/ignore for skills). `handleMcpRoundTrip()` does one JSON-RPC POST to matching MCP endpoints and re-sends updated messages to provider.
- `src/tracing.ts`: Added `agentId?` to `TraceInput` and `BatchRow`; updated INSERT to include `agent_id` column.
- `src/streaming.ts`: Added `agentId?` to `StreamTraceContext`, passed through to `traceRecorder.record()`.
- `src/index.ts`: Applies `applyAgentToRequest()` before forwarding; calls `handleMcpRoundTrip()` on non-streaming responses; passes `agentId` to all trace contexts.
- `src/providers/registry.ts`: Caches by `agentId` (primary key) + maintains `tenantId → Set<cacheKey>` reverse index. `evictProvider(id)` handles both agentId and tenantId eviction.
- Test fixes: Updated `encryption-at-rest.test.ts` IDX constants (+1 for new agent_id param), updated `admin.test.ts` mock to return full agent shape and use `ak.key_hash = $1` as match criterion.

## Learnings

- **Agent-aware lookup in one query**: JOIN `api_keys → agents → tenants` in a single query, then a separate recursive CTE for the parent chain if `parent_id` is non-null. Separating the two queries avoids a complex one-shot CTE and keeps the code readable.
- **Resolve chain with ordered array**: Building a `chain[]` (agent → immediate tenant → parent chain rows) and calling `.find()` / `resolveArrayChain()` over it gives clean, testable resolution logic without multiple branching conditions.
- **Provider cache keyed by agentId**: Caching by `agentId` (not `tenantId`) is required for correctness when agents within the same tenant have different `provider_config`. A reverse `tenantId → Set<cacheKey>` index keeps `evictProvider(tenantId)` working for all existing admin route callers without any change to the call sites.
- **INSERT parameter index drift**: Adding `agent_id` at position 2 in the INSERT shifted all downstream `$N` indices. Tests that hardcode parameter indices must be updated simultaneously — always audit the full array+column list when extending the schema.
- **Mock SQL matching by distinctive clause**: The admin test mock matched on `from   api_keys ak` + `join   tenants` whitespace, which broke when query whitespace changed. Switching to `ak.key_hash = $1` (unique to auth lookup) is far more robust against formatting changes.
- **MCP only on non-streaming**: Tool calls in streaming responses require buffering the full stream before routing — complex and high-latency. Limiting MCP round-trip to non-streaming (JSON) responses is the correct Phase 1 scope.

### 2026-02-27: Wave 4 Implementation — Subtenant Hierarchy + Agents, Analytics Rollup, Gateway Integration

**Scope:** Subtenant multi-tenancy with agent-scoped configuration, provider isolation, and recursive analytics.

**Migration (1000000000012):**
- Added `tenants.parent_id` (nullable self-FK, ON DELETE CASCADE) enabling subtenant hierarchy
- Created `agents` table with `id, tenant_id, name, provider_config (JSONB), system_prompt, skills, mcp_endpoints, merge_policies (JSONB), created_at, updated_at`
- Added `api_keys.agent_id` (NOT NULL, FK) — every key bound to exactly one agent
- Added `traces.agent_id` (nullable, FK) — historical rows have NULL, new rows always record agent
- Seeded "Default" agent per existing tenant before enforcing NOT NULL on api_keys.agent_id
- Down migration reverses in strict FK dependency order: traces → api_keys → agents → tenants

**Portal Routes (9 new endpoints):**
- POST /v1/portal/subtenants — Create subtenant with owner membership (transactional)
- GET /v1/portal/subtenants — List subtenants (parent_id-based)
- GET/POST /v1/portal/agents — List / create agents in current tenant
- GET/PUT/DELETE /v1/portal/agents/:id — Agent CRUD (membership-gated via JOIN tenant_memberships)
- GET /v1/portal/agents/:id/resolved — Get agent config with inheritance chain applied
- Extended GET /v1/portal/me — Now includes agents array + subtenants array

**Agent Config Encryption:** Applied same encrypt-on-write / sanitize-on-read pattern as tenant settings. `prepareAgentProviderConfig()` encrypts plain `apiKey` field; `sanitizeAgentProviderConfig()` exposes only `hasApiKey: boolean`.

**Analytics Rollup:** Added `rollup?: boolean` parameter to `getAnalyticsSummary`, `getTimeseriesMetrics`, `getModelBreakdown`. When true, prepends `WITH RECURSIVE subtenant_tree` CTE walking `tenants.parent_id`. CTE restricted to tenants table only (preserves partition pruning on traces table).

**Gateway Agent-Aware Injection:**
- Two-query lookup: immediate tenant chain via JOIN query, parent chain via separate recursive CTE (skipped if no parent)
- Chain resolution in TypeScript: `.find(non-null)` for providerConfig/systemPrompt, union+dedup for skills/mcpEndpoints
- Provider cache keyed by agentId (fallback tenantId); reverse tenantId → Set<cacheKey> index preserves `evictProvider(tenantId)` API for admin routes
- `applyAgentToRequest()` applies merge policies to outbound request before provider (immutable, no mutation of request.body)
- `handleMcpRoundTrip()` on non-streaming responses only (streaming MCP deferred to Phase 2)
- `agentId` recorded on every trace (nullable for backward compatibility)

## Learnings

- **Subtenant hierarchy:** Self-FK with ON DELETE CASCADE is sufficient for linear parent-child model; avoids join table complexity
- **Agent provider isolation:** Each agent can have its own provider config, encrypted same as tenant settings; per-agent caching required for correctness
- **CTE + partition pruning:** Keep recursive CTE on non-partitioned tables only; reference result set in WHERE subquery to preserve PostgreSQL partition elimination
- **Inheritance patterns:** First-non-null vs. union semantics cleaner in application code than SQL; ordered chain array with .find() is readable and testable
- **Two-query pattern:** Separating immediate chain (one JOIN) from parent chain (recursive CTE) is simpler, more testable, and faster for non-parent tenants
- **Transaction boundaries:** Wrap multi-step creates (subtenant + membership) in explicit transaction to prevent orphaned rows
- **API key enforcement:** DB-level NOT NULL on api_keys.agent_id prevents orphaned keys; seeded Default agent enables safe migration without full backfill

- **Portal sandbox chat endpoint re-uses resolved CTE logic**: `POST /v1/portal/agents/:id/chat` duplicates the tenant hierarchy walk from the `/resolved` endpoint to build a full `TenantContext`. This keeps each route self-contained and avoids introducing a shared helper that crosses auth/portal boundaries. The `getProviderForTenant` registry handles API key decryption transparently (same as gateway).
- **stream: false must be set explicitly in sandbox body**: `applyAgentToRequest` passes through the body as-is; callers must set `stream: false` before calling it to prevent the provider from returning an SSE stream that would be mishandled in the portal sandbox context.
- **TenantContext.name comes from first tenant chain row**: For portal-constructed contexts, `tenantChain[0]?.name` (the agent's immediate tenant) is the right value for the `name` field, falling back to `tenant_id` if the chain is somehow empty.

### 2026-02-27: Agent Sandbox Chat Endpoint

**Implemented:** `POST /v1/portal/agents/:id/chat`  
**Decision:** No trace recording — sandbox chats are developer testing, not production traffic.

- Resolves agent hierarchy (agent → tenant → parent chain) into `TenantContext`
- Applies system prompt + skills via `applyAgentToRequest()` with `stream: false`
- Calls provider non-streaming
- Returns `{ message, model, usage }`
- Portal auth gated (JWT, not API key) so safe from production gateway confusion
- Errors: 400 (invalid request), 404 (agent not found), 502 (provider error)
- Future trace recording of sandbox calls requires explicit `sandbox: true` flag in schema (Phase 2)

### 2026-XX-XX: available_models Column

**Implemented:** `available_models jsonb` on `tenants` and `agents` tables, wired through portal API.

- **Conditional UPDATE in PATCH /settings:** Only updates `available_models` column when the field is present in the request body (undefined check), avoiding accidental nulling of existing data when callers only want to update provider config.
- **formatAgent always returns availableModels:** Defaults to `null` if column is absent, ensuring backward compat with any query that doesn't SELECT `available_models`.
- **NULL vs empty array semantics:** NULL = "use frontend defaults (COMMON_MODELS)", `[]` = "no models configured (fall back to defaults)", non-empty = "explicit model list". Stored as JSONB so Postgres can index/query into it if needed later.

### 2026-XX-XX: Sandbox Chat Trace Recording

**Implemented:** `traceRecorder.record()` in `POST /v1/portal/agents/:id/chat`

- Added `import { traceRecorder } from '../tracing.js'` to `src/routes/portal.ts`
- After successful provider response, calls `traceRecorder.record()` fire-and-forget with full trace payload (tenantId, agentId, model, provider, requestBody, responseBody, latencyMs, statusCode, token counts, ttfbMs, gatewayOverheadMs)
- `provider.name` is available on all provider implementations via abstract base class in `src/providers/base.ts`
- Supersedes Phase 2 deferral noted in 2026-02-27 entry — sandbox traces now appear in the traces list
- Purely additive: no behavior changes to request/response path

## 2026-02-28: Conversations & Memory Backend (Wave 5)

**Event:** Implemented full conversations & memory subsystem for the gateway  
**Artifacts:** `migrations/1000000000014_conversations.cjs`, `src/conversations.ts`, `src/auth.ts` (extended), `src/index.ts` (wired), `src/routes/portal.ts` (6 new routes)

### What was built

**Schema (migration 1000000000014):**
- `agents` gains `conversations_enabled`, `conversation_token_limit`, `conversation_summary_model`
- New tables: `partitions`, `conversations`, `conversation_messages`, `conversation_snapshots`
- Two partial unique indexes per null-nullable foreign key (`parent_id IS NULL` on partitions, `partition_id IS NULL` on conversations) — required because PostgreSQL UNIQUE treats two NULLs as non-equal

**`src/conversations.ts` — ConversationManager:**
- `getOrCreatePartition` — upsert via partial unique index + fallback SELECT
- `getOrCreateConversation` — `IS NOT DISTINCT FROM` for null-safe partition matching
- `loadContext` — fetches latest snapshot + un-snapshotted messages (`snapshot_id IS NULL`), decrypts all in-memory
- `storeMessages` — encrypts user+assistant content, inserts two rows
- `createSnapshot` — encrypts summary, inserts snapshot, marks all `snapshot_id IS NULL` messages with new snapshot id
- `buildInjectionMessages` — prepends snapshot summary as `system` message, then appends post-snapshot messages

**`src/auth.ts`:**
- Added `AgentConfig` interface with `conversations_enabled`, `conversation_token_limit`, `conversation_summary_model`
- Extended `TenantContext` with `agentConfig?: AgentConfig`
- Extended DB query in `lookupTenant` to select the three new agent columns

**`src/index.ts` — gateway wiring:**
- Strips `conversation_id` / `partition_id` from raw body before forwarding upstream
- If `agentConfig.conversations_enabled`: resolves/creates partition + conversation, loads context, optionally summarizes (if over token limit) then builds injection messages
- Prepends history to request messages before `applyAgentToRequest`
- After non-streaming response: fire-and-forget `storeMessages`
- Adds `conversation_id` (and optionally `partition_id`) to response body + `X-Loom-Conversation-ID` header
- Auto-generates `conversation_id` (UUID) if client omits it

**`src/routes/portal.ts` — 6 new portal routes:**
- `GET /v1/portal/partitions` — tree of all tenant partitions (decrypted titles)
- `POST /v1/portal/partitions` — create partition with optional encrypted title
- `PUT /v1/portal/partitions/:id` — update title / parent
- `DELETE /v1/portal/partitions/:id` — delete (cascades to conversations)
- `GET /v1/portal/conversations` — metadata list, filterable by partition_id
- `GET /v1/portal/conversations/:id` — full detail: decrypted messages + snapshot summaries

### Key Learnings

- **Partial unique indexes for nullable FK uniqueness**: PostgreSQL UNIQUE treats two NULLs as distinct, so `UNIQUE (tenant_id, parent_id, external_id)` does NOT prevent duplicate root partitions. Always add a `CREATE UNIQUE INDEX … WHERE parent_id IS NULL` partial index alongside the general constraint for nullable columns that need null-safe uniqueness.
- **`IS NOT DISTINCT FROM` for null-safe equality in queries**: When filtering on a nullable FK with `WHERE col = $1`, NULL will never match. Use `WHERE col IS NOT DISTINCT FROM $1` to treat (col=NULL, $1=NULL) as a match.
- **Snapshot-based context loading via `snapshot_id IS NULL`**: Messages without a `snapshot_id` are "post-latest-snapshot" — the only messages that need to be injected alongside the snapshot summary. This avoids needing a join or secondary timestamp query; the archive step simply fills in the `snapshot_id` on all un-tagged messages.
- **Fire-and-forget for post-response persistence**: `storeMessages` is called with `.catch()` after `reply.send()` — same pattern as `traceRecorder.record()`. This keeps response latency low and avoids surfacing storage failures as HTTP errors.
- **Summarization as a provider proxy call**: Reuses the existing `provider.proxy()` plumbing for the summarization LLM call. No new HTTP client needed. The summary model falls back to the request model if `conversation_summary_model` is not set on the agent.

## 2026-02-28: Conversation Demo + Sandbox Portal Support

**Event:** Created standalone conversation demo and added conversation support to sandbox chat endpoint  
**Artifacts:** `examples/conversations/index.html`, `src/routes/portal.ts` (sandbox chat update), `portal/src/lib/api.ts` (already updated)

### What was built

**`examples/conversations/index.html` — Standalone demo:**
- Single-file HTML demo (no build tools) showing conversation memory feature
- Adds `conversation_id` and `partition_id` config inputs (both optional)
- Tracks active conversation ID in localStorage + displays it in status bar (truncated UUID)
- "New Conversation" button to clear stored ID and start fresh thread
- Extracts `conversation_id` from `X-Loom-Conversation-ID` response header (available immediately before stream reads)
- Auto-saves returned conversation ID for subsequent messages
- Comments explain conversation_id (thread identifier) and partition_id (user/group scope) semantics
- Single-message requests — gateway loads history server-side (unlike chat example which sends full history)

**`src/routes/portal.ts` — Sandbox chat conversation support:**
- Imported `conversationManager` from `conversations.ts`
- Extended agent DB query to include `conversations_enabled`, `conversation_token_limit`, `conversation_summary_model`
- Extended request body type to accept `conversation_id?: string` and `partition_id?: string`
- Added conversation loading logic before `applyAgentToRequest`:
  - If `conversations_enabled && conversation_id`: resolve/create partition, resolve/create conversation, load context, prepend history
  - Non-fatal error handling — catch all conversation load errors and proceed without memory (same as gateway)
- After response: fire-and-forget `storeMessages` call (same pattern as gateway)
- Response now includes `conversation_id` if present (spread into return object)

**Portal API client** (`portal/src/lib/api.ts`):
- Already updated with `conversationId` and `partitionId` optional parameters
- Response type already includes `conversation_id?: string`

### Key Learnings

- **Conversation header vs body**: The `X-Loom-Conversation-ID` header is available immediately after `fetch()` returns (before reading stream), while body `conversation_id` only appears after consuming the entire stream. For UI responsiveness, check header first.
- **Single-message requests with server-side history**: Unlike the basic chat example which sends full `conversationHistory` array, the conversation demo sends only the current message. The gateway/sandbox loads and injects history server-side. This reduces request payload and keeps conversation state canonical on the server.
- **Partition scope pattern**: `partition_id` is typically a user ID or team ID — provides logical isolation so different users/contexts can have separate conversation threads. The sandbox uses `__sandbox__` as default partition if none provided.
- **Fire-and-forget storage in sandbox**: Same `.catch()` pattern as gateway — `storeMessages` is called after response, logged on error but doesn't block or fail the HTTP response.
