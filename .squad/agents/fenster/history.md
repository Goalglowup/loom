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
