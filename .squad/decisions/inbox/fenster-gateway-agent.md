# Decision: Agent-Aware Gateway Architecture

**Date:** 2026-02-26  
**Author:** Fenster (Backend Dev)  
**Status:** Implemented

## Context

Migration `1000000000012_subtenant-hierarchy-and-agents` has run. Every `api_keys` row now has a NOT NULL `agent_id` referencing an `agents` row. The `traces` table has a nullable `agent_id` column. The gateway needed to become agent-aware: resolve agent configuration, apply it to requests, route MCP tool calls, and record the agent on traces.

## Decisions

### 1. Two-query lookup (not one monolithic CTE)

**Decision:** Use a single JOIN query for `api_keys → agents → tenants` (immediate row only), then a separate recursive CTE query for the parent chain when `parent_id` is non-null.

**Rationale:** Combining them into one query with a lateral/recursive construct creates fragile SQL that's hard to reason about. Separating into two queries keeps each one simple and the parent chain query is skipped entirely for the common case (no parent tenant).

### 2. Chain resolution: ordered array + helper functions

**Decision:** Build a `chain[]` array (agent entry first, then immediate tenant, then parent chain rows) and resolve `provider_config`/`system_prompt` via `.find(non-null)`, and `skills`/`mcp_endpoints` via `resolveArrayChain()` (dedup by name, earlier wins).

**Rationale:** Clean, testable, and mirrors the spec exactly. Agent skills take precedence over tenant/parent skills on name conflict.

### 3. Provider registry cache by agentId + reverse tenantId index

**Decision:** `providerCache` keyed by `agentId` (falling back to `tenantId` when `agentId` is absent). A secondary `tenantIndex: Map<tenantId, Set<cacheKey>>` allows `evictProvider(tenantId)` to clear all agent-level provider instances for a tenant without changing the call signature used by admin routes.

**Rationale:** Correctness requires per-agent caching when agents can have their own `provider_config`. The reverse index preserves the existing `evictProvider(tenantId)` API used by admin routes — zero changes to callers.

### 4. MCP round-trip on non-streaming only

**Decision:** `handleMcpRoundTrip()` is called only on non-streaming (JSON) responses. Streaming responses are not eligible for MCP routing in this phase.

**Rationale:** Streaming + tool_calls requires buffering the full SSE stream before routing to MCP and re-streaming the follow-up response. This introduces significant complexity and latency. The common agentic pattern (tool use) is typically non-streaming. Phase 2 can add streaming MCP support if needed.

### 5. Merge policies applied at request-time in gateway

**Decision:** `applyAgentToRequest()` in `src/agent.ts` applies merge policies to the outbound request body before it reaches the provider. The original `request.body` is not mutated.

**Rationale:** Applying at gateway layer keeps providers clean (they see plain OpenAI-format requests). Immutability of `request.body` avoids surprising side effects in middleware or test code that may read the body.

### 6. agentId recorded on every trace

**Decision:** `agentId` added to `TraceInput`, `BatchRow`, and the INSERT. It is nullable for backward compatibility with existing rows.

**Rationale:** Agent-level analytics and audit require tracing which agent processed each request. The column is nullable so existing rows and any future defensive fallback paths don't break the INSERT.
