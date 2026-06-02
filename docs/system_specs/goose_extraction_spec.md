# Goose Component Extraction and Arachne Integration Specification

**Date:** 2026-04-08
**Status:** Draft (pending Neo + Morpheus review)
**Source:** Synaptic-Weave/hephaestus (fork of aaif-goose/goose, Apache 2.0)
**Target:** Synaptic-Weave/arachne

---

## 1. Context

Goose is an open-source AI coding agent (39K stars, Rust, Apache 2.0) built by Block (formerly Square). It contains production-quality implementations of several capabilities that are on Arachne's roadmap but not yet built: MCP tool execution, ACP agent coordination, provider gateway with streaming/fallback, context management, and sandboxed code execution.

Rather than building these from scratch in TypeScript, we extract the relevant Rust crates from Goose and integrate them as Arachne's high-performance core. The existing TypeScript API layer (Fastify) remains as the tenant-facing surface; the Rust core handles the compute-intensive agent runtime operations.

This also establishes the architecture for **Forge**, a CLI/desktop coding agent client that connects to Arachne, and **Hephaestus**, the coding agent persona that runs as an Arachne agent.

---

## 2. Architecture

### Current Arachne
```
Client → Fastify API (TypeScript) → LLM Provider → Response
              ↓
         PostgreSQL (tenants, agents, conversations, traces)
         pgvector (knowledge base RAG)
```

### Target Arachne (with Goose extraction)

Forge IS a local Arachne instance. Not a thin client connecting to one. Tools run locally, code never leaves the machine, only inference calls go out (and even those are optional with Ollama).

```
┌──────────────────────────────────────────────────────────────┐
│ FORGE (Local Arachne Instance)                                │
│ CLI + Electron Desktop App                                    │
│                                                               │
│  Rust Agent Core (extracted from Goose):                      │
│    ├── MCP Host — LOCAL tool execution                        │
│    │   ├── file-editor (read/write/edit files)                │
│    │   ├── shell (execute commands)                           │
│    │   ├── search (grep, glob, find)                          │
│    │   └── total-recall (memory search)                       │
│    ├── ACP — agent-to-agent coordination                      │
│    ├── Context Manager — compression + Total Recall hooks     │
│    └── Execution Sandbox — safe code/shell execution          │
│                                                               │
│  Local Storage:                                               │
│    ├── Total Recall SQLite (offline memory cache)             │
│    └── Agent state and conversation history                   │
│                                                               │
│  Agents:                                                      │
│    ├── Hephaestus (coding agent, pre-loaded)                  │
│    └── User-installed agents (from registry)                  │
│                                                               │
│  Model Routing (configurable):                                │
│    ├── Ollama (fully local, free, zero network)               │
│    ├── Arachne Cloud (our hosted Vertex AI / Claude Opus)     │
│    └── Arachne Enterprise (customer's self-hosted instance)   │
│                                                               │
│  Sync (optional):                                             │
│    ├── Total Recall Cloud (memory across machines)            │
│    └── Arachne Cloud Registry (push/pull agent artifacts)     │
└──────────────────────────────────────────────────────────────┘

                    ▲ optional sync ▲
                    │               │
        ┌───────────┴──┐    ┌──────┴──────────────────────┐
        │ Total Recall │    │ Arachne Cloud / Enterprise   │
        │ Cloud        │    │                              │
        │ Memory sync  │    │ Hosted providers (Vertex AI) │
        │ Team memory  │    │ Agent registry               │
        │              │    │ Team management               │
        └──────────────┘    │ Billing, observability       │
                            │ Multi-tenant governance      │
                            └─────────────────────────────┘
```

### Key Principle: Code Never Leaves the Machine

- **File reads/writes**: Always local. MCP tools run in Forge's local Arachne instance.
- **Shell commands**: Always local. Execution sandbox runs on the user's machine.
- **Search/grep**: Always local. No code sent to any server.
- **Memory**: Local SQLite first. Cloud sync is optional and encrypted (vector rotation).
- **Inference**: Only the conversation goes to the model provider. Even this is optional with Ollama.
- **Fully offline capable**: Ollama + local SQLite + local tools = zero network required.

### The "Docker for AI" Analogy

| Docker | Arachne |
|--------|---------|
| Docker Desktop | Forge (local Arachne instance for developers) |
| Docker Engine | Arachne Core (Rust runtime extracted from Goose) |
| Container | Agent artifact (YAML spec + prompt + tools + knowledge base) |
| Docker Hub | Arachne Cloud Registry (push/pull agents) |
| Dockerfile | Agent definition YAML |
| Docker Compose | Agent team orchestration (ACP) |
| ECS / Kubernetes | Arachne Cloud / Enterprise (hosted multi-tenant runtime) |
| Volume mounts | MCP tool connections (local file system, shell, etc.) |

