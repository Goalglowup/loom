# Keaton's Project Knowledge

## Project Context

**Project:** Loom — AI runtime control plane  
**Owner:** Michael Brown  
**Stack:** Node.js + TypeScript  
**Description:** Provider-agnostic OpenAI-compatible proxy with auditability, structured trace recording, streaming support, multi-tenant architecture, and observability dashboard.

**PRD Summary:**
- **Phase 1:** Gateway (Auditability Foundation) — OpenAI-compatible proxy, streaming, trace recording, token/cost/latency tracking, multi-tenant architecture, minimal dashboard
- **Phase 2:** Control (Governance Layer) — A/B testing, prompt versioning, budget controls, RBAC
- **Phase 3:** Runtime (Agent Execution Platform) — Agent execution graphs, tool call tracing, memory logging

**Success Metrics:** All Goal Glowup traffic routed through Loom, stable streaming performance, trace capture completeness, gateway overhead under 20ms, at least one external beta deployment

**Strategic Positioning:** Loom is the runtime control plane that brings order, auditability, and governance to AI systems in production — NOT a logging tool or dashboard.

## Learnings

### Architecture Decisions (2026-02-24)

**Gateway Layer:**
- Fastify as HTTP framework (fastest mainstream Node.js framework, plugin architecture fits phased roadmap)
- undici for upstream HTTP calls (built-in, connection pooling, fastest option)
- Single Fastify process hosts both gateway (/v1/*) and dashboard API (/api/*) for Phase 1

**Streaming:**
- Node.js Transform stream to tee SSE responses — one leg to client, one to trace recorder
- Lightweight SSE parser extracts data lines, accumulates tokens
- Trace created at request start, finalized on stream completion with accumulated response
- No per-chunk database writes — accumulate in memory, write once

**Trace Schema:**
- Core fields: id, tenant_id, request_id, model, provider, endpoint, request_body (JSONB), response_body (JSONB), status_code, latency_ms, ttfb_ms, gateway_overhead_ms, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, is_streaming, chunk_count, api_key_id, ip_address, error (JSONB)
- JSONB for request/response bodies — flexible and queryable
- Never store raw API keys in traces — only api_key_id references

**Multi-Tenant:**
- API-key-based tenancy (Loom issues keys in format: loom_sk_{prefix}_{random})
- Shared database with tenant_id column on all tables
- In-memory LRU cache for API key → tenant resolution (60s TTL)
- PostgreSQL Row-Level Security available for Phase 2 if needed

**Database:**
- PostgreSQL for Phase 1 (sufficient for expected volume, JSONB support, mature ecosystem)
- Traces table partitioned by month
- ClickHouse considered as analytics sidecar for Phase 3 if needed

**Performance (<20ms overhead):**
- Estimated sync overhead: 3-6ms (parsing ~1ms, tenant lookup ~1-3ms cached, stream tee ~1-2ms)
- Trace persistence is async (fire-and-forget, off hot path)
- Connection pooling: undici pool for upstream, pg pool for database
- gateway_overhead_ms measured on every request as canary metric

**Dashboard API:**
- REST (not GraphQL) — predictable query patterns, simpler caching
- Endpoints: GET /api/traces, GET /api/traces/:id, GET /api/analytics/summary, GET /api/analytics/timeseries
- Cursor-based pagination for trace lists

**Open Questions (awaiting Michael's input):**
- Multi-provider support in Phase 1? (OpenAI only vs. Azure/Anthropic)
- Full request/response body storage vs. configurable retention
- Co-located gateway + dashboard vs. separate services
- Expected request volume through Goal Glowup

### Open Questions Resolved (2026-02-24)

Michael Brown confirmed:
1. **Multi-provider Phase 1:** Azure OpenAI + OpenAI (Azure for free tokens during testing)
2. **Full body storage:** Yes, store complete request/response bodies by default — no truncation
3. **Service topology:** Single process acceptable for Phase 1
4. **Volume target:** 1,000 req/sec capacity (~86M traces/day)

Key design implications from volume target:
- Batch inserts required for trace persistence (not individual INSERTs)
- Write queue in memory with flush interval (100ms or 100 traces)
- Monthly partitioning essential for query performance
- pg pool sizing: 20-30 connections for write throughput

### Provider Abstraction Pattern
- Common provider interface with `forwardRequest()` and `forwardStreamingRequest()` methods
- OpenAI adapter: standard base URL, bearer token auth
- Azure OpenAI adapter: resource-based URL pattern (`{resource}.openai.azure.com/openai/deployments/{deployment}`), api-key header, api-version query param
- Provider resolved per-tenant via configuration

### Work Decomposition (2026-02-24)
- 10 backend items (Fenster): F1-F10
- 5 frontend items (McManus): M1-M5
- 7 test items (Hockney): H1-H7
- Critical path: F1 → F4 → F6 → F7 → H6
- 4 execution waves identified for parallel work

### Security Architecture (2026-02-24)

**Tenant Data Encryption Decision:**
- Use encryption-at-rest for all tenant data (request_body, response_body columns in traces table)
- Application-level column encryption using AES-256-GCM (authenticated encryption)
- Envelope encryption pattern: master key + tenant_id derives per-tenant DEKs
- Threat model: Unauthorized database console access (compromised admin, insider threat)
- ETL workaround deferred — dashboard lag acceptable for Phase 1 observability use case

**Key Management Strategy:**
- Phase 1: Master key in environment variable, deterministic tenant key derivation
- Phase 2: External KMS (AWS KMS), key rotation with grace period
- Schema includes encryption_key_version column now to avoid backfill migration later

**Implementation Pattern:**
- Encrypt at trace persistence (off hot path, no gateway latency impact)
- Decrypt on dashboard API reads (~0.01ms per trace, negligible for human-scale UI)
- Store IV (initialization vector) in separate columns (request_iv, response_iv)
- Tenant isolation: one tenant's key compromise doesn't expose others

**Performance Impact:**
- Encryption overhead: <0.01ms per trace (unmeasurable at 1000 req/sec)
- Dashboard analytics lag: ~10ms for 1000-trace page (acceptable for observability)

**Alternatives Rejected:**
- PostgreSQL TDE: Too coarse-grained, limited key rotation
- No encryption: Fails to address unauthorized DB console access threat
- Selective encryption: Too complex to determine what's sensitive in prompts

### Schema Changes (2026-02-24)
- Added `encryption_key_version` column to traces table migration (1000000000003_create-traces.cjs)
- Column spec: `integer NOT NULL DEFAULT 1`
- Purpose: Phase 2 key rotation support, avoids backfill migration later
- Migration follows envelope encryption pattern from security architecture decision

### Key File Paths
- PRD: /Users/michaelbrown/projects/loom/Loom_PRD_v0.1.pdf
- Team decisions: /Users/michaelbrown/projects/loom/.squad/decisions.md
- Architecture proposal (original): /Users/michaelbrown/projects/loom/.squad/decisions/inbox/keaton-architecture-proposal.md
- Architecture decision (approved): /Users/michaelbrown/projects/loom/.squad/decisions/inbox/keaton-architecture-approved.md
- Security architecture (encryption): /Users/michaelbrown/projects/loom/.squad/decisions/inbox/keaton-tenant-encryption.md
- Database migrations: /Users/michaelbrown/projects/loom/migrations/

## 2026-02-24T03:31:15Z: Wave 1 Encryption Launch Spawn

**Event:** Spawned for encryption infrastructure Phase 1  
**Task:** Add encryption_key_version column to traces migration  
**Mode:** Sync  
**Coordination:** Part of 4-agent wave (Keaton sync, Fenster/McManus/Hockney background)

## 2026-02-24T04:00:00Z: GitHub Issues Migration — Work Breakdown to Issues

**Task:** Migrate approved architecture work items to GitHub issues for team visibility  
**Outcome:** Created 17 GitHub issues (6 Backend/Fenster, 5 Frontend/McManus, 6 Testing/Hockney)

### Issues Created

**Backend (Fenster) — 6 items:**
- F3: Tenant Auth Middleware (Wave 2)
- F5: Azure OpenAI Adapter (Wave 2)
- F6: SSE Streaming Proxy (Wave 2)
- F7: Trace Recording & Persistence (Wave 3)
- F8: Analytics Engine (Wave 3)
- F9: Dashboard API Endpoints (Wave 3)
- F10: Provider Configuration & Tenant Routing (Wave 3)

**Frontend (McManus) — 5 items:**
- M2: Traces Table Component (Wave 3)
- M3: Trace Details Panel (Wave 3)
- M4: Analytics Summary Card (Wave 3)
- M5: Analytics Timeseries Charts (Wave 3)

**Testing (Hockney) — 6 items:**
- H2: Proxy Correctness Tests (Wave 2)
- H3: Authentication Tests (Wave 2)
- H4: Multi-Tenant Isolation Tests (Wave 3)
- H5: Multi-Provider Tests (Wave 2)
- H6: Streaming & Trace Recording Tests (Wave 3)
- H7: Encryption-at-Rest Tests (Wave 3)

### Issue Structure

Each issue includes:
- Clear acceptance criteria (what "done" means)
- Dependencies (blocks/blocked-by relationships)
- Performance targets where applicable
- Reference to architecture decisions in .squad/decisions.md
- Labels for squad assignment (squad:fenster, squad:mcmanus, squad:hockney)
- Wave assignment for execution planning (Wave 2 parallel work, Wave 3+ follow-on)

### Repository Details

- **Repository:** Goalglowup/loom on GitHub
- **Issues Platform:** GitHub Issues (not Jira)
- **Labels System:** squad:* (agent assignment), wave:* (execution phase)
- **Total Work Items in Phase 1:** 22 (5 completed in Wave 1, 17 remaining)

### Lessons Learned

1. **GitHub Labels Required Setup:** Had to create custom labels before bulk issue creation (squad:fenster, squad:mcmanus, squad:hockney, wave:2, wave:3)
2. **Wave 2 Critical Path:** F3 → F6 → F7 (tenant auth → streaming → trace recording) must execute sequentially; H2/H3/H5 can run in parallel with F3-F6
3. **Wave 3 Unblocking:** F7 and F8 are the critical unlocks for all frontend work (M2-M5) and remaining test coverage (H4, H6, H7)
4. **Architecture Decisions Embedded:** Each issue references specific decisions from .squad/decisions.md to ensure team alignment; no decisions isolated in issue comments

### Multi-Tenant Management Design (2026-02-25)

**Task:** Design multi-tenant management feature — tenant CRUD, API key management, provider config management, dashboard admin view.

**Key Design Decisions:**
1. **Admin auth via `ADMIN_API_KEY` env var** — avoids RBAC complexity in Phase 1. Single shared admin key checked in a dedicated preHandler hook on `/v1/admin/*` routes.
2. **Schema additions, not replacements** — two ALTER TABLE migrations add `status`/`updated_at` to tenants and `name`/`key_prefix`/`status`/`revoked_at` to api_keys. All new columns have defaults for backward compatibility with existing data.
3. **Soft deactivation over hard delete** — tenants get `active`/`inactive` status; API keys get `active`/`revoked`. No cascade deletes in management operations.
4. **Auth query tightened** — existing `lookupTenant` query must filter by `ak.status = 'active' AND t.status = 'active'`. LRU cache invalidation helpers exported for use by admin routes.
5. **Dedicated Admin page, not tenant switcher** — dashboard stays per-tenant for operators; new `/admin` route for Loom operator with separate admin API key in localStorage. Avoids mixing operator and tenant concerns.
6. **Provider config management with cache eviction** — PUT/DELETE on provider config calls `evictProvider(tenantId)` to force re-init on next request. Already supported by registry.ts.

**Work Breakdown:** 8 backend tasks (Fenster), 6 frontend tasks (McManus), 5 test tasks (Hockney). 4 execution waves. Critical path: schema → auth update → CRUD endpoints → route registration.

**Open Questions for Michael:** Admin auth model sufficiency, hard delete vs. soft deactivation, provider config secret encryption, existing data backfill approach.

**Design doc:** `.squad/decisions/inbox/keaton-multitenant-design.md`

### Multi-Tenant Design Revision (2026-02-25)

**Task:** Revise multi-tenant management design based on Michael Brown's answers to 4 open questions.

**Decisions Incorporated:**
1. **Q1 — Admin auth:** Changed from shared `ADMIN_API_KEY` env var to per-user admin auth. New `admin_users` table with bcrypt password hashing + JWT-based login endpoint (`POST /v1/admin/login`). `ADMIN_JWT_SECRET` env var for token signing. Keeps it simple (no RBAC) but eliminates shared secrets.
2. **Q2 — Deletion:** Soft delete remains default (`PATCH` with `status: "inactive"`). Added hard `DELETE /v1/admin/tenants/:id?confirm=true` with cascade (api_keys → traces → provider_config → tenant row). API keys get `?permanent=true` option on DELETE. Confirmation guards prevent accidents.
3. **Q3 — Provider config encryption:** Provider API keys encrypted at rest using existing AES-256-GCM pattern from `src/encryption.ts`. Same `ENCRYPTION_MASTER_KEY` + per-tenant HMAC-SHA256 key derivation. Encrypt on write, decrypt on read in `registry.ts`. API responses show `hasApiKey: boolean` only.
4. **Q4 — Existing data backfill:** Confirmed Keaton's recommendation — migration defaults handle it. No change needed.

**Work Breakdown Impact:**
- F-MT4 split into F-MT4a (admin_users migration) and F-MT4b (admin login endpoint + JWT middleware + seed script)
- F-MT5 updated to include hard DELETE with cascade
- F-MT6 updated to include `?permanent=true` hard delete for API keys
- F-MT7 updated to include AES-256-GCM encryption/decryption of provider API keys
- H-MT1 expanded to cover JWT auth testing (login, validation, expiry)
- Critical path shifted to F-MT4a → F-MT4b → F-MT5 → F-MT8
- Wave structure preserved (4 waves), task count increased slightly

**Key Lesson:** Per-user admin auth with JWT is the right call for Phase 1 — it's barely more complex than a shared env var but eliminates the "who did this?" blindspot and prepares the path for Phase 2 RBAC. Bcrypt is fine for admin login because it's not on the gateway hot path.

## 2026-02-25T10:20:10Z: Multi-Tenant Wave A Design Finalization

**Event:** Final multi-tenant design document approved and merged to decisions.md  
**Status:** ✅ Complete, ready for implementation wave execution

**What was finalized:**

1. **Complete Design Document** — Full API surface, schema migrations, auth patterns, work breakdown, risk analysis documented in `.squad/decisions.md`
2. **Michael's Q&A Incorporated** — All 4 open questions answered and design revised accordingly
3. **Implementation Ready** — Backend (Fenster), frontend (McManus), and testing (Hockney) work breakdown finalized across 4 waves

**Design Highlights:**

- **Multi-tenant model:** API key-based tenancy with per-tenant provider config, status lifecycle
- **Admin interface:** Per-user JWT auth (not shared secret), dedicated `/admin` route/page, separate from operator tenant interface
- **Lifecycle management:** Soft deactivation (status: inactive) + hard delete with confirmation guards (`?confirm=true`, `?permanent=true`)
- **Security:** Provider API keys encrypted at rest (reuses existing AES-256-GCM infrastructure)
- **API coverage:** 11 admin endpoints across tenant CRUD, API key management, provider config management
- **Database:** 3 migrations (F-MT1, F-MT2, F-MT4a) adding status/lifecycle columns and admin_users table

**Work Breakdown:**
- **Backend:** 8 tasks (Fenster) F-MT1 through F-MT8
- **Frontend:** 6 tasks (McManus) M-MT1 through M-MT6
- **Testing:** 5 tasks (Hockney) H-MT1 through H-MT5
- **Critical path:** F-MT4a → F-MT4b → F-MT5 → F-MT8
- **Execution:** 4 waves (A through D)

**Risks Identified (managed):**
- LRU cache invalidation on key revocation (ID→hash lookup required, design documented)
- Admin routes share Fastify instance (acceptable Phase 1, note for Phase 2 service split)
- Hard delete cascade on large tenants (sync delete acceptable for expected volumes)
- JWT secret management (must be set at startup, fail loudly if missing)

**Deferred to Phase 2:** RBAC per admin user, tenant self-service registration, audit logging, rate limiting per tenant, multi-region routing

**Cross-Team Context:** Fenster implemented Wave A (migrations F-MT1, F-MT2 + startup check). Migrations provide schema foundation. Future waves unlock endpoint development (Wave B), admin UI (Waves C/D), and test coverage.

### Tenant Self-Service Portal Architecture (2025-07-24)

**Request:** Michael Brown asked for a tenant self-service portal — landing page at root, signup/login, and a UI for managing gateway settings (LLM provider config, API keys).

**Decision:** Full architecture spec written to `.squad/decisions/inbox/keaton-tenant-portal-architecture.md`.

**Key decisions:**
- Separate Vite+React app in `portal/` (not extending dashboard — different audience, different auth)
- New `tenant_users` table (email, password_hash, tenant_id, role). Email globally unique. Scrypt hashing.
- Portal API at `/v1/portal/*` with its own JWT (`PORTAL_JWT_SECRET`, separate from admin JWT)
- Dual `@fastify/jwt` registration using `namespace`/`decoratorName` to isolate admin vs portal tokens
- Signup creates tenant + owner user + auto-generated API key in a single transaction
- Portal static files served at `/` with SPA fallback for non-API, non-dashboard routes
- Provider config management reuses existing encryption (`ENCRYPTION_MASTER_KEY`) and cache eviction patterns
- Auth skip list in `src/auth.ts` updated to bypass API key auth for `/v1/portal/*` routes

**Gotchas flagged:**
- `@fastify/static` decorator collision (need `decorateReply: false` on second registration)
- SPA fallback ordering (must not catch `/v1/*` 404s as HTML)
- Email uniqueness = one user per tenant (simple now, junction table refactor if multi-tenant-per-user needed later)
- Rate limiting on signup/login deferred but noted as TODO
