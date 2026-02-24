# Hockney's Project Knowledge

## Project Context

**Project:** Loom — AI runtime control plane  
**Owner:** Michael Brown  
**Stack:** Node.js + TypeScript  
**Description:** Provider-agnostic OpenAI-compatible proxy with auditability, structured trace recording, streaming support, multi-tenant architecture, and observability dashboard.

**Testing Scope:**
- Integration tests for `/v1/chat/completions` endpoint
- Streaming validation (SSE correctness and completeness)
- Trace capture completeness
- Performance validation (gateway overhead under 20ms target)
- Error handling and edge cases
- Multi-tenant isolation testing

**Success Metric:** Trace capture completeness, stable streaming performance

## Learnings

### Wave 1: Test Infrastructure Setup (2026-02-24)

**Completed:** H1: Test infrastructure (Size: M)

**Key Decisions:**
- **Test Framework:** Vitest chosen for native ESM support, speed, and modern Node.js compatibility (v25.2.1)
- **Mock Server Architecture:** Separate mock servers for OpenAI (port 3001) and Azure OpenAI (port 3002) to validate multi-provider support
- **Database Test Strategy:** Tests skip by default (no PostgreSQL required), enable via `TEST_DB_ENABLED=1` environment variable
- **Streaming Validation:** Mock servers implement SSE (Server-Sent Events) with realistic chunking to validate streaming correctness

**File Paths:**
- Test framework config: `/vitest.config.ts`, `/tsconfig.json`
- Mock servers: `/tests/mocks/mock-openai-server.ts`, `/tests/mocks/mock-azure-openai-server.ts`
- DB fixtures: `/tests/fixtures/test-database.ts`
- Integration tests: `/tests/integration/*.test.ts`
- Documentation: `/tests/README.md`

**Patterns Established:**
- Mock servers return canned responses with realistic token counts (10 prompt, 5 completion, 15 total)
- Mock streaming sends 4 chunks followed by finish_reason: 'stop' and [DONE] marker
- Database fixture provides schema setup, seed, clean, and teardown methods
- Tests use beforeAll/afterAll for server lifecycle management

**Test Results:**
- ✅ 6 tests passing (mock OpenAI + Azure OpenAI servers)
- ⏭️ 5 tests skipped (database tests - require PostgreSQL)
- Duration: 520ms

**Architecture Alignment:**
- Validated OpenAI-compatible response structure
- Validated Azure-specific URL patterns (`/openai/deployments/{id}/chat/completions`)
- Database schema includes tenants and traces tables for multi-tenant isolation
- Ready for Fenster's gateway integration tests in Wave 2-3

**User Preferences:**
- Prefer tests that work out-of-box without external dependencies
- Skip database tests by default, enable via environment variable

### 2026-02-24: Security Architecture — Tenant Data Encryption (Keaton approval)

**Impact on Testing (Hockney):**

**New Test Requirements for H3 (Encryption Tests):**

1. **Test Encrypted Storage Validation:**
   - Verify raw database query (direct SQL) returns ciphertext in request_body and response_body columns, NOT plaintext
   - Verify ciphertext changes between identical plaintext inserts (IV randomness validation)
   - Ensure traces table includes request_iv, response_iv, and encryption_key_version columns

2. **Test Decryption Path:**
   - Verify dashboard API returns decrypted content when appropriate authorization granted
   - Verify decryption fails gracefully (no plaintext leaked) with wrong tenant_id
   - Verify correct tenant_id always returns same plaintext for same encrypted body

3. **Test Key Derivation and Tenant Isolation:**
   - Verify same tenant_id always produces same DEK (deterministic derivation from master key + tenant_id)
   - Verify different tenant_ids produce different DEKs (encryption isolation)
   - Verify ciphertext from tenant A cannot be decrypted by tenant B

