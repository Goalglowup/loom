# Decision: Conversations & Memory Backend

**Date:** 2026-02-28  
**Author:** Fenster (Backend Dev)  
**Status:** Implemented

## What Was Built

Full backend implementation of conversations & memory for the Loom gateway:

- **Migration `1000000000014`**: Four new tables (`partitions`, `conversations`, `conversation_messages`, `conversation_snapshots`) + three agent columns (`conversations_enabled`, `conversation_token_limit`, `conversation_summary_model`).
- **`src/conversations.ts`**: `ConversationManager` module with partition/conversation lifecycle, encrypted context loading, message storage, and LLM snapshot creation.
- **`src/auth.ts`**: `TenantContext` extended with `agentConfig` (conversation settings); `lookupTenant` query extended.
- **`src/index.ts`**: Conversation wiring in the `/v1/chat/completions` handler.
- **`src/routes/portal.ts`**: Six CRUD routes for partitions and conversations.

## Key Decisions

### Conversation ID is client-supplied or auto-generated
Clients may pass `conversation_id` as a top-level field. If omitted, the gateway auto-generates a UUID. The resolved ID is always returned in the response body (`conversation_id`) and `X-Loom-Conversation-ID` header. This lets stateless clients start threads without pre-registering anything.

### Partition root uniqueness via partial index
`UNIQUE (tenant_id, parent_id, external_id)` does not protect against duplicate root partitions (PostgreSQL treats two NULLs as distinct). A `CREATE UNIQUE INDEX … WHERE parent_id IS NULL` partial index is added alongside the constraint. Same pattern applied to `conversations` for null `partition_id`.

### Messages never deleted; snapshot_id marks archival
`conversation_messages` is an append-only permanent log. The `snapshot_id` column is set (via `UPDATE`) when a snapshot is created, marking those messages as "archived under that snapshot". `loadContext` only loads messages where `snapshot_id IS NULL` — i.e., post-latest-snapshot messages. This avoids timestamp-based range queries and makes the archival semantics explicit.

### Token estimation: `content.length / 4`
No tiktoken dependency. Character-count estimation (`/ 4`) is sufficient for triggering the summarisation threshold. The exact limit is configurable per agent via `conversation_token_limit`.

### Summarisation reuses the existing provider.proxy()
The summarisation LLM call uses the same `BaseProvider.proxy()` path as normal requests. The summary model defaults to the request model if `conversation_summary_model` is unset on the agent. Summarisation failures are caught and logged; the request proceeds with the full untruncated history as a fallback.

### Streaming: messages not stored yet
Conversation message storage only happens in the non-streaming JSON path. Streaming responses do not persist messages in this iteration. The SSE transform buffering required to support streaming conversations is deferred to a future wave.

### Portal routes use portal JWT (tenant-scoped)
All partition and conversation portal routes use the `authRequired` preHandler and are scoped to `request.portalUser.tenantId`. No cross-tenant data access is possible. Partition/conversation detail routes are accessible by UUID (internal), not by external_id, to prevent enumeration.

### Encryption
All message content and snapshot summaries are encrypted with `encryptTraceBody` / `decryptTraceBody` from `src/encryption.ts` (AES-256-GCM, per-tenant key derivation). Decryption failures in portal and loadContext are silently skipped (content returned as `null`) to avoid breaking the API when messages from a previous key version are present.
