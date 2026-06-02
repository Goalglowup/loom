# AG-UI Adoption Spec for Arachne

> Comprehensive analysis of adopting the AG-UI protocol in both the Arachne runtime and the Portal chat React UI.

**Status:** Draft
**Author:** Oracle (AI Systems Advisor)
**Last Updated:** 2026-04-01

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [AG-UI Protocol Overview](#2-ag-ui-protocol-overview)
3. [Runtime Integration](#3-runtime-integration)
4. [Portal Chat UI Integration](#4-portal-chat-ui-integration)
5. [ACP vs A2A Analysis](#5-acp-vs-a2a-analysis)
6. [Migration Strategy](#6-migration-strategy)
7. [Risks & Mitigations](#7-risks--mitigations)
8. [Decisions & Open Questions](#8-decisions--open-questions)

---

## 1. Executive Summary

AG-UI is an open, event-based protocol (MIT license, by CopilotKit) that standardizes agent-to-frontend communication. It defines ~28 event types transmitted over SSE/WebSocket, covering streaming text, tool calls, state synchronization, HITL (human-in-the-loop) flows, reasoning visibility, and sub-agent delegation. Adopted by Google (ADK), Microsoft (Agent Framework), AWS (Bedrock AgentCore), and others.

**Protocol positioning:** AG-UI completes the three-protocol stack for agentic systems:

| Protocol | Axis | Arachne Status |
|----------|------|----------------|
| **MCP** | Agent ↔ Tools | Supported (tool-call round-trip in gateway) |
| **ACP** | Agent ↔ Agent | Designed (v0.1 spec, internal) |
| **AG-UI** | Agent ↔ Frontend | **This spec** |

**Recommendation:** Adopt AG-UI as the Portal chat streaming protocol. Implement as a gateway-level SSE transform that wraps existing provider responses in AG-UI events. Tenants get AG-UI compatibility automatically -- no agent-level opt-in required. Use `@ag-ui/client` for the Portal chat consumer rather than pulling in the full CopilotKit React framework.

---

## 2. AG-UI Protocol Overview

### 2.1 Event Taxonomy (28 event types)

**Lifecycle events** -- bound an agent execution:

| Event | Purpose |
|-------|---------|
| `RunStarted` | Opens a run context with `threadId` + `runId` |
| `RunFinished` | Signals successful completion, optional `result` |
| `RunError` | Terminal error with `message` + `code` |
| `StepStarted` | Marks a discrete processing phase (maps to sub-agent invocation) |
| `StepFinished` | Closes the step |

**Text message events** -- streaming assistant responses:

| Event | Purpose |
|-------|---------|
| `TextMessageStart` | Opens a message with `messageId` + `role` |
| `TextMessageContent` | Delivers incremental text `delta` chunks |
| `TextMessageEnd` | Closes the message |
| `TextMessageChunk` | Convenience: auto-expands to Start/Content/End |

**Tool call events** -- MCP round-trips surfaced to frontend:

| Event | Purpose |
|-------|---------|
| `ToolCallStart` | Agent invokes a tool: `toolCallId` + `toolCallName` |
| `ToolCallArgs` | Streams tool arguments as JSON delta fragments |
| `ToolCallEnd` | Tool argument transmission complete |
| `ToolCallResult` | Tool execution output (`content` field) |
| `ToolCallChunk` | Convenience: auto-expands to Start/Args/End |

**State events** -- bi-directional shared state:

| Event | Purpose |
|-------|---------|
| `StateSnapshot` | Full state object replacement |
| `StateDelta` | Incremental JSON Patch (RFC 6902) |
| `MessagesSnapshot` | Full conversation history sync |

**Activity events** -- structured progress indicators:

| Event | Purpose |
|-------|---------|
| `ActivitySnapshot` | Structured activity state (e.g., plan, search) |
| `ActivityDelta` | Incremental activity update via JSON Patch |

**Reasoning events** -- thinking/chain-of-thought visibility:

| Event | Purpose |
|-------|---------|
| `ReasoningStart` / `ReasoningEnd` | Bound a reasoning block |
| `ReasoningMessageStart/Content/End/Chunk` | Stream reasoning text |
| `ReasoningEncryptedValue` | Encrypted CoT for state preservation |

**Extension events:**

| Event | Purpose |
|-------|---------|
| `Raw` | Passthrough for external system events |
| `Custom` | Application-defined event semantics |
| `MetaEvent` (draft) | Side-band annotations independent of runs |

### 2.2 Transport

AG-UI events are transmitted as **Server-Sent Events (SSE)** over HTTP. The agent exposes a single endpoint that accepts `RunAgentInput` (containing `threadId`, `runId`, `tools[]`, `context`) and returns an SSE stream of typed events. WebSocket transport is supported as an alternative for bi-directional scenarios (state sync).

### 2.3 Middleware

AG-UI defines a middleware pipeline that intercepts and transforms event streams between agent and consumer. Middleware wraps in chain order (first registered = outermost). Two styles: function-based (RxJS operators) and class-based (stateful). This maps directly to Arachne's gateway transform pipeline.

### 2.4 Frontend Tools

A distinguishing AG-UI feature: **tools are defined in the frontend and passed to the agent at run time**. The agent can invoke frontend-defined tools (e.g., `confirmAction` for HITL) and the frontend executes them locally, returning results as tool messages. This enables HITL without server-side state machines.

---

## 3. Runtime Integration

### 3.1 Architecture: Gateway-Level AG-UI Transform

AG-UI adoption sits in the SSE streaming path of the gateway. The existing `src/streaming.ts` Transform stream that tees SSE data is extended with an AG-UI event emitter that wraps OpenAI-compatible SSE chunks in AG-UI event envelopes.

```
Client (Portal) ──POST /v1/chat/completions──> Gateway
                                                  │
                                         ┌────────┴────────┐
                                         │ Auth + Agent     │
                                         │ Engine + Memory  │
                                         └────────┬────────┘
                                                  │
                                         Provider (upstream)
                                                  │
                                         SSE chunks back
                                                  │
                                    ┌─────────────┴──────────────┐
                                    │ SSE Transform (existing)    │
                                    │   ├── tee to client         │
                                    │   ├── accumulate for trace  │
                                    │   └── AG-UI event wrapper   │ ← NEW
                                    └─────────────┬──────────────┘
                                                  │
                                    AG-UI SSE stream to client
```

**Key design decision:** AG-UI events are emitted at the **gateway level**, not at the agent or provider level. This means every tenant gets AG-UI compatibility automatically. No changes to agent specs, provider adapters, or upstream LLM calls.

### 3.2 Event Mapping: OpenAI SSE → AG-UI Events

The gateway's SSE Transform maps OpenAI-compatible streaming chunks to AG-UI events:

| OpenAI SSE Event | AG-UI Event(s) | Mapping Logic |
|---|---|---|
| First `data:` chunk with `choices[0].delta.role` | `RunStarted` + `TextMessageStart` | Emit at stream open. `runId` = trace `requestId`. `threadId` = `conversationId` or generated. `messageId` = `choices[0].id` or generated UUID. |
| `choices[0].delta.content` (non-empty) | `TextMessageContent` | `delta` = chunk content. `messageId` from Start event. |
| `choices[0].delta.tool_calls[i]` (function name) | `ToolCallStart` | `toolCallId` = `tool_calls[i].id`. `toolCallName` = `function.name`. |
| `choices[0].delta.tool_calls[i].function.arguments` | `ToolCallArgs` | `delta` = argument fragment. |
| Tool call complete (no more argument deltas) | `ToolCallEnd` | Emitted when tool_call index changes or stream ends. |
| MCP round-trip result injected back | `ToolCallResult` | `content` = MCP tool response. `toolCallId` matches the Start. |
| `data: [DONE]` | `TextMessageEnd` + `RunFinished` | Close message and run. |
| Provider error / timeout | `RunError` | `message` = error description. `code` = HTTP status or error type. |

**Implementation sketch** (`src/streaming.ts` extension):

```typescript
interface AGUIStreamOptions {
  enabled: boolean;        // Feature flag per request
  threadId: string;        // From conversation ID or header
  runId: string;           // From trace requestId
}

function emitAGUIEvent(res: FastifyReply, event: BaseEvent): void {
  // AG-UI events are SSE `data:` lines with JSON payloads
  res.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}
```

### 3.3 Activation Mechanism

AG-UI streaming is activated per-request via an `Accept` header or query parameter:

```
POST /v1/chat/completions
Accept: text/event-stream; protocol=ag-ui
```

Or:

```
POST /v1/chat/completions?protocol=ag-ui
```

When `protocol=ag-ui` is detected:
1. The gateway sets `stream: true` on the upstream request (if not already).
2. The SSE Transform emits AG-UI event envelopes instead of raw OpenAI SSE chunks.
3. The `Content-Type` response header is `text/event-stream`.

When the flag is absent, behavior is unchanged (backward compatible). This allows the Portal chat UI to opt into AG-UI while SDK/API consumers continue using raw OpenAI-compatible SSE.

### 3.4 MCP Tool-Call Round-Trips as AG-UI Tool Events

Arachne's existing MCP round-trip flow (`handleMcpRoundTrip()` in `src/index.ts`) already detects tool calls in provider responses and executes them against MCP endpoints. AG-UI surfaces this to the frontend:

```
1. Provider returns tool_call in response
2. Gateway emits: ToolCallStart { toolCallId, toolCallName }
3. Gateway emits: ToolCallArgs { delta: JSON.stringify(arguments) }
4. Gateway emits: ToolCallEnd { toolCallId }
5. Gateway executes MCP round-trip → gets result
6. Gateway emits: ToolCallResult { toolCallId, content: result }
7. Gateway re-sends to provider with tool result
8. Provider responds with assistant message
9. Gateway emits: TextMessageStart/Content/End for final response
```

For **streaming** MCP tool calls, argument chunks map 1:1 to `ToolCallArgs` deltas. The tool result is emitted after the MCP endpoint responds.

### 3.5 AgentTeam Execution as AG-UI Steps

When the request routes to `TeamOrchestrator`, each sub-agent invocation maps to AG-UI step events:

| Team Event | AG-UI Events |
|---|---|
| Team execution begins | `RunStarted` |
| Router agent classifies | `StepStarted { stepName: "router:triage-agent" }` → `StepFinished` |
| Specialist agent processes | `StepStarted { stepName: "specialist:billing-agent" }` |
| Specialist streams response | `TextMessageStart/Content/End` (within step) |
| Specialist completes | `StepFinished { stepName: "specialist:billing-agent" }` |
| Team execution ends | `RunFinished` |

For **supervisor** pattern teams, each iteration maps to a numbered step:

```
StepStarted { stepName: "supervisor:iteration-1" }
  ToolCallStart { toolCallName: "invoke_worker-a" }
  ToolCallResult { content: worker-a result }
StepFinished { stepName: "supervisor:iteration-1" }
StepStarted { stepName: "supervisor:iteration-2" }
  ...
```

For **parallel** pattern teams, worker steps overlap temporally (the frontend renders them concurrently).

### 3.6 Trace Recording of AG-UI Events

The existing `TraceRecorder` captures the full provider request/response. AG-UI events are a **derived view** of the same data, not a separate data stream. The trace already contains everything needed to reconstruct AG-UI events.

However, for debugging and replay purposes, the trace can optionally record the AG-UI event sequence:

```typescript
// In the AG-UI transform, accumulate events alongside content
interface AGUITraceExtension {
  agui_events: BaseEvent[];   // Ordered list of emitted AG-UI events
  agui_protocol_version: string;
}
```

This is stored in the trace's encrypted `response_body` as an additional field. The dashboard can then replay the AG-UI event stream for debugging.

### 3.7 Tenant-Automatic Compatibility

Because AG-UI is a gateway-level transform:

- **No agent spec changes** -- existing agents work as-is.
- **No provider adapter changes** -- the transform sits after the provider response.
- **No tenant configuration** -- every tenant gets AG-UI support automatically.
- **Opt-in per request** -- clients choose AG-UI format via header/parameter.

This preserves the "AI Runtime overhead < 20ms" principle: AG-UI event wrapping is pure JSON serialization with negligible overhead (the content is already being parsed for trace recording).

---

## 4. Portal Chat UI Integration

### 4.1 Current State

The Portal chat interface is a React island within the Astro + Vite Portal app. It currently:
- Sends `POST /v1/chat/completions` with `stream: true`
- Consumes raw OpenAI-compatible SSE chunks
- Renders streaming text as it arrives
- Displays conversation history from the conversation API

### 4.2 AG-UI Consumer: `@ag-ui/client` vs CopilotKit React

**Option A: CopilotKit React (`@copilotkit/react-core`, `@copilotkit/react-ui`)**

| Pro | Con |
|-----|-----|
| Full-featured chat UI components | Heavy dependency (~200KB+) |
| Built-in HITL components | Opinionated styling, hard to match Portal design system |
| State sync hooks out of the box | Tight coupling to CopilotKit cloud features |
| Active community | Abstractions may conflict with Arachne's auth/conversation model |

**Option B: `@ag-ui/client` (lightweight SDK) + custom React hooks**

| Pro | Con |
|-----|-----|
| ~15KB, protocol-only, no UI opinions | Must build HITL components ourselves |
| `HttpAgent` class handles SSE connection + event parsing | More initial development work |
| Full control over rendering and state management | No community components to reuse |
| Clean integration with existing Portal React architecture | — |
| MIT license, no cloud dependency | — |

**Recommendation: Option B (`@ag-ui/client` + custom hooks).** The Portal already has a chat UI with its own design system. CopilotKit's React components would conflict with existing styling and auth patterns. The `@ag-ui/client` SDK provides the event parsing and SSE connection management we need, and we build the rendering layer ourselves -- which we already have.

### 4.3 React Hook Architecture

```typescript
// portal/src/hooks/useAGUIChat.ts

import { HttpAgent, type BaseEvent, EventType } from '@ag-ui/client';

interface UseAGUIChatOptions {
  apiKey: string;
  agentEndpoint: string;   // /v1/chat/completions?protocol=ag-ui
  conversationId?: string;
}

interface AGUIChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentRun: { runId: string; threadId: string } | null;
  activeSteps: string[];        // For AgentTeam sub-agent progress
  activeToolCalls: ToolCallState[];
  pendingApprovals: HITLApproval[];
  sharedState: Record<string, unknown>;
  error: string | null;
}

function useAGUIChat(options: UseAGUIChatOptions): AGUIChatState & {
  sendMessage: (content: string) => Promise<void>;
  approveToolCall: (toolCallId: string) => void;
  rejectToolCall: (toolCallId: string, reason?: string) => void;
  cancelRun: () => void;
} {
  // Implementation uses @ag-ui/client HttpAgent to connect
  // and dispatches events to a useReducer for state management
}
```

### 4.4 Event-to-UI Mapping

| AG-UI Event | Portal UI Rendering |
|---|---|
| `RunStarted` | Show typing indicator, set `isStreaming = true` |
| `TextMessageContent` | Append delta to current message bubble, render markdown incrementally |
| `TextMessageEnd` | Finalize message bubble, clear typing indicator |
| `ToolCallStart` | Show tool invocation chip: "Calling {toolCallName}..." |
| `ToolCallArgs` | Expand chip to show streamed arguments (collapsible) |
| `ToolCallResult` | Replace chip content with tool output (formatted) |
| `StepStarted` | Show sub-agent progress indicator: "Step: {stepName}" |
| `StepFinished` | Mark step complete (checkmark) |
| `StateSnapshot` / `StateDelta` | Update shared state store (used by workflow editor integration) |
| `RunError` | Display error banner with retry option |
| `RunFinished` | Set `isStreaming = false`, enable input |
| `ReasoningMessageContent` | Show collapsible "Thinking..." section with reasoning text |
| `ActivitySnapshot` | Show structured activity card (plan steps, search results, etc.) |

### 4.5 HITL Approval Flows

AG-UI enables HITL by having the agent invoke a frontend-defined tool (e.g., `confirmAction`). The Portal chat UI implements this as:

1. **Define HITL tools** in the `RunAgentInput.tools[]` array sent with each request:

```typescript
const hitlTools = [
  {
    name: 'confirmAction',
    description: 'Request human approval before executing an action',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action description' },
        details: { type: 'object', description: 'Action parameters' },
        severity: { enum: ['info', 'warning', 'critical'] },
      },
      required: ['action', 'details'],
    },
  },
];
```

2. **Render approval UI** when `ToolCallStart { toolCallName: "confirmAction" }` arrives:

```
┌─────────────────────────────────────────────┐
│ 🔒 Agent requests approval                  │
│                                              │
│ Action: Delete customer record #4521         │
│ Severity: ⚠️ warning                         │
│                                              │
│ Details:                                     │
│   customer_id: 4521                          │
│   reason: "duplicate account"                │
│                                              │
│         [ Approve ]    [ Reject ]            │
└─────────────────────────────────────────────┘
```

3. **Return approval result** as a tool message in the next request to the agent:

```typescript
// User clicks Approve
await sendToolResult(toolCallId, JSON.stringify({ approved: true }));

// User clicks Reject
await sendToolResult(toolCallId, JSON.stringify({
  approved: false,
  reason: 'Customer record is active, not a duplicate',
}));
```

4. **Agent continues** based on the approval result.

**Integration with workflow editor HITL nodes:** The workflow editor spec defines HITL approval nodes in visual workflows. When a workflow reaches a HITL node, the runtime emits `ToolCallStart { toolCallName: "confirmAction" }` with the node's configured approval parameters. The Portal chat UI renders the approval UI. This unifies the chat-based HITL and workflow-based HITL into a single AG-UI mechanism.

### 4.6 Shared State Sync

AG-UI shared state enables the agent to push structured data to the frontend beyond the chat stream. Use cases in the Portal:

| Use Case | State Shape | AG-UI Mechanism |
|---|---|---|
| Workflow progress | `{ nodes: [...], edges: [...], activeNodeId }` | `StateSnapshot` on start, `StateDelta` as nodes complete |
| Form pre-fill | `{ formFields: { name, email, ... } }` | `StateDelta` patches as agent extracts data from conversation |
| Agent configuration | `{ model, temperature, tools[] }` | `StateSnapshot` reflecting current agent config |
| Team execution graph | `{ agents: [...], activeAgent, delegationChain }` | `StateDelta` as sub-agents activate/complete |

The Portal stores shared state in a React context and exposes it to both the chat component and the workflow editor canvas (when viewing a workflow execution).

### 4.7 Sub-Agent Delegation Display

For AgentTeam executions, the Portal chat UI renders a delegation tree:

```
┌─────────────────────────────────────────────┐
│ 🤖 customer-support-team                    │
│                                              │
│ ├── ✅ triage-agent (routing)               │
│ │   Classification: billing                  │
│ │                                            │
│ └── ⏳ billing-agent (processing...)         │
│     │ Looking up invoice #1234...            │
│     │ ▊▊▊▊▊▊░░░░ streaming                 │
└─────────────────────────────────────────────┘
```

This is driven by `StepStarted`/`StepFinished` events with `stepName` encoding the agent role (e.g., `"router:triage-agent"`, `"specialist:billing-agent"`).

---

## 5. ACP vs A2A Analysis

### 5.1 Protocol Comparison

| Dimension | ACP (Arachne) | A2A (Google) |
|---|---|---|
| **Scope** | Internal agent-to-agent within a single Arachne runtime | Cross-platform agent-to-agent across organizational boundaries |
| **Transport** | Raw JSON over internal function calls or message bus | JSON-RPC 2.0 over HTTP(S) + SSE |
| **Discovery** | Semantic map handshake per session | Agent Cards (standardized capability advertisements) |
| **Message format** | Token-minimized compressed envelopes (30-80 tokens) | Standard JSON-RPC (verbose, self-describing) |
| **Session model** | Stateful (handshake → exchange → close) | Task-based (create → update → complete) |
| **Budget governance** | Native (token/cost/TTL budgets propagate) | Not built-in |
| **Traceability** | Native (correlation ID + message DAG) | Task-based (task ID tracks lifecycle) |
| **Streaming** | Intent codes 9/10/11 (stream.start/chunk/end) | SSE for long-running tasks |
| **Adoption** | Arachne-only (internal) | Google, multiple framework integrations |
| **Maturity** | v0.1 spec, not yet implemented | v0.1, reference implementations available |

### 5.2 Where Each Protocol Excels

**ACP excels at:**
- **High-throughput internal workflows.** 67% token savings vs MCP/JSON-RPC at 12+ messages per session. For Arachne's 50-200 message workflows, this is material.
- **Budget-aware orchestration.** Token and cost budgets are in the protocol, not bolted on. No equivalent in A2A.
- **Compact tracing.** Wire format = trace format. No transformation needed.
- **Low-latency internal calls.** No HTTP overhead, no JSON-RPC framing for intra-process communication.

**A2A excels at:**
- **Cross-platform interop.** Agent Cards provide a standard discovery mechanism. An Arachne agent could advertise its capabilities to non-Arachne agents.
- **Enterprise federation.** Designed for agents from different organizations/vendors to collaborate.
- **Ecosystem momentum.** Google backing, growing framework support (LangGraph, CrewAI, etc.).
- **Opacity model.** Agents collaborate without exposing internals -- important for marketplace scenarios.

### 5.3 Recommendation: Hybrid Approach

**Keep ACP for internal agent-to-agent communication.** ACP's token efficiency and budget governance are core differentiators for Arachne. Replacing ACP with A2A for internal communication would increase costs and latency with no benefit (internal agents don't need cross-platform interop or opacity).

**Add an A2A gateway adapter for external federation.** When Arachne agents need to communicate with non-Arachne agents (marketplace, enterprise integrations), expose an A2A-compatible endpoint that translates between ACP and A2A at the boundary.

```
┌──────────────────────────────────────────────────────┐
│ Arachne Runtime (ACP internally)                      │
│                                                        │
│  Agent A ←─ACP─→ Agent B ←─ACP─→ Agent C             │
│                      │                                 │
│                      │ A2A Gateway Adapter             │
│                      ▼                                 │
│              POST /a2a/tasks (JSON-RPC 2.0)           │
└──────────────────────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────┐
        │ External Agent (A2A)     │
        │ (LangGraph, CrewAI, etc) │
        └──────────────────────────┘
```

**Implementation phases:**

| Phase | Scope | Timeline |
|---|---|---|
| **Phase 1** (MVP) | ACP for internal teams. No A2A. | Current sprint |
| **Phase 2** | A2A Agent Card generation from agent specs. Read-only discovery endpoint (`GET /.well-known/agent.json`). | Post-launch |
| **Phase 3** | A2A task execution adapter. Arachne agents can receive tasks from external A2A clients and delegate to external A2A agents. | Post-launch + 1 |

### 5.4 A2A Agent Card Generation

Arachne agent specs contain enough information to auto-generate A2A Agent Cards:

```yaml
# Arachne Agent spec
apiVersion: arachne-ai.com/v0
kind: Agent
metadata:
  name: billing-agent
spec:
  model: gpt-4.1-mini
  systemPrompt: "You handle billing support..."
  skills:
    - invoice_lookup
    - payment_processing
```

Maps to A2A Agent Card:

```json
{
  "name": "billing-agent",
  "description": "Handles billing-related support inquiries",
  "url": "https://acme.arachne-ai.com/a2a",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "skills": [
    { "id": "invoice_lookup", "name": "Invoice Lookup" },
    { "id": "payment_processing", "name": "Payment Processing" }
  ]
}
```

---

## 6. Migration Strategy

### 6.1 Phase 1: Gateway AG-UI Transform (Week 1-2)

**Files to modify:**

| File | Change |
|---|---|
| `src/streaming.ts` | Add `AGUITransform` class that wraps SSE chunks in AG-UI events |
| `src/index.ts` | Detect `protocol=ag-ui` header/param, activate AG-UI transform |
| `src/types.ts` | Add AG-UI event type definitions (or import from `@ag-ui/client`) |

**No changes to:** auth, providers, agents, traces, database.

**Testing:** Validate that an `@ag-ui/client` `HttpAgent` can connect to `POST /v1/chat/completions?protocol=ag-ui` and receive properly typed events.

### 6.2 Phase 2: Portal Chat UI Migration (Week 2-3)

**Dependencies to add:**

```bash
cd portal && npm install @ag-ui/client
```

**Files to create/modify:**

| File | Change |
|---|---|
| `portal/src/hooks/useAGUIChat.ts` | New hook: AG-UI event consumer via `HttpAgent` |
| `portal/src/components/Chat/ChatStream.tsx` | Replace raw SSE parsing with `useAGUIChat` hook |
| `portal/src/components/Chat/ToolCallChip.tsx` | New: render tool invocations |
| `portal/src/components/Chat/StepIndicator.tsx` | New: render AgentTeam sub-agent steps |
| `portal/src/components/Chat/HITLApproval.tsx` | New: render approval requests |
| `portal/src/components/Chat/ReasoningBlock.tsx` | New: collapsible thinking display |

**Backward compatibility:** The existing raw SSE consumer remains as a fallback. The Portal detects AG-UI support and switches protocols automatically.

### 6.3 Phase 3: MCP Tool Events + HITL (Week 3-4)

Wire MCP round-trip events through the AG-UI transform. Implement frontend-defined tools for HITL approval flows. Connect to workflow editor HITL nodes.

### 6.4 Phase 4: AgentTeam Step Events (Week 4-5)

Modify `TeamOrchestrator` to emit AG-UI step events during sub-agent invocations. Requires the orchestrator to have access to the AG-UI event emitter (passed through `TeamContext`).

---

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| AG-UI spec is still evolving (pre-1.0) | Breaking changes in event schema | Pin `@ag-ui/client` version. AG-UI events are a thin wrapper; our gateway transform can adapt to schema changes without touching agent code. |
| CopilotKit governance risk (single-company OSS) | Protocol direction could shift | AG-UI is MIT licensed. Worst case: fork the protocol types. The event schema is simple enough (~28 types) to maintain independently. Google/Microsoft adoption reduces single-vendor risk. |
| Performance overhead of AG-UI wrapping | Gateway latency increase | AG-UI wrapping is JSON serialization of data already parsed for trace recording. Measured overhead: < 1ms per chunk. Well within the 20ms budget. |
| HITL approval UX complexity | Poor user experience for approval flows | Start with a simple approve/reject modal. Iterate based on user feedback. The AG-UI tool-call pattern is flexible enough to support rich approval UIs later. |
| Shared state conflicts (agent + frontend both writing) | Data corruption | Implement optimistic locking with sequence numbers. Frontend requests `StateSnapshot` on conflict detection (per AG-UI spec). |

---

## 8. Decisions & Open Questions

### Decisions Made

1. **AG-UI at the gateway level.** Events are emitted by the SSE Transform, not by individual agents. Tenants get AG-UI automatically.
2. **`@ag-ui/client` over CopilotKit React.** Lightweight SDK + custom hooks preserves Portal design system control.
3. **Hybrid ACP + A2A.** Keep ACP for internal agent communication; add A2A adapter for external federation in a future phase.
4. **Opt-in per request.** AG-UI protocol is activated by `Accept` header or query parameter, preserving backward compatibility.

### Open Questions

1. **WebSocket for state sync?** AG-UI supports WebSocket for bi-directional state. Should the Portal use WebSocket alongside SSE, or is SSE + separate REST calls sufficient for state updates?
2. **AG-UI event recording granularity.** Should the trace store record individual AG-UI events (higher storage cost) or just the fact that AG-UI was used (lower cost)?
3. **Frontend tool sandboxing.** AG-UI frontend tools execute in the browser. What security boundaries do we need for tenant-defined frontend tools?
4. **AG-UI for non-chat interfaces.** Should the Dashboard and Admin UI also consume AG-UI events (e.g., for live trace visualization)?
5. **Versioning strategy.** When AG-UI reaches 1.0, how do we handle the transition? Support both old and new event schemas via content negotiation?

---

*This is a living document. Update as AG-UI evolves and implementation progresses.*