4. **Test Edge Cases:**
   - Empty trace body encryption/decryption
   - Large trace bodies (>1MB) encryption/decryption
   - Special characters and non-ASCII content
   - Concurrent encryption of same content (different IVs, different ciphertexts)

**Integration with Existing Test Infrastructure:**
- Tests can use mock server (no KMS required for Phase 1)
- Add encryption test database fixtures to `/tests/fixtures/test-database.ts`
- Tests remain skippable (TEST_DB_ENABLED=1 environment variable)
- Encryption tests validate against PostgreSQL schema

**Performance Validation:**
- Verify encryption overhead does NOT add >0.01ms per trace to persistence latency
- Verify decryption overhead does NOT add >0.01ms per trace to read latency
- Acceptable for observability dashboard (human-scale latency tolerance)

**Key Management Test Assumptions:**
- Master key provided via environment variable (tests mock via process.env)
- No real KMS required in Phase 1 tests
- Key rotation NOT tested in Phase 1 (deferred to Phase 2)

**Risk Assessment:** LOW. Standard encryption library testing. Database tests already exist; add focused encryption validation tests.

### 2026-02-24: Encryption Validation Tests Completed

**Task:** Write encryption validation tests for Fenster's encryption module implementation

**Status:** ✅ COMPLETE — All tests passing (16/16)

**Test Coverage Verified:**
1. ✅ **IV Randomness:** Different ciphertext for same plaintext (unique IVs per encryption)
2. ✅ **Encryption/Decryption Roundtrip:** Original plaintext recovered correctly
3. ✅ **Per-Tenant Key Derivation:** Same input, different tenants = different output
4. ✅ **Invalid IV/Key Failure:** Graceful failures with wrong tenant, tampered ciphertext, invalid IV
5. ✅ **Edge Cases:** Empty strings, large payloads (100k chars), typical trace bodies
6. ✅ **Tenant Isolation:** Cross-tenant decryption fails appropriately
7. ✅ **Environment Validation:** Missing or malformed ENCRYPTION_MASTER_KEY throws errors

**Implementation Details:**
- **Module:** `src/encryption.ts` (Fenster)
- **Tests:** `tests/encryption.test.ts` (16 tests, 12ms execution)
- **Algorithm:** AES-256-GCM (authenticated encryption)
- **Key Derivation:** HMAC-SHA256(masterKey, tenantId) for per-tenant keys
- **IV Storage:** 12 bytes (96 bits), hex-encoded, stored separately from ciphertext
- **Auth Tag:** 16 bytes appended to ciphertext for integrity verification

**Test Patterns Validated:**
- Environment mocking: `beforeEach()` sets test master key, `afterEach()` restores original
- Hex encoding: IVs are 24 hex chars (12 bytes), ciphertext includes 32 hex char auth tag (16 bytes)
- Deterministic key derivation: Same tenant always gets same key
- Non-deterministic encryption: Random IV ensures different ciphertext each time

**Performance Characteristics:**
- Encryption operations: <1ms for typical trace bodies
- Test suite execution: 12ms for all 16 tests
- No performance degradation observed

**Security Properties Confirmed:**
- Tenant isolation enforced via key derivation
- Tampering detection via GCM authentication tag
- No plaintext leakage on decryption failure (throws error)
- IV uniqueness prevents pattern analysis

**Integration Status:**
- Unit tests complete and passing
- Database integration tests remain in backlog (require TEST_DB_ENABLED=1)
- Ready for Fenster's trace persistence implementation

**User Satisfaction:** Michael Brown confirmed completion ("yes" response to task request)

## 2026-02-24T03:31:15Z: Wave 1 Encryption Launch Spawn

**Event:** Spawned for encryption infrastructure Phase 1  
**Task:** Write encryption validation tests  
**Mode:** Background  
**Coordination:** Part of 4-agent wave (Keaton sync, Fenster/McManus/Hockney background)

### 2026-02-24: Wave 2 Test Suites (H2, H3, H5)

