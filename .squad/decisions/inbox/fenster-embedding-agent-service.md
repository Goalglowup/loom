# Decision: EmbeddingAgent Service + System-Embedder Bootstrap

**By:** Fenster (Backend)  
**Date:** 2026-02-27  
**Status:** Implemented

## What

Created `src/services/EmbeddingAgentService.ts` — a service for resolving embedding agent configs and bootstrapping a system-wide default embedder at gateway startup.

## Key Decisions

### Config stored in `systemPrompt` as JSON
Embedding agents store their config (`provider`, `model`, `dimensions`) in the existing `systemPrompt` text field as JSON. No new DB columns needed.

### Resolution order in `resolveEmbedder()`
1. Named `agentRef` → look up agent by name + tenantId with `kind='embedding'`, parse systemPrompt
2. No ref → fall back to `SYSTEM_EMBEDDER_PROVIDER` + `SYSTEM_EMBEDDER_MODEL` env vars
3. Neither → throw

### Upsert semantics for `bootstrapSystemEmbedder()`
- Create agent if no `system-embedder` exists for tenant
- Update `systemPrompt` only if config has changed (diff check before flush)
- Uses `em.findOne` + conditional persist/update pattern (no raw SQL needed)

### Startup hook uses separate `orm.em.fork()`
The bootstrap runs on a fresh entity manager fork to avoid polluting the main request-lifecycle `em` identity map.

### `kind` schema fix included
Pre-existing build failure: `Agent.schema.ts` was missing the `kind` property added to the Agent entity. Fixed as part of this work since `resolveEmbedder` queries by `kind`. Similarly fixed `ApiKey.schema.ts` missing `rawKey: { type: 'string', persist: false }`.

## Impact
- Gateway automatically provisions `system-embedder` agents for all active tenants on startup when env vars are configured
- `resolveEmbedder()` is the single entry point for any code needing embedding config (KnowledgeBase ingestion, retrieval, etc.)
- No migration needed — config stored in existing `system_prompt` column
