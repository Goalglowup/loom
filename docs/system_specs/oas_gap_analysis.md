# OAS Gap Analysis for Arachne

> **Status:** Draft
> **Author:** Architect (Domain Modeling Expert)
> **Date:** 2026-04-01
> **OAS Version Analyzed:** 26.1.0 (nightly)
> **Arachne Specs Referenced:** architecture.md, product-roadmap.md, feature-roadmap.md, agent_team_spec.md, agent_messaging.md, agent_tools.md, arachne_workspace_spec.md, queue_spike.md

---

## Executive Summary

The Open Agent Specification (OAS) by Oracle defines a portable, platform-agnostic configuration language for describing Agents and Agentic Systems. This analysis compares every OAS concept against Arachne's current capabilities and planned roadmap, classifying each as:

- **(a) Already implemented** — Arachne has equivalent or superior functionality
- **(b) Partially implemented** — Core concept exists but gaps remain
- **(c) Not implemented but compatible** — No architectural conflict; can be added
- **(d) Architectural conflict** — Fundamental design differences that require resolution

**Key findings:**
- Arachne has strong coverage of Agent definitions, LLM configuration, tool systems, multi-agent patterns, and observability
- The largest gap is **Flows** — OAS's structured workflow engine (nodes, edges, branching, loops, parallel maps) has no equivalent in Arachne today
- OAS's **Datastore** abstraction, **Message Transforms**, and **Structured Generation** are partially or not implemented
- There are **no hard architectural conflicts** — Arachne's design is additive-compatible with OAS concepts
- Supporting OAS would strengthen Arachne's open-spec positioning and differentiate it from closed runtimes

---

## Classification Legend

| Code | Meaning | Action Required |
|------|---------|-----------------|
| **(a)** | Already implemented | Map Arachne concepts to OAS equivalents in an adapter/importer |
| **(b)** | Partially implemented | Extend existing subsystems to close specific gaps |
| **(c)** | Not implemented but compatible | Design and build new subsystems; no conflicts with existing architecture |
| **(d)** | Architectural conflict | Requires design resolution before implementation |

---

## 1. Core Spec Structure

### 1.1 Component Model (Component, ComponentWithIO)

**OAS:** Every entity extends `Component` (id, type, name, description, metadata) and optionally `ComponentWithIO` (adds JSON Schema inputs/outputs). Components reference each other via `$component_ref`.

**Arachne:** Uses `apiVersion`/`kind`/`metadata`/`spec` structure. Artifacts have names and metadata. Cross-references use string refs (e.g., `knowledgeBaseRef: support-kb`).

**Classification: (b) Partially implemented**

| OAS Property | Arachne Equivalent | Gap |
|---|---|---|
| `id` | `metadata.name` | Arachne uses name-based identity, not UUID-based. Functional equivalent for workspace scope. |
| `type` | `kind` | Direct mapping: `Agent`, `KnowledgeBase`, etc. |
| `name` | `metadata.name` | Same concept |
| `description` | Not in spec format | Arachne specs lack a `description` field at the artifact level |
| `metadata` | `metadata` (partial) | Arachne's metadata is limited to `name`; OAS allows arbitrary key-value pairs |
| `inputs` / `outputs` | Not implemented | Agents and tools don't declare typed I/O schemas in the spec format |
| `$component_ref` | String refs (`ref: agent-name`) | Functional equivalent within workspaces |

**Gap:** Add `description` and arbitrary `metadata` fields to the spec format. The typed I/O schema (`inputs`/`outputs`) is the larger gap — needed for structured generation and flow data routing.

---

### 1.2 Versioning (`agentspec_version`)

**OAS:** Top-level `agentspec_version` field using `YEAR.QUARTER.PATCH` format (e.g., `26.1.0`). Deprecation cycle of minimum 1 year.

**Arachne:** Uses `apiVersion: arachne-ai.com/v0`. No patch-level versioning. No formal deprecation policy.

**Classification: (b) Partially implemented**