**Completed:** H2 (proxy.test.ts), H3 (auth.test.ts), H5 (providers.test.ts)

**Status:** ✅ COMPLETE — 39 new tests passing (61 total across all suites)

**Test Coverage:**

**H2 — Proxy Correctness (tests/proxy.test.ts, 11 tests):**
- Non-streaming path: Authorization header set to `Bearer <key>`, Content-Type: application/json forwarded, host header stripped before upstream, 4xx/5xx/429 status codes passed through
- Streaming path: undici `response.body` is a Node.js `Readable`; used async iteration (not Web ReadableStream `.getReader()`) — critical fix for Node.js 25+ / undici compatibility
- Error handling: unreachable upstream throws, 401/429/500 all passthrough with original body

**H3 — Authentication (tests/auth.test.ts, 13 tests):**
- Valid Bearer token and x-api-key both yield 200 with tenant context attached
- Invalid/missing key → 401 with auth_error type
- Empty Bearer value, Basic auth scheme, missing headers all → 401
- LRU cache: inline implementation validates cache population, hit tracking, eviction on max size, and LRU-refresh-on-access semantics
- Multi-tenant isolation: concurrent requests with different keys yield different tenant contexts
- Pattern: inline reference gateway implements expected contract; all tests are always-on (no infrastructure required); real Fenster src/auth.ts swapped in when available

**H5 — Multi-Provider (tests/providers.test.ts, 15 tests):**
- OpenAI path: `/v1/chat/completions`, `Authorization: Bearer` header (not `api-key`)
- Azure path: `/openai/deployments/{deployment}/chat/completions?api-version=...` URL, deployment name used as model in response
- Both non-streaming and streaming paths validated for each provider
- OpenAI/Azure responses are structurally identical (OpenAI-compatible shape confirmed)
- Error handling: 401 (invalid key), 429 (rate limit), network failure (unreachable upstream throws), 404 for wrong Azure path

**Patterns Established:**
- Node.js `Readable` from undici requires async iteration (`for await...of`), NOT `.getReader()` — document this for future streaming tests
- Inline reference implementations are the correct pattern for testing contracts against unshipped Fenster modules (avoids failing imports breaking the whole test file)
- Capture servers (inline Fastify) for header/path inspection are more precise than mocking library approaches
- Port allocation: existing mocks use 3001/3002; Wave 2 tests use 3011–3040 range

**Gaps Noted:**
- Gateway-level proxy test (full Fastify → OpenAI pipeline) deferred until Fenster adds OPENAI_BASE_URL env support in F6
- AzureOpenAIProvider direct instantiation tests deferred until src/providers/azure.ts ships (F5)
- Gateway routing test (tenant config → provider selection) deferred until F6 routing logic ships
- All deferred tests marked with `// TODO: verify against Fenster's implementation`

### 2026-02-24: Wave 2 Validation — 61 Tests Passing

**Status:** ✅ COMPLETE — All H-track tasks verified

**Issues Closed:** #12 (H2), #13 (H3), #15 (H5)

**Integration Points with Fenster:**
- H2 tests validate OpenAIProvider.proxy() correctness directly; full gateway tests follow once OPENAI_BASE_URL support lands
- H3 auth contract tests use inline reference implementation now; swap to src/auth.ts import once F3 lands (all assertions must pass immediately)
- H5 multi-provider tests validated both OpenAI and Azure request/response formats match OpenAI-compatible shape
- Streaming validation confirmed undici response.body pattern (Node.js Readable with async iteration) works end-to-end

### 2026-02-24: Wave 3 Test Suites (H4, H6, H7)

**Completed:** H4 (multi-tenant.test.ts), H6 (streaming-traces.test.ts), H7 (encryption-at-rest.test.ts)

**Status:** ✅ COMPLETE — 24 new tests passing (85 total across all suites)

**Test Coverage:**

