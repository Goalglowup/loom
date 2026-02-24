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

### Key File Paths
- PRD: /Users/michaelbrown/projects/loom/Loom_PRD_v0.1.pdf
- Team decisions: /Users/michaelbrown/projects/loom/.squad/decisions.md
- Architecture proposal (original): /Users/michaelbrown/projects/loom/.squad/decisions/inbox/keaton-architecture-proposal.md
- Architecture decision (approved): /Users/michaelbrown/projects/loom/.squad/decisions/inbox/keaton-architecture-approved.md
