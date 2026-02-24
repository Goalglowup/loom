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

## Learnings

### 2026-02-24: Wave 1 Implementation (F1, F2, F4)

**Architecture Decisions:**
- Fastify as HTTP framework (lightweight, fast, good TypeScript support)
- undici as HTTP client for upstream provider requests (modern, performant)
- node-pg-migrate for database migrations (simple, flexible)
- PostgreSQL native partitioning for traces table (partitioned by month for efficient querying and retention management)
- Provider abstraction with BaseProvider interface for multi-provider support

**Key File Paths:**
- `/src/index.ts` - Main Fastify server with health and chat completions endpoints
- `/src/providers/base.ts` - Provider abstraction interface
- `/src/providers/openai.ts` - OpenAI provider implementation
- `/src/types/openai.ts` - TypeScript types for OpenAI API
- `/migrations/*.cjs` - Database migration files (CommonJS for node-pg-migrate)
- `/docker-compose.yml` - PostgreSQL container for local development

**Database Schema:**
- `tenants` table: id (uuid), name, created_at
- `api_keys` table: id (uuid), tenant_id (fk), key_hash, created_at
- `traces` table (partitioned): id, tenant_id (fk), request_id, model, provider, endpoint, request_body (jsonb), response_body (jsonb), latency_ms, ttfb_ms, gateway_overhead_ms, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, created_at
- Traces partitioned by month with 4 initial partitions created

**Implementation Patterns:**
- Environment variable configuration (DATABASE_URL, OPENAI_API_KEY, PORT, HOST)
- Provider pattern for multi-provider abstraction
- Request/response proxying with header forwarding
- Stream handling for SSE responses
- Error handling with OpenAI-compatible error format

**User Preferences:**
- TypeScript strict mode enabled
- ESNext modules (import/export, .js extensions in imports)
- Minimal dependencies (no ORM, direct pg client usage planned)

**Status:**
- F1 (Project scaffold) ✅ Complete - Server runs, health endpoint works
- F2 (Database schema) ✅ Complete - Migrations created, schema designed per spec
- F4 (OpenAI adapter) ✅ Complete - Proxy endpoint implemented, tested without real API key

### 2026-02-24: Security Architecture — Tenant Data Encryption (Keaton approval)

**Impact on Backend (Fenster):**

**New Requirements for F2 Schema:**
- Add `request_iv` column (varchar(32)) to store initialization vector for request_body encryption
- Add `response_iv` column (varchar(32)) to store initialization vector for response_body encryption
- Add `encryption_key_version` column (integer DEFAULT 1) for Phase 2 key rotation support

**New Work for F7 (Encryption Implementation):**
- Create encryption utility module (`src/utils/encryption.ts`):
  - `encryptTraceBody(plaintext: string, tenantId: string): { ciphertext: string, iv: string }`
  - `decryptTraceBody(ciphertext: string, iv: string, tenantId: string): string`
  - Use node:crypto with AES-256-GCM (authenticated encryption)
  - Per-tenant key derivation from master key + tenant_id
  - Master key from environment variable (Phase 1); KMS integration deferred to Phase 2

- Update trace persistence path:
  - Encrypt request_body and response_body at INSERT time
  - Store ciphertext + IV in database
  - Off hot path — does not affect gateway latency (encryption overhead <0.01ms per trace)

- Update dashboard API read path:
  - Decrypt trace bodies on fetch for analytics/visualization
  - Decryption overhead ~0.01ms per trace; ~10ms for 1000-trace page load (acceptable for observability)

**Key Management Strategy (document in README or docs/security.md):**
- Phase 1: Application-level envelope encryption, environment variable master key
- Phase 2: Migrate to external KMS (AWS KMS recommended for Goal Glowup deployment)
- Phase 2: Implement key rotation with grace period for re-encryption
- Audit logging for all key access (Phase 2+)

**Performance Impact:** Negligible. AES-256-GCM on modern CPU: ~1-2 GB/sec; average trace: ~2KB; overhead <0.01ms per trace.

**Risk Assessment:** LOW. Standard encryption pattern, negligible performance impact, no identified blockers for Phase 1.

## 2026-02-24T03:31:15Z: Wave 1 Encryption Launch Spawn

**Event:** Spawned for encryption infrastructure Phase 1  
**Task:** Implement trace encryption module  
**Mode:** Background  
**Coordination:** Part of 4-agent wave (Keaton sync, Fenster/McManus/Hockney background)

### 2026-02-24: Trace Encryption Module Implementation (F7)

**Implementation:**
- Created `/src/encryption.ts` with AES-256-GCM encryption/decryption functions
- Per-tenant key derivation using HMAC-SHA256(masterKey, tenantId) pattern
- Master key from `ENCRYPTION_MASTER_KEY` environment variable (32 bytes hex)
- Unique 12-byte IV generated per encryption operation
- 16-byte GCM authentication tag appended to ciphertext
- Functions: `encryptTraceBody(tenantId, body)` returns `{ ciphertext, iv }`
- Functions: `decryptTraceBody(tenantId, encryptedBody, iv)` returns plaintext
- Comprehensive error handling for missing/invalid master key

