# Decision: Subtenant Hierarchy + Agents Migration

**Date:** 2026-02-27  
**Author:** Fenster (Backend Dev)  
**Migration:** `migrations/1000000000012_subtenant-hierarchy-and-agents.cjs`

## Context

The product requires a subtenant hierarchy (tenants can have a parent tenant) and a configurable agent system. Each tenant can define named agents with their own provider config, system prompt, skills, and MCP endpoints. API keys must be bound to a specific agent. Traces record which agent handled them.

## Decisions

### 1. `agents.merge_policies` is NOT NULL with application-level default

Every agent row must have a merge policy so the gateway can always resolve inherited config without null-checks. The default `{"system_prompt":"prepend","skills":"merge","mcp_endpoints":"merge"}` is baked into the column default so new inserts that omit the field are safe.

### 2. Seed a "Default" agent for every existing tenant before NOT NULL on `api_keys.agent_id`

The three-step pattern (add nullable → UPDATE → SET NOT NULL) is used to safely add `api_keys.agent_id` as non-nullable without a column default that would persist on future rows. A "Default" agent is seeded per tenant so the UPDATE can always find a match.

### 3. `api_keys.agent_id` is NOT NULL

Every API key must be bound to an agent. This is enforced at the DB level, not just application level, to prevent orphaned keys from bypassing agent-scoped access controls.

### 4. `traces.agent_id` is nullable

Existing trace rows pre-date the agents feature and will have `NULL` agent_id. Making it nullable avoids a full-table backfill and preserves historical data integrity.

### 5. `tenants.parent_id` uses ON DELETE CASCADE

Deleting a parent tenant cascades to all child subtenants. This matches the expected product behavior: a parent tenant owns its subtenant tree.

### 6. Down migration drops in strict reverse FK order

`traces.agent_id` → `api_keys.agent_id` → `agents` table → `tenants` columns. This order satisfies all FK dependencies and allows a clean rollback.

## Alternatives Considered

- **Separate `subtenant_links` join table** instead of `parent_id` on `tenants`: rejected — a direct self-FK is simpler for the single-parent hierarchy we need. Multi-parent graphs are not a requirement.
- **Per-tenant agent count unlimited** vs. a single required agent: we chose unlimited (no DB constraint on count) with one seeded Default to satisfy the NOT NULL on `api_keys`.
