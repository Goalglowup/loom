# Open Agent Spec (OAS) ↔ Arachne — Concept Mapping & Gap Analysis

**Author:** Oracle (AI Systems Advisor)
**Date:** April 1, 2026
**Status:** Draft

---

## 1. Executive Summary

The [Open Agent Spec](https://github.com/oracle/agent-spec) (OAS, also known as PyAgentSpec) is Oracle's portable, platform-agnostic configuration language for describing AI agents and workflows. [WayFlow](https://oracle.github.io/wayflow/26.1.1/) is Oracle's reference runtime that executes OAS definitions. OAS emphasizes **portability across frameworks** (LangGraph, AutoGen, CrewAI adapters) and **declarative agent definition** (YAML/JSON serialization).

Arachne is Synaptic Weave's **AI runtime and deployment platform** with a full artifact lifecycle (weave → push → deploy), multi-tenant isolation, encrypted observability, conversation memory, and a proprietary communication protocol (ACP). Arachne uses YAML spec files with `apiVersion`/`kind`/`metadata`/`spec` structure, inspired by Kubernetes resource manifests.

**Key Finding:** The two systems share the same fundamental concepts (agents, tools, multi-agent coordination, LLM abstraction) but differ significantly in scope and emphasis. OAS is a **specification and serialization format** with runtime adapters; Arachne is a **full deployment runtime** with multi-tenancy, encryption, and operational infrastructure. A compatibility layer is feasible, and Arachne could become an OAS-compatible runtime while retaining its differentiating features.

---

## 2. Side-by-Side Concept Table

| # | OAS Concept | OAS Module | Arachne Equivalent | Arachne Spec/Module | Notes |
|---|-------------|------------|---------------------|---------------------|-------|
| 1 | **Component** (base class) | `component.py` — `id`, `name`, `description`, `metadata`, `component_type` | **Artifact** — `apiVersion`, `kind`, `metadata.name`, `spec` | Workspace spec, all artifact kinds | OAS uses Pydantic models with auto-generated `id`; Arachne uses K8s-style manifests. Both are YAML-serializable. |
| 2 | **Agent** | `agent.py` — `system_prompt`, `llm_config`, `tools`, `toolboxes`, `human_in_the_loop`, `transforms` | **Agent** (`kind: Agent`) | `agent_team_spec.md`, `architecture.md` | Near 1:1 mapping. OAS Agent has `transforms` (message middleware); Arachne has `knowledgeBaseRef`, `channels`, `schedule`. |
| 3 | **LlmConfig** | `llms/llmconfig.py` — abstract, with `OciGenAiConfig`, `OpenAiConfig`, `OllamaConfig`, `GeminiConfig`, `VllmConfig`, `OpenAiCompatibleConfig` | **Provider Config** (`provider_config` JSONB on Tenant entity) + **BaseProvider** adapter pattern | `architecture.md` §9 | OAS binds LLM config per-agent; Arachne inherits provider config per-tenant with agent-level model override. Arachne's provider registry is a runtime adapter layer comparable to OAS's framework adapters. |
| 4 | **LlmGenerationConfig** | `llms/llmgenerationconfig.py` — temperature, top_p, max_tokens, stop sequences | **Request body parameters** | Passed through in chat completion request | OAS makes generation params a first-class config object; Arachne passes them through the OpenAI-compatible API surface. |
| 5 | **Tool** (abstract) | `tools/tool.py` — `requires_confirmation`, inherits `ComponentWithIO` (inputs/outputs) | **Tool** (within `ToolPackage`) | `agent_tools.md` | Both define tools with name, description, input/output schemas. |
| 6 | **ServerTool** | `tools/servertool.py` — "executed by the orchestrator" | **ToolPackage handler** (server-side execution in sandbox) | `agent_tools.md` §Step 6 | Arachne executes tool handlers in Azure Container Apps Dynamic Sessions; OAS delegates to the runtime adapter. |
| 7 | **ClientTool** | `tools/clienttool.py` — "run by the client application" | **MCP tool** (client-side execution via MCP round-trip) | `architecture.md` §3.1 | Arachne's MCP round-trip pattern maps to OAS's ClientTool concept — the client application provides the tool result. |
| 8 | **RemoteTool** | `tools/remotetool.py` — remote endpoint tool | **Webhook tool / MCP endpoint** | `agent_tools.md` | Both support calling external endpoints as tool execution. |
| 9 | **ToolBox** | `tools/toolbox.py` — collection of related tools | **ToolPackage** (`kind: ToolPackage`) | `agent_tools.md` §Tool Package | 1:1 mapping. Both group related tools into a versioned, distributable unit. |
| 10 | **Flow** | `flows/flow.py` — DAG of nodes with control-flow and data-flow edges | **No direct equivalent** | — | **Gap in Arachne.** OAS Flows are structured DAG workflows with typed nodes (LLM, Tool, API, Branching, Parallel, Map). Arachne's AgentTeam coordination patterns (routing, handoff, parallel, supervisor) cover a subset of flow patterns but are not general-purpose DAGs. |
| 11 | **Flow Nodes** — `StartNode`, `EndNode`, `AgentNode`, `LlmNode`, `ToolNode`, `ApiNode`, `BranchingNode`, `MapNode`, `ParallelFlowNode`, `ParallelMapNode`, `CatchExceptionNode`, `InputMessageNode`, `OutputMessageNode`, `FlowNode` (sub-flow) | `flows/nodes/` | **Coordination patterns** (routing, handoff, parallel, supervisor) | `agent_team_spec.md` | Arachne has 4 fixed patterns; OAS has 14+ composable node types. OAS is significantly richer here. |
| 12 | **Control-Flow Edge** | `flows/edges/controlflowedge.py` — transitions between nodes | **Coordination pattern logic** (implicit in pattern) | `agent_team_spec.md` | Arachne's edges are implicit in the pattern definition; OAS edges are explicit, user-defined. |
| 13 | **Data-Flow Edge** | `flows/edges/dataflowedge.py` — property mappings between node I/O | **No equivalent** | — | **Gap in Arachne.** Arachne passes outputs between pipeline stages as message content, not as typed property mappings. |
| 14 | **Swarm** | `swarm.py` — multi-agent with `relationships`, `first_agent`, `HandoffMode` (NEVER/OPTIONAL/ALWAYS) | **AgentTeam** with `coordination: routing` or `coordination: supervisor` | `agent_team_spec.md` | Partial mapping. OAS Swarm defines pairwise agent relationships and handoff modes; Arachne uses declarative patterns. Arachne's routing pattern maps to Swarm with directed relationships; supervisor maps to Swarm with OPTIONAL handoff. |
| 15 | **ManagerWorkers** | `managerworkers.py` — `group_manager` + `workers[]` | **AgentTeam** with `coordination: supervisor` | `agent_team_spec.md` §Supervisor | Strong mapping. OAS `group_manager` → Arachne `spec.supervisor.agent`; OAS `workers[]` → Arachne `spec.supervisor.workers[]`. Arachne adds `maxIterations` safety limit. |
| 16 | **HandoffMode** | In Swarm: `NEVER`, `OPTIONAL`, `ALWAYS` | **Coordination pattern selection** | `agent_team_spec.md` | OAS HandoffMode is per-Swarm; Arachne's coordination patterns implicitly encode handoff behavior (handoff pattern = ALWAYS; routing = NEVER; supervisor = OPTIONAL). |
| 17 | **Datastore** | `datastores/datastore.py` — `RelationalDatastore`, `InMemoryCollectionDatastore`, `OracleDatastore`, `PostgresDatastore` | **KnowledgeBase** (`kind: KnowledgeBase`) + **Conversation Memory** | `arachne_workspace_spec.md`, `architecture.md` §3.1 | Partial mapping. OAS Datastores provide structured data (SQL, collections); Arachne KBs provide RAG retrieval (embeddings + chunks). Arachne conversation memory provides session state. Neither system fully covers the other's use case. |
| 18 | **Property** | `property.py` — JSON Schema-based input/output definitions | **JSON Schema in tool definitions** | `agent_tools.md` §Tool Manifest | Both use JSON Schema for typing. OAS makes Property a first-class component used across agents, flows, and tools. Arachne uses JSON Schema specifically in tool input/output definitions. |
| 19 | **Framework Adapter** | `adapters/` — LangGraph, AutoGen, CrewAI adapters | **No equivalent (Arachne IS the runtime)** | — | Arachne doesn't need framework adapters because it is its own execution runtime. OAS needs adapters because it is a spec, not a runtime. |
| 20 | **Serialization** (to_yaml, to_json, to_dict) | `serialization/` | **Weave pipeline** (YAML → .orb bundle) | `arachne_workspace_spec.md` | OAS serializes components to portable YAML/JSON; Arachne weaves YAML specs into deployable `.orb` bundles. Arachne's format is richer (includes embeddings, chunks, hashes). |
| 21 | **Version-aware serialization** | `min_agentspec_version`, `max_agentspec_version`, field exclusion by version | **`apiVersion: arachne-ai.com/v0`** | All specs | OAS has fine-grained per-field versioning; Arachne has document-level API versioning. OAS is more sophisticated here. |
| 22 | **RetryPolicy** | `retrypolicy.py` — retry config for LLM calls | **retryPolicy** on Schedule, DLQ on AgentBus | `agent_scheduling.md`, `agent_messaging.md` | Both support retry with backoff. OAS attaches retry to LLM config; Arachne attaches to scheduling and messaging. |
| 23 | **Message Transforms** | `transforms/` — pre-LLM message transforms | **Agent application** (`applyAgentToRequest()`) | `architecture.md` §3.1 | Arachne's agent engine performs system prompt injection, skill merging, and RAG context injection — comparable to OAS transforms but not user-extensible as a plugin point. |
| 24 | **Tracing** | `tracing/` module | **Trace Recorder** + **ACP Trace Reconstruction** | `architecture.md` §3.4, `arachne_communication_protocol_spec.md` §Trace Reconstruction | Arachne's tracing is significantly richer: encrypted at rest, per-tenant isolation, batched async persistence, DAG reconstruction from ACP messages. |
| 25 | **A2A Agent** | `a2aagent.py` — Agent-to-Agent protocol | **ACP (Arachne Communication Protocol)** | `arachne_communication_protocol_spec.md` | Both define agent-to-agent communication. ACP is more comprehensive: semantic map compression, budget propagation, intent codes, trace reconstruction. |
| 26 | **MCP Integration** | `mcp/` module | **MCP round-trip** in proxy pipeline | `architecture.md` §3.1 | Both support MCP. Arachne uses MCP for external tool integration (human-facing); ACP for internal agent-to-agent. |
| 27 | **Evaluation** | `evaluation/` module | **Agent Evaluation Framework** (Phase 3 roadmap) | `product-roadmap.md` §3.1 | Both support agent evaluation. OAS has it now; Arachne has it on the roadmap for June-September 2026. |
| 28 | — | — | **Multi-tenancy** (Tenant entity, API key isolation, subtenant hierarchy) | `architecture.md` §5 | **No OAS equivalent.** OAS has no concept of tenants, isolation, or multi-user access control. |
| 29 | — | — | **Encryption at rest** (AES-256-GCM, per-tenant key derivation) | `architecture.md` §10 | **No OAS equivalent.** OAS has no encryption model. |
| 30 | — | — | **Channels** (named, tenant-scoped pub/sub) | `agent_messaging.md` | **No OAS equivalent.** OAS agents communicate through Swarm relationships or ManagerWorkers hierarchy, not named channels. |
| 31 | — | — | **Schedule** (cron-based agent execution) | `agent_scheduling.md` | **No OAS equivalent.** OAS focuses on interactive execution, not scheduled/autonomous agent runs. |
| 32 | — | — | **Workspace** (dependency graph, cross-reference resolution, `.orb` bundles) | `arachne_workspace_spec.md` | **No OAS equivalent.** OAS agents are standalone YAML/JSON definitions without a deployment lifecycle. |
| 33 | — | — | **Budget Propagation** (token/cost/TTL budgets in ACP) | `arachne_communication_protocol_spec.md` §Budget Propagation | **No OAS equivalent.** OAS has no built-in cost governance. |
| 34 | — | — | **Conversation Memory** (sliding window, summarization, partitions) | `architecture.md` §3.1 | **No OAS equivalent.** OAS agents are stateless by default; memory is handled by the runtime adapter. |

---

## 3. Translation Examples

### 3.1 Simple Agent Definition

**OAS (YAML export):**

```yaml
component_type: Agent
name: support-agent
description: Customer support specialist
system_prompt: |
  You are a customer support agent for {{company_name}}.
  Help customers with billing and technical issues.
llm_config:
  component_type: OpenAiConfig
  name: gpt-config
  model_id: gpt-4.1-mini
tools:
  - component_type: ServerTool
    name: lookup-order
    description: Look up an order by ID
    inputs:
      - title: order_id
        type: string
    outputs:
      - title: order_details
        type: object
human_in_the_loop: true
inputs:
  - title: company_name
    type: string
```

**Arachne (YAML spec):**

```yaml
apiVersion: arachne-ai.com/v0
kind: Agent
metadata:
  name: support-agent
spec:
  model: gpt-4.1-mini
  systemPrompt: |
    You are a customer support agent for Acme Corp.
    Help customers with billing and technical issues.
  knowledgeBaseRef: support-kb
  toolPackageRef: support-tools
  channels:
    subscribe:
      - customer-intake
    publish:
      - resolved-tickets
```

**Key differences:**
- OAS uses template variables (`{{company_name}}`); Arachne hardcodes values in the spec (variables resolved at deploy time via tenant config).
- OAS embeds LLM config and tool definitions inline; Arachne references external artifacts (`knowledgeBaseRef`, `toolPackageRef`) and inherits provider config from the tenant hierarchy.
- Arachne adds channel wiring and KB references — operational concerns absent from OAS.

---

### 3.2 Multi-Agent Coordination: Supervisor Pattern

**OAS (ManagerWorkers):**

```yaml
component_type: ManagerWorkers
name: analysis-team
group_manager:
  component_type: Agent
  name: manager
  system_prompt: |
    Coordinate the analysis team. Assign tasks to the
    appropriate specialist based on the request.
  llm_config:
    component_type: OpenAiConfig
    name: manager-llm
    model_id: gpt-4.1
workers:
  - component_type: Agent
    name: data-retriever
    system_prompt: "You retrieve and summarize data..."
    llm_config:
      component_type: OpenAiConfig
      name: retriever-llm
      model_id: gpt-4.1-mini
  - component_type: Agent
    name: analyst
    system_prompt: "You perform quantitative analysis..."
    llm_config:
      component_type: OpenAiConfig
      name: analyst-llm
      model_id: gpt-4.1
```

**Arachne (AgentTeam with supervisor coordination):**

```yaml
apiVersion: arachne-ai.com/v0
kind: AgentTeam
metadata:
  name: analysis-team
spec:
  coordination: supervisor
  supervisor:
    agent: manager
    maxIterations: 5
    workers:
      - agent: data-retriever
        description: "Retrieves and summarizes data"
      - agent: analyst
        description: "Performs quantitative analysis"
  agents:
    - ref: manager
    - ref: data-retriever
    - ref: analyst
  sharedKnowledgeBases:
    - company-data-kb
---
apiVersion: arachne-ai.com/v0
kind: Agent
metadata:
  name: manager
spec:
  model: gpt-4.1
  systemPrompt: |
    Coordinate the analysis team. Assign tasks to the
    appropriate specialist based on the request.
---
apiVersion: arachne-ai.com/v0
kind: Agent
metadata:
  name: data-retriever
spec:
  model: gpt-4.1-mini
  systemPrompt: "You retrieve and summarize data..."
---
apiVersion: arachne-ai.com/v0
kind: Agent
metadata:
  name: analyst
spec:
  model: gpt-4.1
  systemPrompt: "You perform quantitative analysis..."
```

**Key differences:**
- OAS embeds agent definitions inline within the ManagerWorkers component; Arachne defines agents as separate artifacts and references them by name.
- Arachne adds `maxIterations` safety limit, `sharedKnowledgeBases`, and the `agents` manifest for workspace dependency resolution.
- Arachne's separation of concerns (each agent is an independently deployable artifact) enables reuse across teams.

---

### 3.3 Swarm → Routing Pattern

**OAS (Swarm with relationships):**

```yaml
component_type: Swarm
name: support-swarm
first_agent:
  component_type: Agent
  name: triage
  system_prompt: "Classify the request and route it."
  llm_config:
    component_type: OpenAiConfig
    name: triage-llm
    model_id: gpt-4.1-mini
relationships:
  - - triage
    - billing-specialist
  - - triage
    - tech-specialist
handoff: ALWAYS
```

**Arachne (AgentTeam with routing):**

```yaml
apiVersion: arachne-ai.com/v0
kind: AgentTeam
metadata:
  name: support-team
spec:
  coordination: routing
  router:
    agent: triage
    routes:
      - intent: billing
        agent: billing-specialist
      - intent: technical
        agent: tech-specialist
    fallback: general-agent
  agents:
    - ref: triage
    - ref: billing-specialist
    - ref: tech-specialist
    - ref: general-agent
```

**Key differences:**
- OAS uses pairwise `relationships` tuples; Arachne uses structured `routes` with named intents.
- Arachne requires a `fallback` agent (defensive design); OAS has no fallback concept.
- OAS `handoff: ALWAYS` means full conversation context transfer; Arachne's routing passes the original request to the specialist (lighter weight).

---

### 3.4 Flow DAG (OAS-Only — No Arachne Equivalent)

**OAS Flow — no direct Arachne translation exists:**

```yaml
component_type: Flow
name: document-processing
start_node:
  component_type: StartNode
  name: start
  inputs:
    - title: document_url
      type: string
nodes:
  - component_type: ToolNode
    name: fetch-doc
    tool: web.read
  - component_type: LlmNode
    name: extract-entities
    llm_config:
      component_type: OpenAiConfig
      name: extraction-llm
      model_id: gpt-4.1-mini
    system_prompt: "Extract all named entities..."
  - component_type: BranchingNode
    name: check-type
    branches: [legal, financial, other]
  - component_type: AgentNode
    name: legal-review
    agent: legal-agent
  - component_type: AgentNode
    name: financial-review
    agent: financial-agent
  - component_type: EndNode
    name: done
control_flow_connections:
  - from: start
    to: fetch-doc
  - from: fetch-doc
    to: extract-entities
  - from: extract-entities
    to: check-type
  - from: check-type
    to: legal-review
    branch: legal
  - from: check-type
    to: financial-review
    branch: financial
  - from: check-type
    to: done
    branch: other
  - from: legal-review
    to: done
  - from: financial-review
    to: done
data_flow_connections:
  - from: fetch-doc
    to: extract-entities
    mappings:
      content: document_text
```

**Arachne approximation (would require a new `kind: Workflow` artifact):**

Arachne cannot currently represent this. The closest approximation uses a supervisor AgentTeam where the supervisor manually orchestrates the steps, but this loses the declarative DAG structure, typed nodes, conditional branching, and data-flow mappings.

---

## 4. Where Arachne's Model Is Richer

| Capability | Arachne | OAS |
|------------|---------|-----|
| **Multi-tenancy** | First-class: tenant hierarchy, API key isolation, per-tenant provider config, subtenant rollup analytics | Not addressed — OAS is a spec, not a multi-tenant runtime |
| **Encryption at rest** | AES-256-GCM with per-tenant key derivation for traces, conversations, provider keys, KB chunks | Not addressed |
| **Observability / Tracing** | Encrypted trace recording, batched async persistence, monthly partitioning, analytics engine (summary, timeseries, model breakdown) | Basic `tracing/` module — runtime adapter dependent |
| **Agent Communication Protocol (ACP)** | Token-minimal protocol with semantic map compression (67% savings), budget propagation, intent codes, DAG trace reconstruction | No equivalent — relies on runtime framework for inter-agent messaging |
| **Budget / Cost Governance** | Token, cost, and TTL budgets propagated through ACP message chain with subdivision and rollup | Not addressed |
| **Conversation Memory** | Persistent multi-turn conversations with sliding window, automatic summarization, partitions, encrypted storage | Not addressed — stateless agents by default |
| **Artifact Lifecycle** | Full pipeline: `weave` (validate + bundle) → `push` (registry) → `deploy` (tenant environment), with dependency graph and `.orb` bundles | Serialization to YAML/JSON only — no deployment pipeline |
| **Workspace / Dependency Graph** | Cross-reference resolution (local workspace first, registry fallback), topological sort, circular dependency detection | Not addressed — components are standalone |
| **Channels / Named Pub-Sub** | Tenant-scoped channels with broadcast/directed/fan-out patterns, durable messaging with DLQ, declarative channel wiring in agent specs | Not addressed |
| **Scheduling** | Cron-based agent execution with gateway-initiated and webhook modes, retry policy, concurrency guard | Not addressed |
| **RAG Pipeline** | KnowledgeBase artifact with embedding, chunking, retrieval (topK, citations), hybrid search (roadmap) | Datastores provide structured data access but not vector search/RAG |
| **Portal / Dashboard / Admin** | Three web frontends for tenant self-service, operator observability, and system administration | Not addressed — OAS is a spec/SDK, not a product |

---

## 5. Where OAS's Model Is Richer

| Capability | OAS | Arachne |
|------------|-----|---------|
| **Flow DAGs** | Full DAG workflow engine with 14+ node types (StartNode, EndNode, AgentNode, LlmNode, ToolNode, ApiNode, BranchingNode, MapNode, ParallelFlowNode, ParallelMapNode, CatchExceptionNode, InputMessageNode, OutputMessageNode, FlowNode), explicit control-flow and data-flow edges, conditional branching, parallel execution, exception handling | 4 fixed coordination patterns (routing, handoff, parallel, supervisor) — no general-purpose workflow DAG |
| **Framework Adapters** | Adapters for LangGraph, AutoGen, CrewAI — write once, run on any framework | Arachne is a single runtime (no adapter model needed, but also no portability to other frameworks) |
| **No-code-in-config** | Pure declarative YAML/JSON — no code in the spec itself. Logic is in node types and edges, not custom code | Agent specs are declarative, but tool handlers require JavaScript code in the ToolPackage |
| **Swarm with Pairwise Relationships** | Fine-grained agent-to-agent relationship graph with 3 handoff modes (NEVER/OPTIONAL/ALWAYS) | AgentTeam patterns are coarser — routing, handoff, parallel, or supervisor. No pairwise relationship graphs |
| **Per-Field Versioning** | `min_agentspec_version` / `max_agentspec_version` per component, with automatic field exclusion for backward compatibility | Document-level `apiVersion` only — no per-field version awareness |
| **Template Variables** | `{{variable}}` interpolation in system prompts with typed `Property` inputs | No template variables in agent specs — values are hardcoded or inherited from tenant config |
| **Component Composition** | Agents, flows, swarms, and ManagerWorkers can be nested and composed arbitrarily | AgentTeam cannot nest (no team-of-teams in MVP) |
| **Structured Datastores** | SQL databases (Oracle, Postgres) as first-class agent data sources with entity schemas | KnowledgeBases provide document-based RAG only — no structured data source integration |
| **Human-in-the-Loop** | First-class `human_in_the_loop` flag and `requires_confirmation` on tools | No declarative human-in-the-loop mechanism — handled by client application |
| **Message Transforms** | Pluggable `MessageTransform` pipeline applied before LLM calls | Agent application is fixed (system prompt injection → skill merging → RAG injection) — not user-extensible |
| **A2A Protocol** | `a2aagent.py` — standardized agent-to-agent communication protocol | ACP is Arachne-specific (not interoperable with OAS A2A) |

---

## 6. Adoption Strategy Recommendations

### 6.1 Phase 1: OAS Import/Export Compatibility (Low effort, high signal)

**Goal:** Enable Arachne to import OAS YAML agent definitions and export Arachne agent specs as OAS YAML.

**Scope:**
- Import OAS `Agent` → Arachne `kind: Agent` (map `system_prompt`, `llm_config`, `tools`)
- Import OAS `ManagerWorkers` → Arachne `kind: AgentTeam` with `coordination: supervisor`
- Import OAS `Swarm` → Arachne `kind: AgentTeam` with `coordination: routing` (lossy — relationship graph reduced to routes)
- Export Arachne `kind: Agent` → OAS `Agent` YAML
- Skip OAS `Flow` import (no Arachne equivalent yet)

**Implementation:**
- Add `arachne import --format oas <file.yaml>` CLI command
- Add `arachne export --format oas <artifact>` CLI command
- Mapping layer handles field name translation and structural transformation

**Value:** Demonstrates interoperability with the OAS ecosystem. Enables migration from OAS-based prototyping to Arachne production deployment.

---

### 6.2 Phase 2: Flow DAG Support (Medium effort, high differentiation)

**Goal:** Add a `kind: Workflow` artifact to Arachne that supports DAG-style orchestration, inspired by OAS Flows.

**Scope:**
- New artifact kind: `Workflow` (participates in workspace dependency graph above AgentTeam)
- Node types: `start`, `end`, `agent` (invoke an agent), `tool` (invoke a tool), `branch` (conditional routing), `parallel` (fan-out/fan-in), `transform` (data mapping)
- Edge types: `controlFlow` (sequence), `dataFlow` (property mapping)
- Validation: acyclic graph, single start node, typed I/O compatibility between connected nodes
- Execution: TeamOrchestrator extended with a `WorkflowPattern` that interprets the DAG

**Arachne-native additions (not in OAS):**
- Budget propagation through workflow nodes (via ACP)
- Per-node tracing with `parentRequestId` linking
- Tenant-scoped execution with encryption
- Channel integration (workflow nodes can publish to channels)

**Value:** Closes the biggest gap in Arachne's orchestration model. Combined with Arachne's operational infrastructure (tenancy, encryption, tracing, budgets), this would create a workflow engine that is both more expressive than the current AgentTeam patterns and more production-ready than OAS Flows.

---

### 6.3 Phase 3: OAS Runtime Adapter (Medium effort, ecosystem play)

**Goal:** Publish an Arachne adapter for OAS, so that OAS-defined agents can run on the Arachne runtime without conversion.

**Scope:**
- Implement an `ArachneAdapter` that transforms OAS component trees into Arachne runtime calls
- Register with the OAS adapter ecosystem alongside LangGraph, AutoGen, and CrewAI adapters
- Support: Agent, ManagerWorkers, Swarm (and Flow if Phase 2 is complete)
- Arachne-specific features (tenancy, encryption, tracing) are automatically applied

**Value:** Positions Arachne as a first-class OAS runtime alongside WayFlow. Organizations using OAS for agent definitions get Arachne's operational infrastructure for free.

---

### 6.4 Phase 4: Spec Convergence (Long-term, strategic)

**Goal:** Contribute Arachne's differentiating concepts (budgets, channels, scheduling, encryption) back to OAS as optional extensions.

**Scope:**
- Propose OAS RFCs for: Budget envelope on agents/flows, Channel declarations, Schedule configurations, Encryption policies
- These would be optional OAS extensions that any OAS-compatible runtime can choose to support
- Arachne becomes the reference implementation for these extensions

**Value:** Shapes the OAS spec to include production-deployment concerns that are currently absent. Establishes Arachne as a thought leader in the OAS ecosystem.

---

## 7. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| OAS spec changes break the import/export layer | Medium | Medium | Pin to OAS version; use version-aware serialization |
| Flow DAG implementation is more complex than anticipated | High | Medium | Start with the 5 most common node types; defer MapNode and ParallelMapNode |
| OAS adoption remains Oracle-centric, limiting ecosystem value | Medium | Medium | The import/export layer has standalone value for migration paths |
| Arachne-specific extensions to OAS are rejected by the community | Low | Medium | Extensions are optional; Arachne benefits regardless of upstream adoption |

---

## 8. Summary

The OAS and Arachne architectures are **complementary, not competitive**. OAS provides a portable specification language for agent definitions; Arachne provides a production-grade runtime for deploying and operating agents. The most impactful adoption path is:

1. **Short-term:** Import/export compatibility to capture OAS-defined agents into Arachne's deployment pipeline
2. **Medium-term:** Flow DAG support to close Arachne's biggest orchestration gap
3. **Long-term:** Become an OAS-compatible runtime and contribute operational extensions back to the spec

This positions Arachne as "the place where OAS agents go to production" — a compelling value proposition that leverages both ecosystems.