**Testing:**
- Created `/tests/encryption.test.ts` with 16 unit tests
- All tests passing (393ms execution time)
- Coverage: encryption/decryption, tenant isolation, error cases, round-trip validation
- Validated typical trace request/response bodies
- Confirmed tamper-detection (GCM auth tag verification)

**Key Design Decisions:**
- AES-256-GCM: Industry-standard authenticated encryption (confidentiality + integrity)
- HMAC-SHA256 for key derivation: Simple, deterministic, secure tenant isolation
- IV stored alongside ciphertext: Standard practice (IV is not secret, must be unique)
- Hex encoding for storage: Simple PostgreSQL VARCHAR compatibility
- Node.js crypto module: Built-in, proven, no external dependencies

**Security Properties:**
- Tenant isolation: Each tenant has cryptographically isolated key
- Authenticated encryption: GCM provides both confidentiality and integrity
- Forward compatibility: `encryption_key_version` column ready for Phase 2 key rotation
- Fail-secure: Decryption throws on auth failure (tampered/corrupted data)

**Integration Points:**
- Next: Update trace persistence to call `encryptTraceBody()` before INSERT
- Next: Update dashboard API to call `decryptTraceBody()` on fetch
- Next: Migration adds `request_iv`, `response_iv`, `encryption_key_version` columns

**User Preferences Observed:**
- Prefer Node.js built-ins over external libraries (crypto module)
- Comprehensive inline documentation explaining cryptographic choices
- Security reasoning documented in code comments
- Test coverage for security properties (tenant isolation, tamper detection)

### 2026-02-24: Wave 2 Implementation (F3, F5, F6)

**F3 — Tenant Auth Middleware (`src/auth.ts`)**
- API key extracted from `Authorization: Bearer <key>` or `x-api-key` header
- Keys are SHA-256 hashed before DB lookup (never stored in plaintext)
- Map-based LRU cache (1000 slots) wraps DB queries; cache miss triggers single JOIN query on `api_keys ⋈ tenants`
- `TenantContext` (tenantId, name, providerConfig) attached to `request.tenant` for downstream use
- `/health` and `/dashboard/*` routes bypass auth (no-ops)
- `FastifyRequest` augmented via `declare module 'fastify'` — type-safe downstream access
- New migration `1000000000004` adds nullable `provider_config JSONB` column to tenants

**F5 — Azure OpenAI Adapter (`src/providers/azure.ts`)**
- Extends `BaseProvider`; uses deployment-based URL: `{endpoint}/openai/deployments/{deployment}/chat/completions?api-version=...`
- Auth via `api-key` header (not `Authorization: Bearer`)
- Streaming response: body stream passed through unchanged (same pattern as OpenAI provider)
- Non-streaming: Azure error envelope `{ error: { code, message, innerError } }` mapped to OpenAI shape `{ error: { message, type, code, param } }` with HTTP status → type mapping
- `AzureProviderConfig` extends `ProviderConfig` with `endpoint`, `deployment`, `apiVersion`

**F6 — SSE Streaming Proxy (`src/streaming.ts`)**
- `createSSEProxy(options)` returns a Node.js `Transform` stream
- **Push-before-parse**: each incoming `Buffer` chunk is forwarded to the output immediately, then parsed — client latency is never blocked by parsing
- Maintains `parseBuffer` to handle SSE events split across chunks
- Assembles `StreamCapture { content, chunks, usage }` from `delta.content` fields
- `onComplete(capture)` called in `flush()` when upstream closes — ready for encrypted trace storage
- Does not buffer the full response; true streaming pass-through

**Key Implementation Decisions:**
- LRU via plain `Map` (insertion order = LRU order); no new dependency needed
- SHA-256 key hash matches what migrations store in `api_keys.key_hash`
- AzureProvider is a standalone class — gateway selects provider at request time using `tenant.providerConfig`
- `[DONE]` sentinel in SSE is skipped cleanly (no JSON.parse attempt)

**Status:**
- F3 ✅ Complete — issues #1 closed
- F5 ✅ Complete — issues #2 closed
- F6 ✅ Complete — issues #3 closed

### 2026-02-24: Wave 2 Learnings — Undici Streaming Pattern

**Cross-Agent Note (from Hockney):**
When using undici for HTTP client requests with streaming responses, the response body is a Node.js `Readable` stream, NOT a Web `ReadableStream`. Testing streaming paths requires `for await...of` async iteration, NOT `.getReader()` (which will fail on Node.js 25+ with undici). This pattern is now canonical for all streaming tests in the codebase.

**Implementation Consequence for F6:**
The `createSSEProxy()` function receives undici response body as Node.js Readable. Using `node:stream` Transform over the Readable is the correct approach (no Web API adaptation needed). Fastify's `reply.send()` accepts Node.js streams natively, so this pattern is end-to-end consistent.
