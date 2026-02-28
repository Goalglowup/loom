# Sandbox Conversation Support

**Date:** 2026-02-28  
**Context:** Adding conversation memory support to the portal's sandbox chat endpoint

## Decision

Implement conversation memory in the sandbox chat route (`POST /v1/portal/agents/:id/chat`) following the same pattern as the main gateway, with these specific choices:

### 1. Non-Fatal Error Handling

Conversation load failures are caught and logged but do not fail the HTTP request. The endpoint proceeds without memory if conversation loading fails.

**Rationale:**
- Sandbox is for testing/exploration — better to succeed without memory than fail entirely
- Matches gateway behavior for resilience
- Provider errors are more critical than memory errors in this context

### 2. Fire-and-Forget Message Storage

`storeMessages()` is called after sending the HTTP response with `.catch()` to log errors asynchronously.

**Rationale:**
- Keeps response latency low (same as tracing)
- Storage failures shouldn't block user-facing response
- Matches gateway pattern for consistency

### 3. Server-Side History Loading

Unlike the basic chat example (which sends full `conversationHistory` array), the sandbox chat accepts a single message and loads history server-side.

**Rationale:**
- Reduces request payload size
- Server is source of truth for conversation state
- Prevents client/server desync
- Matches gateway conversation API contract

### 4. Default Partition: `__sandbox__`

When `partition_id` is not provided, the sandbox uses `__sandbox__` as the default partition scope.

**Rationale:**
- Provides namespace isolation from production conversations
- Clear semantic distinction (sandbox vs. real use)
- Prevents accidental mixing of test and production data

### 5. Conversation ID Generation

Unlike the gateway (which auto-generates conversation_id if omitted), the sandbox **requires** the client to provide `conversation_id` to enable memory.

**Rationale:**
- Sandbox is a testing tool — explicit is better than implicit
- Forces developers to understand the conversation_id contract
- Gateway handles auto-generation for production simplicity; sandbox teaches the API

## Alternatives Considered

### Gateway-style auto-generation in sandbox
- **Rejected:** Sandbox should be more explicit to aid learning
- The example HTML demonstrates both patterns (blank = new, provided = continue)

### Separate conversation API
- **Rejected:** Would duplicate code and complicate the agent abstraction
- Reusing `conversationManager` keeps consistency with gateway

### Synchronous message storage
- **Rejected:** Would increase response latency significantly (2+ DB writes)
- Fire-and-forget is proven pattern in gateway and tracing

## Impact

- Portal sandbox chat can now test conversation memory features
- Developers can validate conversation_id/partition_id behavior before production
- `examples/conversations/index.html` provides working reference implementation
- No breaking changes to existing sandbox chat API (all new fields are optional)
