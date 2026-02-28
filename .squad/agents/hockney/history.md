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

### 2026-02-25: Wave 5 — Agent-scoped API Keys & New Page Smoke Tests

**Changes made:**
- Updated `portal-app.smoke.ts` "API key can be created" test to handle the new agent dropdown in `ApiKeysPage`. The `+ New key` button now opens a form with a required `<select>` for agent selection and a name input. Since signup seeds a Default agent, the select is pre-populated; the test waits for `select[required]` to confirm agents loaded, fills the key name input, then submits.
- Created `tests/smoke/portal-agents.smoke.ts` with 6 tests covering: navigate to Agents page, create an agent (via `+ New Agent` → `AgentEditor` form → `Create agent` submit), agent appears in list, navigate to Subtenants page, create a subtenant (via `+ Create Subtenant` → name input → `Create` submit), subtenant appears in list.

**Key Learnings:**
- **Agent select pre-selection**: `ApiKeysPage` calls `fetchAgents()` on mount and pre-selects the first agent via `setSelectedAgentId(agents[0].id)`. Tests don't need to interact with the select — just wait for it to confirm agents loaded, then fill the name and submit.
- **Default agent always present**: The migration seeds a "Default" agent for every new tenant, so API key creation works immediately after signup without additional setup steps.
- **AgentEditor submit button text**: In create mode the submit button says "Create agent" (vs "Save changes" in edit mode). XPath `//button[@type="submit"][contains(., "Create agent")]` is reliable.
- **Sequential page-source checks**: After create actions, reusing `driver.getPageSource()` in the following test (without re-navigating) is valid because the tests run serially in `singleFork` mode and the page is still the same `/app/agents` or `/app/subtenants` route.

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

---

### 2026-02-25: Wave 4 — Multi-Tenant Admin API Testing (H-MT1 through H-MT5)

**H-MT1 — Admin Auth Middleware (6 tests)**
- JWT-based authentication for admin routes
- Login endpoint validation: valid/invalid credentials, unknown user
- Protected route middleware: missing token, invalid token, expired token
- Pattern: scrypt password hashing matches migration format (salt:derivedKey)

**H-MT2 — Tenant CRUD (10 tests)**
- Create tenant: name validation, 201 response
- List tenants: pagination, status filtering (active/inactive)
- Get tenant: provider config summary, API key count, 404 handling
- Update tenant: name change, status deactivation
- Hard delete: confirm=true requirement

**H-MT3 — API Key Management (5 tests)**
- Create API key: raw key returned once, key_prefix stored
- List API keys: key_hash never exposed, prefix shown
- Revoke key (soft delete): status='revoked', revoked_at timestamp
- Hard delete key: permanent=true removes row
- 404 handling for non-existent tenant

**H-MT4 — Provider Config (4 tests)**
- Set provider config: apiKey encryption, hasApiKey flag
- Provider config sanitization: raw apiKey never in response
- Remove provider config: DELETE returns 204
- Get tenant after removal: providerConfig=null

**H-MT5 — Auth Regression (3 tests)**
- Active key + active tenant: proxy auth passes (200/500, not 401/403)
- Active key + inactive tenant: 401 rejection
- Revoked key + active tenant: 401 rejection
- Pattern: invalidateCachedKey() between tests to avoid LRU cache contamination

**Key Learnings:**
- **Module-level singleton caching requires explicit invalidation**: auth.ts LRU cache persists across Fastify instances in tests. Must call invalidateCachedKey() in beforeEach to prevent cross-test contamination
- **Dynamic query param ordering in mocks**: When UPDATE queries build param arrays conditionally (name, status), mock must parse SQL to determine which fields are present and map params correctly
- **Multi-space SQL formatting in mocks**: Auth queries have inconsistent whitespace (FROM   api_keys vs FROM api_keys). Mock checks must be flexible with OR conditions
- **Admin routes need /v1/chat/completions stub**: H-MT5 regression tests hit proxy endpoint. Must register minimal stub route in test app to validate auth middleware