A developer installs Forge, gets a full local Arachne with Hephaestus pre-loaded. Their code stays local. Their agents are portable. They can push agents to Arachne Cloud or their company's Arachne Enterprise, just like pushing a Docker image to a registry.

---

## 3. Goose Crates to Extract

### 3.1 MCP Host (`goose-mcp`)

**What it provides:**
- Full MCP client implementation (connect to MCP servers, invoke tools, handle responses)
- MCP server implementation (expose tools to other agents)
- Tool discovery and schema validation
- Streaming tool results

**Maps to Arachne gap:**
- Issue #136: Tool execution spec (unimplemented)
- Tool package format spec (`arachne_tool_package_spec.md`)
- Currently agents have no tool execution capability beyond RAG retrieval

**Integration approach:**
- Extract `crates/goose-mcp` as a standalone Rust library
- Expose via FFI (napi-rs) to the TypeScript layer, or run as a sidecar process
- Each Arachne agent deployment gets an MCP host with configured tool servers
- Tool packages defined in YAML (existing spec) map to MCP server configurations

**Stories:**
1. Extract goose-mcp crate, build as standalone library
2. Create napi-rs bindings (or gRPC sidecar) for TypeScript integration
3. Wire MCP host into Arachne agent execution pipeline
4. Map Arachne tool package YAML to MCP server configs
5. Add tool execution tracing to observability pipeline

### 3.2 ACP Agent Coordination (`goose-acp`)

**What it provides:**
- Agent-to-agent communication protocol
- Message passing between agents
- Coordination patterns (sequential, parallel, delegation)
- Agent discovery and capability advertisement

**Maps to Arachne gap:**
- Multi-agent orchestration (listed as "coming soon" in platform docs)
- Agent chaining and workflow execution
- The Matrix team pattern (multiple specialist agents coordinating) as a first-class platform feature

**Integration approach:**
- Extract `crates/goose-acp` as standalone library
- ACP becomes the protocol for Arachne's multi-agent orchestration
- Tenant-defined agent teams coordinate via ACP
- Each agent is an ACP participant with declared capabilities

**Stories:**
1. Extract goose-acp crate
2. Define Arachne agent ↔ ACP participant mapping
3. Implement agent team orchestration via ACP (sequential, parallel, delegation)
4. Add agent coordination tracing
5. Expose team orchestration in portal UI (workflow designer from existing spec)

### 3.3 Provider Gateway (`goose/src/gateway/`)

**What it provides:**
- Multi-provider LLM routing (OpenAI, Anthropic, Google, Ollama, Azure, etc.)
- Streaming response handling
- Automatic fallback chains (primary → secondary → local)
- Token counting and cost estimation
- Rate limiting and retry logic

**Maps to Arachne gap:**
- Arachne already has a TypeScript provider gateway, but Goose's Rust version is faster and more mature
- Fallback chains are not implemented in Arachne
- Streaming is handled but could be more robust

**Integration approach:**
- Don't replace the TypeScript gateway immediately
- Extract the provider abstraction patterns and fallback chain logic
- Port the streaming improvements back to TypeScript, or gradually migrate hot paths to Rust
- Add Vertex AI provider (for Claude Opus via GCP credits)

**Stories:**
1. Audit Goose provider gateway vs Arachne gateway (feature comparison)
2. Port fallback chain logic to Arachne TypeScript gateway
3. Add Vertex AI provider to Arachne
4. Evaluate FFI bridge for streaming performance (future)

### 3.4 Context Management (`goose/src/context_mgmt/`)

**What it provides:**
- Context window tracking (token counting per message)
- Compression decision logic (when to compress, what to keep)
- Summary generation for compressed context
- Hook system for pre/post compression events

**Maps to Arachne gap:**
- Arachne conversation management exists but has no intelligent compression
- Total Recall PreCompact/PostCompact hooks need a compression system to hook into
- Long-running agent conversations need context management

**Integration approach:**
- Extract context management patterns
- Integrate with Total Recall: before compression, save to knowledge graph; after compression, re-inject relevant context
- This is the core of the "agents with memory" value proposition

**Stories:**
1. Extract context management logic from Goose
2. Define Arachne context management interface
3. Integrate Total Recall PreCompact hook (save before compress)
4. Integrate Total Recall PostCompact hook (re-inject after compress)
5. Add context management configuration per agent (max tokens, compression strategy)

### 3.5 Execution Sandbox (`goose/src/execution/`)