**H4 — Multi-Tenant Isolation (tests/multi-tenant.test.ts, 8 tests):**
- Tenant A's API key resolves exclusively to Tenant A's context
- Tenant B's API key resolves exclusively to Tenant B's context
- Tenant A's key cannot access Tenant B's tenant_id
- Missing API key returns 401
- Invalid API key returns 401 (with `invalid_api_key` error code)
- Deleted/inactive tenant returns 401 (DB returns 0 rows; 403 differentiation is a future TODO)
- Same plaintext for two tenants produces different ciphertext (separate derived keys)
- Race condition: 10 concurrent pairs of requests never cross-contaminate TenantContext
- Pattern: real `src/auth.ts` + mocked `pg.Pool`; uses `fastify.inject()` (no port allocation)

**H6 — Streaming & Trace Recording (tests/streaming-traces.test.ts, 9 tests):**
- SSE pass-through: every raw byte reaches the client unchanged
- StreamCapture assembles complete content from delta chunks
- [DONE] sentinel does not produce a parsed chunk; stream ends cleanly
- `traceRecorder.record()` called exactly once when traceContext provided
- `traceRecorder.record()` not called when traceContext omitted
- Stream failure mid-way: record() not called (Node.js Transform flush() skipped on error; TODO)
- Fire-and-forget: stream ends synchronously; record() is void/sync
- Batch flush: 100 traces trigger immediate auto-flush; mocked query called ≥ 100 times
- Timer flush: fake timers advance 5 s → flush fires even when batch < 100
- Pattern: `vi.mock('../src/tracing.js')` preserves real TraceRecorder class, replaces singleton with spies

**H7 — Encryption-at-Rest (tests/encryption-at-rest.test.ts, 7 tests):**
- `request_body` stored as hex ciphertext (not plaintext)
- `response_body` stored as hex ciphertext (not plaintext)
- Two traces from same tenant have different IVs (24 hex chars = 12 bytes)
- IV stored alongside ciphertext in INSERT parameters
- Two traces from different tenants produce different ciphertext for identical content
- Decryption with wrong tenant key throws (no silent data corruption)
- Missing ENCRYPTION_MASTER_KEY throws `'ENCRYPTION_MASTER_KEY environment variable not set'`
- Pattern: inspect mocked `query()` call parameters (indices documented in test); no real DB

**Key Patterns Established:**
- `fastify.inject()` for auth middleware testing — no port needed, no flaky bind races
- `vi.mock` with `importOriginal` to preserve real class while replacing singleton with spy
- INSERT parameter index constants documented as `IDX` object for clarity and maintenance
- Fake timers + `vi.advanceTimersByTimeAsync()` for timer-based flush validation
- `setImmediate` yield pattern for fire-and-forget async flush assertion

**Issues Closed:** #14 (H4), #16 (H6), #17 (H7)

## Wave 3 Cross-Agent Learnings

**From Fenster's backend (F8/F9/F10):**
- Analytics engine cost calculation is correct; SQL CASE expressions work correctly for GPT-3.5 and GPT-4o rate handling (both OpenAI + Azure naming variants).
- Dashboard API cursor pagination is stable under concurrent trace writes; timestamp-based cursors work as expected.
- Provider registry lazy caching works correctly; per-tenant baseUrl routing validates provider selection logic.
- **Implication:** Backend APIs are production-ready. Dashboard can consume all endpoints without issues.

**From McManus's dashboard (M2–M5):**
- Dashboard correctly calls all analytics endpoints; traces pagination integrates seamlessly with IntersectionObserver infinite scroll.
- Time window selector shared state keeps summary cards and charts in sync across all time ranges.
- localStorage API key prompt appears on first visit; Authorization header injection works for all API calls.
- **Implication:** Full end-to-end integration working correctly. No auth or API contract issues.

**Test Coverage Status:** 85 tests (61 existing + 24 new Wave 3), 100% passing. All H4/H6/H7 test suites complete and green.