**Test Infrastructure:**
- 28 new tests (H-MT1: 6, H-MT2: 10, H-MT3: 5, H-MT4: 4, H-MT5: 3)
- All tests use fastify.inject() for in-process testing
- Mocked pg.Pool with 15+ query patterns covering admin routes + auth middleware
- Total: 113 tests (85 existing + 28 new), 100% passing

**Status:** ✅ Complete — All H-MT1 through H-MT5 tests passing. Admin backend API fully validated.

## 2026-02-25T10:39:35Z: Multi-Tenant Admin Feature Complete

**Summary:** All integration tests for Phase 1 multi-tenant management complete. 28 new tests added, 113 total suite (100% passing).

**Wave Completion:**
- ✅ H-MT1: Admin auth middleware tests (6 tests) — JWT verification, bearer tokens, 401 handling
- ✅ H-MT2: Tenant CRUD tests (10 tests) — create, list, detail, update, delete with cache validation
- ✅ H-MT3: API key management tests (5 tests) — create, list, soft revoke, hard delete
- ✅ H-MT4: Provider config tests (4 tests) — CRUD with encryption simulation
- ✅ H-MT5: Auth regression tests (3 tests) — revoked keys, inactive tenants, cache invalidation

**Key Achievements:**
- Comprehensive integration test coverage for all 10 admin endpoints
- Mocked pg.Pool with 15+ query handlers covers complete admin API surface
- Cache invalidation behavior explicitly validated (critical learning)
- No PostgreSQL dependency; all tests run in <2s total
- 100% test pass rate with no breaking changes to existing tests

**Test Insights:**
- **Cache Invalidation Discovery:** Module-level LRU cache singleton persists across test runs. H-MT5 regression tests failed because first test cached values, subsequent tests with modified mock data still read stale cache. Solution: call `invalidateCachedKey()` in beforeEach for auth regression suite. Implication: future test authors must explicitly clear cache for auth regression scenarios (not obvious, documented for team).
- **Dynamic SQL Parameter Mapping:** Admin CRUD updates build param arrays conditionally (name, status fields). Mock pg.Pool must parse SQL to determine which params are present and map correctly. Pattern: check presence of each field in SET clause, advance paramIndex accordingly.
- **Multi-Space SQL Formatting:** Auth queries have inconsistent whitespace in FROM clauses. Mock checks use flexible matching with OR conditions to handle variations.

**Admin Routes Testing Gap Identified:**
- No dedicated health check endpoint (`GET /v1/admin/health`)
- All routes except login require JWT auth
- **Observation:** No easy smoke test for "is admin API alive?"
- **Recommendation:** Consider adding health endpoint in Phase 2 for monitoring/load balancer checks

**Test Architecture:**
- Fastify test app with mocked pg.Pool (no real database)
- fastify.inject() for in-process HTTP simulation
- Covers: admin user login validation, tenant CRUD lifecycle, API key soft/hard delete, provider config encryption round-trip, auth rejection scenarios
- Cache invalidation helpers integrated in test lifecycle

**Build Status:**
- ✅ npm test — all 113 tests passing
- ✅ No breaking changes to existing test suites
- ✅ All admin API contracts validated

**Quality Metrics:**
- **Coverage:** 28 new tests across auth, CRUD, encryption, regression scenarios
- **Execution Time:** <2s for all 113 tests (in-process, no real DB)
- **Pass Rate:** 100% (no flaky tests)
- **Maintainability:** Mock pg.Pool approach proven; clear query handler patterns for future test additions

**Phase 2 Readiness:**
- Test patterns established for future admin features (RBAC, audit logging, usage limits)
- Cache invalidation testing methodology proven; can extend to other entities
- Integration test infrastructure handles complex mocking scenarios (encryption, status transitions)

## Learnings

### 2026-XX-XX: Playwright Migration (Selenium → Playwright)