**What it provides:**
- Safe shell command execution with timeouts
- File system read/write with permission controls
- Code execution in sandboxed environments
- Output capture and streaming

**Maps to Arachne gap:**
- Arachne agents currently can't execute code or modify files
- Tool execution (MCP) needs a safe execution environment
- Enterprise deployments need sandboxing (agents shouldn't escape their tenant boundary)

**Integration approach:**
- Extract execution primitives
- Layer tenant isolation on top (each agent runs in its tenant's sandbox)
- Integrate with MCP tools (file edit tool uses the sandbox, shell tool uses the sandbox)

**Stories:**
1. Extract execution sandbox from Goose
2. Add tenant-scoped file system access (agents only see their tenant's workspace)
3. Add tenant-scoped shell execution (resource limits, network restrictions)
4. Integrate sandbox with MCP tool execution

---

## 4. Forge as Local Arachne Instance

### 4.1 What Forge Is

Forge is a local Arachne instance packaged as a developer tool (CLI + Electron desktop). It IS Arachne, running on the developer's machine, with Hephaestus pre-loaded as the default coding agent. Think: "Docker Desktop is Docker purpose-built for developers. Forge is Arachne purpose-built for developers."

### 4.2 Forge Responsibilities

- **Full local Arachne runtime** (Rust core: MCP, ACP, context management, execution sandbox)
- **Local tool execution** (file edit, shell, search, all MCP tools run locally)
- **Local memory** (Total Recall SQLite, offline-first, optional cloud sync)
- **Model routing** (Ollama for local, Arachne Cloud for hosted providers, Enterprise for self-hosted)
- **Agent management** (install agents from registry, configure tools, manage knowledge bases)
- **Terminal UI and desktop app** (from Goose's ui/ directory, Forge-branded)

### 4.3 What Forge Does NOT Do Locally

- **Multi-tenancy** (that's Arachne Cloud / Enterprise)
- **Billing** (that's Arachne Cloud)
- **Team management** (that's Arachne Cloud / Enterprise, though team memory syncs via Total Recall)

### 4.4 Forge Modes

**Fully local (offline):**
```
Forge (local Arachne) → Hephaestus → Ollama (local inference)
  ├── Tools: local MCP (file, shell, search)
  ├── Memory: local SQLite only
  └── Network: none required
```

**Local + cloud inference:**
```
Forge (local Arachne) → Hephaestus → Arachne Cloud → Vertex AI / Claude Opus
  ├── Tools: local MCP (file, shell, search) — code stays local
  ├── Memory: local SQLite + Total Recall Cloud sync
  └── Network: only inference calls + memory sync
```

**Local + enterprise:**
```
Forge (local Arachne) → Hephaestus → Arachne Enterprise (company-hosted)
  ├── Tools: local MCP — code stays local
  ├── Memory: local SQLite + company Total Recall instance
  ├── Agents: pulled from company's private registry
  └── Governance: company content policies enforced
```

---

## 5. Hephaestus as Arachne Agent

### 5.1 What Hephaestus Is

Hephaestus is a coding agent deployed on the Arachne platform. It is defined as an Arachne agent artifact (YAML spec + system prompt + tool configuration + knowledge base refs).

### 5.2 Agent Definition

```yaml
name: hephaestus
version: 1.0.0
kind: Agent
spec:
  system_prompt: |
    You are Hephaestus, an AI coding agent. You help developers write,
    debug, and refactor code. You have access to the user's file system,
    shell, and search tools via MCP. You remember context from prior
    sessions via Total Recall.
  model:
    provider: vertex-ai
    model: claude-opus-4-6
    fallback:
      - provider: anthropic
        model: claude-opus-4-6
      - provider: ollama
        model: qwen2.5-coder:32b
  tools:
    - mcp://file-editor          # read, write, edit files
    - mcp://shell                # execute shell commands
    - mcp://search               # grep, glob, find
    - mcp://browser              # web fetch, documentation lookup
    - mcp://total-recall         # session memory search
  knowledge_bases:
    - total-recall://user/{user_id}/sessions    # all prior sessions
    - total-recall://user/{user_id}/codebase    # indexed codebase
  memory:
    provider: total-recall
    precompact: true             # save before compression
    postcompact: true            # re-inject after compression
  context:
    max_tokens: 200000
    compression_strategy: total-recall   # use TR instead of built-in
```

### 5.3 Hephaestus Differentiators (vs. vanilla Goose)

| Feature | Goose | Hephaestus on Arachne |
|---------|-------|-----------------------|
| Memory | Session-only, lost on exit | Total Recall: persistent across sessions, searchable, synced across machines |
| Deployment | Local only | Cloud, local, or hybrid via Arachne |
| Multi-agent | Single agent | Can delegate to other Arachne agents (QA agent, DevOps agent, etc.) via ACP |
| Observability | Basic logging | Full Arachne tracing (tokens, latency, cost per request) |
| Governance | None | Arachne content policies, rate limits, budget caps |
| Team memory | None | Shared team knowledge graph (with privacy-preserving vector rotation) |
| Provider routing | Static config | Dynamic per-tenant, with fallback chains and cost optimization |

---

## 6. Integration Strategy

### Phase 1: Forge Ships (Now)
- Forge = Goose fork with Forge branding + Total Recall memory plugin
- Forge IS a local Arachne instance (even if minimal at first)
- Ships as CLI + desktop app, works with Ollama (local) or any cloud provider
- Hephaestus pre-loaded as default coding agent
- Validates the UX and builds user base
- "Your code never leaves your machine"

### Phase 2: Arachne Core in Rust (Next)
- Extract MCP, ACP, provider gateway, context management from Goose
- Formalize as `arachne-core` Rust crates (the engine that powers both Forge locally and Arachne Cloud remotely)
- Same core runs everywhere: developer laptop, cloud instance, enterprise server
- Agent artifacts are portable: define once, run on any Arachne instance

### Phase 3: Arachne Cloud + Registry (After)
- Arachne Cloud = hosted multi-tenant Arachne with Vertex AI providers
- Agent registry: push/pull agent artifacts (like Docker Hub)
- Forge connects to Arachne Cloud for: hosted inference, team memory sync, agent marketplace
- Enterprise customers self-host Arachne with their own providers and governance

### Phase 4: Platform + Ecosystem (Future)
- Multiple clients: Forge (coding), Charlotte (voice), web IDE, VS Code extension, mobile
- Agent marketplace: third-party agents, tool packages, knowledge base templates
- Team features: shared memory with privacy-preserving vector rotation, audit logs, SSO
- Arachne becomes the "Docker Hub + Kubernetes" of AI agents

---

## 7. Licensing

All extracted Goose components retain their Apache 2.0 license. Arachne's TypeScript layer and Forge's UI customizations are proprietary to Synaptic Weave, Inc. The Rust core crates extracted from Goose are published as open-source Apache 2.0 under the Synaptic-Weave org with attribution to Block/AAIF.

This satisfies Apache 2.0 requirements:
- Original license and NOTICE file included
- Changes documented
- No claim of endorsement by Block

---

## 8. Stories (Summary)

| # | Story | Phase | Team |
|---|-------|-------|------|
| 1 | Extract goose-mcp as standalone crate | 2 | Tank |
| 2 | Create napi-rs bindings for MCP host | 2 | Tank |
| 3 | Wire MCP into Arachne agent execution | 2 | Tank |
| 4 | Extract goose-acp as standalone crate | 2 | Tank |
| 5 | Define agent ↔ ACP participant mapping | 2 | Architect |
| 6 | Implement multi-agent orchestration via ACP | 3 | Tank + Oracle |
| 7 | Audit Goose vs Arachne provider gateway | 2 | Oracle |
| 8 | Port fallback chain logic to Arachne | 2 | Tank |
| 9 | Add Vertex AI provider to Arachne | 2 | Tank + Oracle |
| 10 | Extract context management from Goose | 2 | Tank |
| 11 | Integrate Total Recall Pre/PostCompact | 2 | Oracle |
| 12 | Extract execution sandbox from Goose | 2 | Tank |
| 13 | Add tenant-scoped sandbox isolation | 3 | Tank + Niobe |
| 14 | Define Hephaestus agent YAML artifact | 3 | Architect + Neo |
| 15 | Forge standalone mode (Goose + TR plugin) | 1 | Switch + Tank |
| 16 | Forge → Arachne connection mode | 3 | Switch + Tank |
| 17 | Forge branding and UX customization | 1 | Trinity + Switch |

---

## 9. Open Questions

1. **FFI vs sidecar**: Should the Rust core be called via napi-rs FFI (faster, tighter integration) or as a gRPC sidecar process (simpler deployment, language-agnostic)? Tank to evaluate.
2. **Goose upstream contributions**: Should we contribute Arachne-specific improvements back to Goose? Good for community, but exposes our roadmap.
3. **Standalone mode longevity**: How long does Forge standalone mode (Phase 1) last before we require Arachne? Need to balance user adoption vs platform lock-in.
4. **Agent marketplace timeline**: When do we open Arachne to third-party agents? Phase 4, but need to plan the artifact format now.
