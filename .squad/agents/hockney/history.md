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