**Changes made:**
- Removed `selenium-webdriver` and `chromedriver` from devDependencies; added `playwright` (not `@playwright/test` — kept Vitest as runner)
- Rewrote `tests/smoke/helpers.ts` entirely: `chromium.launch()` + `browser.newContext()` + `context.newPage()` replace `Builder().forBrowser('chrome').build()`
- Rewrote all 6 smoke test files (`admin`, `portal-auth`, `portal-app`, `portal-agents`, `portal-tenant`, `portal-invite`) replacing all Selenium patterns with Playwright equivalents
- Added `screenshotIfDocsMode()` helper that captures screenshots + JSON metadata only when `DOCS_MODE=true`
- Created `scripts/generate-ui-docs.ts` — reads JSON metadata from `docs/screenshots/` and assembles `docs/ui-reference.md`
- Added `docs:screenshots`, `docs:generate`, `docs:build` npm scripts
- Created `docs/` directory with `.gitkeep`
- Updated `tests/smoke/README.md` to document Playwright setup and docs generation

**Key Translation Patterns:**
- `driver = buildDriver()` → `browser = await launchBrowser(); page = await newPage(browser)`
- `driver.quit()` → `await browser.close()`
- `driver.get(url)` → `page.goto(url)`
- `driver.findElement(By.css(sel)).click()` → `page.locator(sel).click()`
- `driver.findElement(By.css(sel)).sendKeys(text)` → `page.locator(sel).fill(text)`
- `driver.wait(until.elementLocated(...))` → removed (Playwright auto-waits)
- `driver.getCurrentUrl()` → `page.url()`
- `driver.getPageSource()` → `page.content()`
- `driver.executeScript('localStorage.clear()')` → `page.evaluate(() => { localStorage.clear(); })`
- `driver.sleep(ms)` → `page.waitForTimeout(ms)`
- `By.xpath('//*[contains(text(), "X")]')` → `page.locator(':text("X")')`
- `element.getAttribute('value')` → `locator.getAttribute('value')`
- `driver.findElements(By.css(sel)).length` → `page.locator(sel).count()`

**portalSignup overload:** Added function overloads so existing callers using `(page, email, password, tenantName)` positional signature still work alongside the new object-based `{ email, password, tenantName }` signature from the spec.

**acceptInvite kept in helpers:** `portal-tenant.smoke.ts` and `portal-invite.smoke.ts` both import `acceptInvite`. Added Playwright version alongside the other login helpers.

**DOCS_MODE pipeline:** `screenshotIfDocsMode` is gated by `DOCS_MODE=true` env var — zero overhead in normal test runs. Screenshots saved as PNG + JSON metadata sidecar. `generate-ui-docs.ts` groups by section and emits Markdown with relative image paths.

**Build:** `npm run build` (tsc) passes cleanly. Smoke test files type-check without errors.

### 2025-present: Sandbox + Analytics Empty-State Smoke Tests

**portal-app.smoke.ts — analytics empty-state assertions:**
- "analytics page renders summary cards": Added assertions for 9 `.card-value--empty` elements each containing text `—` (confirms AnalyticsSummary renders empty state for fresh accounts).
- "analytics page renders charts": Added assertions for 4 `.chart-no-data` elements containing "No data available" (confirms TimeseriesCharts renders chart empty state when no data exists).
- Existing content regex assertions preserved; new assertions added after them.

**portal-sandbox.smoke.ts — new smoke test file:**
- Fresh signup + agent creation in `beforeAll` (pattern from portal-agents.smoke.ts).
- Sandbox page load, agent selection via `button:has-text(agentName)`, model change via `input[placeholder="e.g. gpt-4o"]` with triple-click + fill.
- Chat send via `input[placeholder="Type a message…"]` + `press('Enter')`.
- Assistant response detection: `page.locator('.bg-gray-800.text-gray-100').waitFor({ state: 'visible', timeout: 15000 })` — works because the "thinking…" indicator uses `.text-gray-400` not `.text-gray-100`, so only real assistant messages match.
- Traces check: navigate to `/app/traces`, verify agent name appears in page content.
- Analytics after-data check: assert `.card-value--empty` count is 0, with fallback to check first `.card-value` is not `—`.

**Key DOM facts learned:**
- SandboxPage sidebar uses `<button>` elements (not `<p>`) for agent selection.
- ModelCombobox input placeholder: `"e.g. gpt-4o"`.
- Chat input placeholder: `"Type a message…"` (with ellipsis character `…` not `...`).
- Loading indicator: `.animate-pulse` with class `text-gray-400`; assistant messages: `.bg-gray-800.text-gray-100`.