**Gap:** Arachne has version identifiers but lacks the structured versioning scheme and deprecation lifecycle. To support OAS import, Arachne would need to recognize the `agentspec_version` field and validate compatibility.

---

### 1.3 Serialization Format

**OAS:** JSON and YAML with `component_type` discriminators and `$component_ref` for symbolic references. Export/import via `AgentSpecExporter`/`AgentSpecLoader`.

**Arachne:** YAML-based declarative specs with `kind` discriminator. Multi-document YAML and directory workspace formats.

**Classification: (b) Partially implemented**

**Gap:** Add an OAS importer that maps `component_type` → `kind`, resolves `$component_ref` → Arachne string refs, and handles the different nesting conventions. The workspace spec already supports multi-document YAML.

---

## 2. Agent

### 2.1 Agent Definition

**OAS:** Agent with `system_prompt`, `llm_configuration`, `tools`, `toolboxes`, `human_in_the_loop`, `transforms`, and typed I/O.

**Arachne:** Agent with `systemPrompt`, `model`, `skills` (tools), `knowledgeBaseRef`, `mcpEndpoints`. Merge policies for system prompts and skills in tenant hierarchy.

**Classification: (b) Partially implemented**

| OAS Property | Arachne Equivalent | Status |
|---|---|---|
| `system_prompt` | `spec.systemPrompt` | **(a)** Direct mapping. Arachne also supports Jinja-like template variables. |
| `llm_configuration` | `spec.model` + tenant `provider_config` | **(b)** Arachne resolves LLM config from the provider system, not inline. See §3. |
| `tools` | `spec.skills` + MCP round-trip | **(b)** Tool concept exists but type taxonomy differs. See §4. |
| `toolboxes` | MCP endpoints (partial) | **(b)** MCP endpoints function as tool discovery containers. No general ToolBox abstraction. |
| `human_in_the_loop` | Not implemented | **(c)** No HITL gate in the agent execution loop. |
| `transforms` | Not implemented | **(c)** No message transform pipeline. See §7. |
| `inputs` / `outputs` | Not implemented | **(c)** No typed I/O on agents. See §1.1. |

**Gap:** `human_in_the_loop` is a new concept requiring a pause/resume mechanism in the agent execution loop. `transforms` require a pre/post-processing pipeline. Typed I/O enables structured generation.

---

### 2.2 SpecializedAgent / AgentSpecializationParameters

**OAS:** A `SpecializedAgent` wraps a base `Agent` with additional instructions, tools, and HITL override. Instructions are merged; tools are extended.

**Arachne:** Subtenant hierarchy provides agent specialization via merge policies (`prepend`, `append`, `overwrite`, `ignore`) for system prompts and skills.

**Classification: (b) Partially implemented**

**Gap:** Arachne's specialization is tenant-scoped (parent/child tenants), not agent-scoped. OAS allows arbitrary agent-to-agent specialization without tenant hierarchy. To support this, Arachne would need an `extends` or `base` field in the Agent spec that references another agent and applies merge rules.

---

## 3. LLM Configuration

### 3.1 LlmConfig Hierarchy

**OAS defines a typed config hierarchy:**
- `LlmConfig` (base) — generation parameters (`max_tokens`, `temperature`, `top_p`, `stop`, `frequency_penalty`, `extra_args`)
- `OpenAiCompatibleConfig` — `model_id`, `url`, `api_key`, `api_type`
- `OpenAiConfig` — OpenAI-specific
- `OllamaConfig` — extends OpenAiCompatibleConfig
- `VllmConfig` — extends OpenAiCompatibleConfig
- `OciGenAiConfig` — Oracle Cloud-specific with compartment, serving mode, OCI auth

**Arachne:** Provider abstraction via `BaseProvider` → `OpenAIProvider`, `AzureProvider` + planned Anthropic, Google, Bedrock, Mistral adapters. LLM config is split between agent `spec.model` and tenant-level `provider_config`.

**Classification: (b) Partially implemented**

