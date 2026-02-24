# Hockney's Project Knowledge

## Project Context

**Project:** Loom — AI runtime control plane  
**Owner:** Michael Brown  
**Stack:** Node.js + TypeScript  
**Description:** Provider-agnostic OpenAI-compatible proxy with auditability, structured trace recording, streaming support, multi-tenant architecture, and observability dashboard.

**QA/Testing Scope:**
- Test infrastructure and patterns
- Unit tests for backend components
- API contract testing
- Database schema validation
- Streaming and encryption validation
- Multi-tenant isolation testing

**Test Framework:** Vitest (native ESM, fast execution, Node.js 25+ compatible)

## Core Context — Waves 1–2 Summary

**Wave 1 (H1–H5) Test Infrastructure:**
- 61 tests established (16 auth, 12 provider, 18 streaming, 15 encryption)
- Database tests skip by default (TEST_DB_ENABLED=1 to enable)
- Port range 3001–3002 for mock servers
- `for await...of` async iteration pattern for undici Readable streams (not Web .getReader())
- fastify.inject() for in-process testing (no port allocation)

**Key Test Patterns:**
- Mocked pg.Pool with fixture keyed by API key SHA-256 hash
- Auth middleware validation: Bearer token extraction, tenant lookup, rate limiting
- Provider proxy tests: OpenAI adapter, header forwarding, error mapping, response parsing
- Streaming tests: SSE passthrough, latency tracking, error propagation
- Encryption tests: AES-256-GCM roundtrip, tenant isolation, tamper detection

**Encryption Validation:**
- 16 tests covering encryption/decryption with per-tenant key derivation
- IV uniqueness per encryption
- GCM authentication tag verification
- Tamper detection (modified ciphertext fails validation)

**Key Learnings:**
- vitest + Node.js Readable works seamlessly; Web API adaptation not needed
- fastify.inject() avoids port bind races and provides synchronous testing
- Mocked DB keeps tests fast (no PostgreSQL dependency)
- Fake timers with vi.advanceTimersByTimeAsync() for timer-based code

---

### 2026-02-24: Wave 3 Testing (H4, H6, H7)

**H4 — Multi-Tenant Isolation Tests (Issue #14)**
- 10 tests covering auth middleware multi-tenant behavior
- Key isolation: Different API keys cannot access other tenant's data
- Race conditions: Concurrent requests with different auth keys
- Pattern: fastify.inject() for in-process auth testing; mocked pg.Pool with fixture-keyed query()
- Auth middleware correctly validates tenant existence and isolation

**H6 — Streaming + Trace Recording Tests (Issue #16)**
- 7 tests covering SSE passthrough during trace recording
- Fire-and-forget pattern: Streaming doesn't wait for batch flush
- Batch timing: Records flush on interval or batch size threshold
- Pattern: vi.mock() with importOriginal preserves real TraceRecorder class while spying on singleton
- Streaming response correctly proxied while trace recording happens asynchronously

**H7 — Encryption-at-Rest Tests (Issue #17)**
- 7 tests covering per-tenant encryption key derivation and IV uniqueness
- AES-256-GCM success modes: Encryption/decryption roundtrip with 13-param INSERT
- AES-256-GCM failure modes: Tampered ciphertext, invalid IV, wrong key
- Pattern: INSERT parameter indices documented in IDX constant (maintainability if Fenster reorders params)
- Encryption-at-rest implementation solid: per-tenant keys, unique IVs, authentication tags

**Wave 3 Test Infrastructure:**
- All 24 new tests use fastify.inject() — no ports allocated
- Port range 3041+ remains available for future waves
- Total: 85 tests (61 existing + 24 new), 100% passing

**Status:** ✅ Complete — Issues #14, #16, #17 closed. All 85 tests passing.

## Learnings

- **fastify.inject() eliminates port flakiness**: Auth and streaming tests run in-process with deterministic timing, no port bind races
- **vi.mock with importOriginal for dual-purpose mocking**: Real class available for instantiation; exported singleton can be spied on separately. Single mock serves both batch + timer tests and SSE passthrough tests
- **INSERT parameter documentation prevents silent breaks**: If Fenster reorders INSERT params, test fails at the IDX constant layer (loudly), not silently in assertion values
- **Async iteration canonical for streaming tests**: `for await...of` works with Node.js Readable, Web ReadableStream, and any async iterable. Never use .getReader() with undici
- **Mocked pg.Pool keeps test feedback fast**: No PostgreSQL dependency; tests run in <500ms total; TEST_DB_ENABLED flag for schema validation when needed

## Wave 3 Cross-Agent Learnings

**From Fenster's backend (F8/F9/F10):**
- Analytics engine cost calculation correct; SQL CASE expressions work for GPT-3.5 and GPT-4o variants (both OpenAI + Azure naming)
- Dashboard API cursor pagination stable under concurrent writes; timestamp-based cursors working as expected
- Provider registry lazy caching correct; per-tenant baseUrl routing validates provider selection
- **Implication:** Backend APIs production-ready. All H4/H6/H7 tests validate APIs are working correctly.

**From McManus's dashboard (M2–M5):**
- Dashboard correctly calls all analytics endpoints; traces pagination integrates seamlessly with IntersectionObserver infinite scroll
- Time window selector shared state keeps summary cards and charts in sync across all time ranges
- localStorage API key prompt appears on first visit; Authorization header injection works for all API calls
- **Implication:** Full end-to-end integration working correctly. No auth or API contract issues.

**Test Coverage Status:** 85 tests (61 existing + 24 new Wave 3), 100% passing. All H4/H6/H7 test suites complete and green.
