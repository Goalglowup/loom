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

## 2026-02-24T03:31:15Z: Wave 1 Encryption Launch Spawn

**Event:** Spawned for encryption infrastructure Phase 1  
**Task:** Write encryption validation tests  
**Mode:** Background  
**Coordination:** Part of 4-agent wave (Keaton sync, Fenster/McManus/Hockney background)
