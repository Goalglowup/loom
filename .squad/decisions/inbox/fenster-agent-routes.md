# Agent & Subtenant Portal Routes: Backend Decisions

**Author:** Fenster (Backend Dev)  
**Date:** 2026-02-28

## Decision 1: Agent providerConfig uses same encrypt-on-write / sanitize-on-read as tenant providerConfig

**Context:** Agents have their own `provider_config` JSONB field which may contain an API key. The task required "same sanitization/transformation as existing tenant provider_config handling."

**Decision:** `prepareAgentProviderConfig()` encrypts any plain `apiKey` string using `encryptTraceBody()` before writing to DB (same AES-256-GCM pattern as `/settings`). `sanitizeAgentProviderConfig()` strips the raw key and exposes only `hasApiKey: boolean` in responses (same as `/me`).

**Rationale:** Consistency with existing pattern. API keys never leave the server in plaintext.

## Decision 2: GET/PUT/resolved agent endpoints verify membership via JOIN, not tenantId equality

**Context:** The task says "must be member of agent's tenant." Agents belong to a specific tenant_id; users can be members of multiple tenants.

**Decision:** Auth check uses `JOIN tenant_memberships tm ON tm.tenant_id = a.tenant_id WHERE a.id = $id AND tm.user_id = $userId` rather than `WHERE a.id = $id AND a.tenant_id = $currentTenantId`.

**Rationale:** Allows users to access agents from any of their tenant memberships, not just the currently active JWT tenant. This is more permissive and useful for multi-tenant users, and matches the spirit of "must be member of agent's tenant."

## Decision 3: PUT uses dynamic SET clause builder

**Context:** Partial update: any subset of agent fields may be supplied.

**Decision:** Build `setClauses[]` and `values[]` arrays dynamically with an incrementing `idx`. `updated_at = now()` is always included. `WHERE id = $N AND tenant_id = $N+1` appended last.

**Rationale:** Avoids coalescing (which would silently ignore null inputs) and avoids separate read-then-write. Clean parameterized SQL with no injection risk.

## Decision 4: resolved endpoint does JS-layer inheritance, not SQL COALESCE chain

**Context:** Inheritance rules: first-non-null for providerConfig/systemPrompt, union for skills/mcpEndpoints, agent-only for mergePolicies.

**Decision:** Fetch agent row + recursive CTE for tenant chain (separate queries). Apply inheritance logic in TypeScript: iterate chain for first-non-null, use JSON.stringify-keyed Set for deduplication of union arrays.

**Rationale:** The mixed inheritance semantics (first-non-null vs. union) are cleaner to express in application code than in a single SQL expression. The tenant chain is typically short (depth 1-5), so the JS overhead is negligible.

## Decision 5: POST /v1/portal/subtenants wraps in transaction

**Context:** Creating a subtenant requires both inserting into `tenants` and inserting the owner's `tenant_memberships` row.

**Decision:** Wrapped in explicit `BEGIN/COMMIT/ROLLBACK` transaction to ensure atomicity.

**Rationale:** If the membership insert fails, we don't want an orphaned tenant with no owner. Consistent with existing signup transaction pattern.

## Decision 6: GET /v1/portal/me extended with Promise.all

**Context:** `/me` now needs agents and subtenants data in addition to existing user/tenant/tenants data.

**Decision:** Two new parallel queries (`agents` for current tenant, `subtenants` via parent_id) run via `Promise.all`. Agents returned as `{id, name}` only (lightweight). Subtenants as `{id, name, status}`.

**Rationale:** Parallel queries reduce latency. Minimal agent fields on /me keeps the response lightweight; full agent data available via dedicated `/agents` endpoint.
