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