| OAS Config | Arachne Equivalent | Status |
|---|---|---|
| `OpenAiConfig` | `OpenAIProvider` | **(a)** |
| `OllamaConfig` | Ollama adapter (OpenAI-compatible) | **(a)** |
| `OpenAiCompatibleConfig` | Bridge adapter (planned, Phase 1) | **(b)** Provider Bridge Adapter (#112) covers this |
| `VllmConfig` | Bridge adapter | **(b)** Same as above |
| `OciGenAiConfig` | Not implemented | **(c)** Oracle-specific; no conflict. Could be added as a new provider adapter. |
| Generation parameters | Passed through to provider | **(b)** `temperature`, `max_tokens` etc. are supported as request body fields but not declared in the agent spec |

**Gap:** Arachne's LLM config is resolved at runtime from the provider system, not declared inline in the agent spec. To support OAS, Arachne would need to either (a) accept inline `llm_configuration` in specs and translate to provider config at deploy time, or (b) provide a mapping layer in the OAS importer. Generation parameters should be declarable per-agent in the spec format.

---

## 4. Tools

### 4.1 Tool Type Taxonomy

**OAS defines 5 tool types:**

| OAS Tool Type | Description | Arachne Equivalent | Status |
|---|---|---|---|
| `ServerTool` | Server-side execution; implementation outside spec | ToolPackage handlers (Azure Container Apps Dynamic Sessions) | **(b)** Arachne's tool host executes sandboxed JS handlers. Concept aligns but packaging differs. |
| `ClientTool` | Client-side execution; runtime pauses and returns `ToolRequest` | Not implemented | **(c)** Requires pause/resume in agent loop (like HITL). |
| `RemoteTool` | HTTP API call with URL, method, headers, query params | Not directly supported | **(c)** Closest is MCP round-trip, but RemoteTool is simpler HTTP. Could be a built-in tool type. |
| `MCPTool` | Tool via MCP protocol | MCP endpoints + round-trip | **(a)** Arachne already supports MCP tool calls. |
| `BuiltinTool` | Runtime-provided tool by identifier | Not implemented as a concept | **(c)** No built-in tool registry. Compatible — just needs a registry mapping. |

**Classification: (b) Partially implemented**

**Gap:** Arachne needs `ClientTool` (pause/resume), `RemoteTool` (declarative HTTP tool), and `BuiltinTool` (runtime tool registry). The `ServerTool` concept maps to ToolPackages but the OAS version doesn't include executable code — it's a declaration that says "this tool exists server-side."

---

### 4.2 Tool Properties

**OAS:** Tools have `inputs` (JSON Schema), `outputs` (JSON Schema), `requires_confirmation` (bool).

**Arachne:** Tool manifest has `input_schema`, `output_schema`, handler path. No `requires_confirmation` field.

**Classification: (b) Partially implemented**

**Gap:** Add `requires_confirmation` to tool manifest (maps to HITL gate before tool execution). Input/output schemas are conceptually the same.

---

### 4.3 ToolBox / MCPToolBox

**OAS:** `ToolBox` is a discovery/aggregation container. `MCPToolBox` connects to an MCP server via transport and optionally filters tools with `tool_filter` (name list or `MCPToolSpec` validation).

**Arachne:** MCP endpoints on agents (`spec.mcpEndpoints`) function as tool discovery. No filtering or validation of discovered tools.

**Classification: (b) Partially implemented**

**Gap:** Add `tool_filter` support to MCP endpoint configuration — allow agents to whitelist specific tools from an MCP server and optionally validate their schemas.

---

### 4.4 MCP Transport Types

**OAS defines transport types:**

| Transport | Arachne Support | Status |
|---|---|---|
| `StdioTransport` (command, args, env, cwd) | Not implemented | **(c)** Requires local process spawning |
| `SSETransport` (url, headers) | MCP endpoints use SSE | **(a)** |
| `StreamableHTTPTransport` (url, headers) | Not implemented | **(c)** Newer MCP transport |
| `SSEmTLSTransport` (mTLS) | Not implemented | **(c)** |
| `StreamableHTTPmTLSTransport` (mTLS) | Not implemented | **(c)** |

**Classification: (b) Partially implemented**

**Gap:** Arachne supports SSE-based MCP but lacks Stdio, StreamableHTTP, and mTLS transports. Stdio is important for local development; StreamableHTTP is the latest MCP transport evolution.

---

## 5. Flows (Structured Workflows)

### 5.1 Flow Definition

**OAS:** `Flow` is a graph-based workflow with `start_node`, `nodes`, `control_flow_connections` (edges for execution order), and `data_flow_connections` (edges for data routing). Flows have typed I/O, shared conversation model, and separate I/O data space.

**Arachne:** No flow/workflow concept. Agent execution is single-pass request/response with optional MCP tool round-trip. Multi-agent coordination uses the AgentTeam spec with four fixed patterns (routing, handoff, parallel, supervisor).

**Classification: (c) Not implemented but compatible**

**This is the largest gap in the analysis.** OAS Flows provide a general-purpose workflow engine that subsumes Arachne's four AgentTeam coordination patterns and adds significantly more flexibility.

**Gap analysis for Flow components:**

| OAS Flow Concept | Arachne Equivalent | Status |
|---|---|---|
| `Flow` (graph container) | None | **(c)** |
| `StartNode` | None | **(c)** |
| `EndNode` | None | **(c)** |
| `LlmNode` | None (agent handles LLM calls) | **(c)** |
| `ToolNode` | Tool invocation in agent loop | **(b)** Exists as part of agent execution, not as standalone node |
| `AgentNode` | Sub-agent invocation in TeamOrchestrator | **(b)** |
| `FlowNode` (sub-flow) | None | **(c)** |
| `BranchingNode` | Router coordination pattern | **(b)** Routing pattern is a specific case |
| `MapNode` (sequential iteration) | None | **(c)** |
| `ParallelMapNode` (parallel iteration) | None | **(c)** |
| `ParallelFlowNode` (parallel sub-flows) | Parallel coordination pattern | **(b)** Limited to workers + merge |
| `InputMessageNode` | None | **(c)** |
| `OutputMessageNode` | None | **(c)** |
| `ApiNode` | None (could use RemoteTool) | **(c)** |
| `CatchExceptionNode` | None | **(c)** |
| `ControlFlowEdge` | Implicit in coordination patterns | **(b)** |
| `DataFlowEdge` | Implicit in pipeline message passing | **(b)** |
| `Variable` (flow-scoped state) | None | **(c)** |
| `VariableReadStep` / `VariableWriteStep` | None | **(c)** |

**Recommendation:** Implementing a full Flow engine is a significant undertaking. The pragmatic approach:

1. **Phase 1:** Build an OAS-to-AgentTeam translator that maps simple OAS flows to Arachne's existing coordination patterns where possible.
2. **Phase 2:** Implement a general-purpose `Flow` artifact kind with a node/edge execution engine. This would subsume and eventually replace the fixed coordination patterns in AgentTeam.
3. **Phase 3:** Add the full node standard library (MapNode, ParallelMapNode, BranchingNode, CatchExceptionNode, etc.).

---

### 5.2 AgentTeam Patterns vs. OAS Multi-Agent Patterns

**OAS multi-agent patterns:**

| OAS Pattern | Arachne Equivalent | Status |
|---|---|---|
| `Swarm` (directed agent graph with handoff modes: never/optional/always) | Routing + Handoff patterns | **(b)** Arachne's routing and handoff are subsets of Swarm. Missing: optional/always handoff modes, arbitrary agent-to-agent relationships. |
| `ManagerWorkers` (manager routes tasks, workers report back) | Supervisor pattern | **(b)** Supervisor is functionally equivalent. Missing: workers cannot interact with end user (OAS enforces this; Arachne doesn't distinguish). |

**Classification: (b) Partially implemented**

**Gap:** Arachne's four fixed coordination patterns (routing, handoff, parallel, supervisor) cover the most common multi-agent scenarios but lack:
- Swarm's arbitrary relationship graph (Arachne's routing is strictly one-router-to-many-specialists)
- Handoff modes (never/optional/always) — Arachne handoff is always "always" (strict pipeline)
- Worker isolation from end-user (OAS ManagerWorkers explicitly prevents workers from responding to users)

---

## 6. Datastores

### 6.1 Datastore Abstraction

**OAS defines datastore types:**

| OAS Datastore | Arachne Equivalent | Status |
|---|---|---|
| `InMemoryCollectionDatastore` | None | **(c)** No agent-accessible key-value store |
| `OracleDatabaseDatastore` | None | **(c)** Oracle-specific |
| `PostgresDatabaseDatastore` | PostgreSQL (internal, not agent-accessible) | **(c)** Arachne uses Postgres for its own data, but doesn't expose database access to agents as a tool |

**Classification: (c) Not implemented but compatible**

**Gap:** OAS Datastores are typed, agent-accessible data stores with schema definitions and CRUD operations (DatastoreListStep, DatastoreCreateStep, etc.). Arachne's PostgreSQL is internal infrastructure, not an agent-facing capability. To support this:

1. Add a `Datastore` artifact kind with entity schema definitions
2. Provide built-in tools for CRUD operations on datastores
3. Wire into agent execution so agents can read/write structured data

This aligns with Arachne's roadmap item "Advanced Memory Strategies" (#127) — entity extraction and persistent facts could be implemented as a datastore.

---

## 7. Message Transforms

### 7.1 Transform Pipeline

**OAS:** `MessageTransform` is an abstract pre/post-processing step on agent messages. Concrete types:
- `MessageSummarizationTransform` — summarize individual messages exceeding size limit
- `ConversationSummarizationTransform` — summarize conversation when message count exceeds threshold

Both support LLM-based summarization with configurable instructions and caching via datastores.

**Arachne:** Conversation memory includes automatic summarization when token budget is exceeded (snapshot creation). No configurable transform pipeline.

**Classification: (b) Partially implemented**

| OAS Transform | Arachne Equivalent | Status |
|---|---|---|
| `ConversationSummarizationTransform` | Token-budget summarization with snapshots | **(b)** Same concept; Arachne triggers on token count, OAS on message count. Missing: configurable summarization instructions, datastore-backed caching. |
| `MessageSummarizationTransform` | Not implemented | **(c)** Per-message summarization is a new concept |

**Gap:** Arachne's summarization is hardcoded into `ConversationManagementService`. To support OAS transforms:
1. Extract summarization logic into a pluggable `MessageTransform` interface
2. Allow agents to declare transforms in their spec
3. Add per-message summarization as a new transform type
4. Support configurable summarization instructions (roadmap item "Configurable Summarization" 5.2)

---

## 8. Structured Generation

**OAS:** When an Agent or LlmNode defines multiple or non-string output properties, the runtime triggers structured generation — the LLM produces JSON matching the output schema in a single request.

**Arachne:** No structured generation support. Agents return free-form text. The router agent in the routing pattern produces structured output (intent classification), but this is implicit, not schema-driven.

**Classification: (c) Not implemented but compatible**

**Gap:** Add support for `outputs` on Agent specs. When outputs are defined, inject JSON Schema into the LLM request as `response_format` (OpenAI) or equivalent provider-specific structured output parameter.

---

## 9. Remote / External Agents

### 9.1 RemoteAgent / A2AAgent

**OAS:** `RemoteAgent` executes logic outside the current process. `A2AAgent` implements Google's Agent-to-Agent protocol with URL, connection config (including mTLS), and session parameters.

**Arachne:** No remote agent concept. All agents execute within the Arachne runtime. Cross-tenant agent references are a future extension in the AgentTeam spec.

**Classification: (c) Not implemented but compatible**

**Gap:** Add a `RemoteAgent` artifact kind or agent type that proxies requests to external agent endpoints. A2A protocol support would require an HTTP client adapter. This aligns with the "Cross-Tenant Agent References" future extension in agent_team_spec.md.

---

### 9.2 OciAgent

**OAS:** Oracle Cloud Infrastructure agent endpoint with `agent_endpoint_id` and `OciClientConfig`.

**Arachne:** No OCI integration.

**Classification: (c) Not implemented but compatible**

**Gap:** Vendor-specific. Low priority unless targeting OCI customers. Could be implemented as a RemoteAgent variant.

---

## 10. Observability / Tracing

### 10.1 Tracing Model

**OAS defines:**
- Events (point-in-time), Spans (time-bounded), Traces (execution trees)
- 7 span types: LlmGeneration, ToolExecution, AgentExecution, SwarmExecution, ManagerWorkersExecution, FlowExecution, NodeExecution
- SpanProcessors for consumption hooks
- Security: sensitive field masking

**Arachne:** Batched trace recording with fire-and-forget persistence. Traces include request/response bodies (encrypted), token counts, latency, cost estimation. Sub-agent invocations in AgentTeam produce linked traces via `parentRequestId`.

**Classification: (b) Partially implemented**

| OAS Concept | Arachne Equivalent | Status |
|---|---|---|
| Trace (execution tree) | Trace rows with `parentRequestId` | **(a)** |
| LlmGenerationSpan | Trace row for LLM request/response | **(a)** |
| ToolExecutionSpan | Tool execution record (agent_tools spec) | **(a)** |
| AgentExecutionSpan | Trace row per agent invocation | **(a)** |
| SwarmExecutionSpan | Not implemented (no Swarm) | **(c)** |
| ManagerWorkersExecutionSpan | Team-level trace with `teamRole` | **(b)** |
| FlowExecutionSpan | Not implemented (no Flows) | **(c)** |
| NodeExecutionSpan | Not implemented (no Flows) | **(c)** |
| SpanProcessors | EventBus subscribers | **(b)** EventBus supports fire-and-forget events; not structured as span processors |
| Sensitive field masking | AES-256-GCM encryption at rest | **(a)** Arachne encrypts everything; OAS masks selectively |

**Gap:** Arachne's tracing is well-developed. The gaps are Flow/Node spans (blocked on Flow implementation) and structured SpanProcessor hooks. Arachne's approach of encrypting everything at rest is actually stronger than OAS's selective masking.

---

## 11. Security / Sensitive Data

**OAS:** `SensitiveField[T]` wrapper type. Sensitive fields excluded from serialized exports. No executable code in representations.

**Arachne:** Per-tenant AES-256-GCM encryption for all data at rest. Provider API keys stored in `encrypted:{ciphertext}:{iv}` format. No `SensitiveField` wrapper in spec format.

**Classification: (b) Partially implemented**

**Gap:** Arachne's encryption is more comprehensive than OAS's `SensitiveField` approach (Arachne encrypts everything, not just marked fields). For OAS compatibility, add `SensitiveField` annotation support in the spec format and ensure such fields are stripped when exporting/publishing specs.

---

## 12. Human-in-the-Loop (HITL)

**OAS:** `human_in_the_loop` flag on Agent. `requires_confirmation` flag on Tools. Runtime pauses and returns status (`UserMessageRequestStatus`, `ToolExecutionConfirmationStatus`).

**Arachne:** No HITL support. All agent and tool executions are fully automated.

**Classification: (c) Not implemented but compatible**

**Gap:** HITL requires:
1. A pause/resume mechanism in the agent execution loop
2. A status API for pending confirmations (`GET /v1/confirmations`)
3. A confirmation endpoint (`POST /v1/confirmations/:id/approve`)
4. Webhook notification when HITL is triggered
5. Timeout handling for unconfirmed requests

This is compatible with Arachne's architecture but requires significant new infrastructure. Could leverage the webhook system (roadmap Phase 2, #123).

---

## 13. Prompt Templates

**OAS:** Jinja2 templates with `{{variable}}` placeholders. Special placeholders: `__CHAT_HISTORY__`, `__RESPONSE_FORMAT__`, `__TOOLS__`. Output parsers: RegexOutputParser, JsonOutputParser, ReactToolOutputParser.

**Arachne:** System prompts support template variables (merged from tenant hierarchy). No output parsers.

**Classification: (b) Partially implemented**

**Gap:** Add Jinja2-compatible template processing for system prompts. Add output parser support for structured extraction from LLM responses. The special placeholders (`__CHAT_HISTORY__`, etc.) map to concepts Arachne already handles internally (history injection, tool injection) but aren't exposed in the template language.

---

## 14. Parallelization

**OAS:** Explicit parallelization rules — no ordering guarantees, no shared state writes, no user I/O in parallel branches. `ParallelMapNode` and `ParallelFlowNode` for concurrent execution.

**Arachne:** Parallel coordination pattern in AgentTeam runs workers concurrently via `Promise.all`. No formal parallelization rules or constraints.

**Classification: (b) Partially implemented**

**Gap:** Arachne's parallel pattern is functional but lacks:
- Formal constraint validation (e.g., detecting shared state writes in parallel branches)
- ParallelMapNode semantics (iterate over a list in parallel with reducers)
- ParallelFlowNode semantics (run independent sub-flows concurrently)

---

## 15. Runtime Adapters

**OAS:** Designed for cross-framework portability. Adapters exist for WayFlow, LangGraph, AutoGen, CrewAI.

**Arachne:** Single runtime (Arachne's Fastify-based server). No adapter concept.

**Classification: (c) Not implemented but compatible**

**Gap:** Building an OAS adapter for Arachne would allow OAS-defined agents to run on Arachne's runtime. This is the integration point — not a gap in Arachne per se, but the deliverable that makes OAS support real.

---

## Summary Matrix

| # | OAS Concept | Classification | Priority | Blocked By |
|---|---|---|---|---|
| 1.1 | Component model (id, type, metadata) | **(b)** Partial | Medium | — |
| 1.2 | Versioning (`agentspec_version`) | **(b)** Partial | Low | — |
| 1.3 | Serialization (JSON/YAML, `$component_ref`) | **(b)** Partial | Medium | OAS importer |
| 2.1 | Agent definition | **(b)** Partial | High | Typed I/O, transforms |
| 2.2 | SpecializedAgent | **(b)** Partial | Medium | Agent `extends` field |
| 3.1 | LLM Configuration hierarchy | **(b)** Partial | Medium | Inline LLM config in spec |
| 4.1 | Tool type taxonomy (5 types) | **(b)** Partial | High | ClientTool, RemoteTool, BuiltinTool |
| 4.2 | Tool confirmation (`requires_confirmation`) | **(c)** Not impl. | Medium | HITL system |
| 4.3 | ToolBox / MCPToolBox | **(b)** Partial | Medium | Tool filtering |
| 4.4 | MCP transports (Stdio, StreamableHTTP, mTLS) | **(b)** Partial | Medium | — |
| 5.1 | **Flows (full workflow engine)** | **(c)** Not impl. | **Critical** | Flow engine design |
| 5.2 | Multi-agent patterns (Swarm, ManagerWorkers) | **(b)** Partial | High | Swarm relationship graph |
| 6.1 | Datastores (typed, agent-accessible) | **(c)** Not impl. | Medium | Datastore artifact kind |
| 7.1 | Message transforms | **(b)** Partial | Medium | Transform pipeline |
| 8.0 | Structured generation | **(c)** Not impl. | High | Typed I/O on agents |
| 9.1 | RemoteAgent / A2AAgent | **(c)** Not impl. | Medium | Remote agent proxy |
| 9.2 | OciAgent | **(c)** Not impl. | Low | — |
| 10.1 | Tracing (7 span types, processors) | **(b)** Partial | Low | Flow spans |
| 11.0 | SensitiveField | **(b)** Partial | Low | — |
| 12.0 | Human-in-the-loop | **(c)** Not impl. | High | Pause/resume mechanism |
| 13.0 | Prompt templates (Jinja2, output parsers) | **(b)** Partial | Medium | — |
| 14.0 | Parallelization rules | **(b)** Partial | Low | Flow engine |
| 15.0 | Runtime adapter | **(c)** Not impl. | **Critical** | OAS importer/runtime |

---

## Recommended Implementation Sequence

### Phase A: OAS Compatibility Layer (2-3 sprints)

Build an OAS importer/adapter without changing Arachne's core architecture:

1. **OAS Spec Importer** — Parse OAS JSON/YAML, map to Arachne spec format
   - Map `Agent` → Arachne `Agent` (system_prompt, model, tools)
   - Map `llm_configuration` → provider config
   - Map `ServerTool`/`MCPTool` → Arachne tool/MCP definitions
   - Map `Swarm` → AgentTeam (routing or supervisor)
   - Map `ManagerWorkers` → AgentTeam (supervisor)
2. **OAS Spec Exporter** — Export Arachne specs as OAS format
3. **`arachne import` CLI command** — Import OAS specs into workspace

### Phase B: Core Gaps (3-4 sprints)

Close the most impactful gaps:

1. **Typed I/O on Agents** — Add `inputs`/`outputs` to Agent spec; enable structured generation
2. **RemoteTool** — Declarative HTTP tool type (url, method, headers)
3. **HITL System** — Pause/resume mechanism, confirmation API, `requires_confirmation` on tools
4. **Message Transform Pipeline** — Pluggable pre/post-processing on agent messages
5. **Expanded MCP Transports** — Stdio and StreamableHTTP support

### Phase C: Flow Engine (4-6 sprints)

The largest investment, but also the highest strategic value:

1. **Flow artifact kind** — Graph container with StartNode, EndNode, typed I/O
2. **Core node types** — LlmNode, ToolNode, AgentNode, BranchingNode
3. **Control flow edges** — Sequential execution with branching
4. **Data flow edges** — Typed data routing between nodes
5. **FlowNode** (sub-flows) and **ParallelFlowNode**
6. **MapNode / ParallelMapNode** — Iteration with reducers
7. **CatchExceptionNode** — Error handling in flows
8. **Variables** — Flow-scoped shared state with read/write steps

### Phase D: Extended Capabilities (2-3 sprints)

Lower-priority items that complete full OAS coverage:

1. **Datastore artifact kind** — Agent-accessible typed data stores
2. **BuiltinTool registry** — Runtime-provided tool catalog
3. **ClientTool** — Client-side tool execution with pause/resume
4. **OAS versioning support** — `agentspec_version` validation
5. **SensitiveField annotation** — Mark fields for exclusion from exports

---

## Architectural Notes

### No Hard Conflicts

Arachne's architecture is fundamentally compatible with OAS. The key reasons:

1. **Additive spec format** — Arachne's `apiVersion`/`kind`/`metadata`/`spec` structure can accommodate new fields and kinds without breaking existing artifacts.
2. **Provider abstraction** — Arachne's `BaseProvider` pattern can map to any OAS `LlmConfig` variant.
3. **Workspace system** — Cross-reference resolution, dependency ordering, and multi-artifact coordination are already built.
4. **Registry/CLI pipeline** — The weave/push/deploy lifecycle works for any artifact kind.

### Strategic Considerations

1. **Flows vs. AgentTeam** — Long-term, a general-purpose Flow engine could subsume AgentTeam's four fixed patterns. AgentTeam would become syntactic sugar for common flow patterns. This reduces maintenance burden and increases flexibility.

2. **OAS as import format, not replacement** — Arachne should support OAS import/export while maintaining its own spec format. The Arachne spec format is optimized for Arachne's deployment model (multi-tenant, provider-agnostic, encrypted). OAS is a portability format.

3. **Differentiation through runtime** — OAS explicitly decouples spec from runtime. Arachne's value add is the runtime: multi-tenant isolation, encryption, observability, provider routing. Supporting OAS specs makes Arachne's runtime accessible to the broader OAS ecosystem.

4. **Open spec alignment** — Arachne's roadmap includes "Open Spec Governance" (Phase 4, #133). Aligning with or contributing to OAS could accelerate community adoption and reduce the burden of maintaining a proprietary spec format.
