# Arachne Workflow Editor Specification

> Tracked by Epic [#TBD]

## Status

Draft -- MVP Specification

**Author:** Arachne Team (Trinity, UX Architect)
**Last Updated:** 2026-04-01

------------------------------------------------------------------------

## 1. Overview

The **Workflow Editor** is a visual drag-and-drop canvas for building,
editing, and debugging multi-agent workflows within the Arachne Portal
UI. It provides a node-graph interface where each node represents an
Arachne runtime concept (LLM call, tool invocation, conditional branch,
etc.) and edges represent data and control flow between steps.

Workflows built in the editor serialize to Arachne's declarative YAML
format (the same format consumed by the CLI's `arachne weave` pipeline)
and can be deployed through the standard artifact lifecycle. The editor
also supports live execution visualization, enabling operators to watch
token flow, budget consumption, and agent-to-agent messaging in real
time.

### 1.1 Design Goals

1. **Visual-first authoring.** Non-developer operators should be able to
   assemble agent workflows without writing YAML by hand.
2. **Round-trip fidelity.** YAML authored by hand or by the editor
   produces identical runtime behavior. The editor never introduces
   constructs the CLI cannot process.
3. **Arachne-native.** Node types map 1:1 to Arachne runtime concepts
   (Agent, AgentTeam coordination patterns, channels, schedules, KBs).
   The editor is not a generic flowchart tool.
4. **Observable.** Execution traces overlay directly on the canvas.
   Operators see which nodes fired, latency per node, token usage, and
   errors -- without leaving the editor.
5. **Tenant-scoped.** Workflows are tenant-owned artifacts, encrypted at
   rest, and subject to the same access control as other Arachne
   resources.
6. **Incrementally adoptable.** Users can import existing YAML specs
   into the editor and export editor workflows as YAML. Neither path is
   a one-way door.

### 1.2 Non-Goals (MVP)

- Collaborative real-time editing (multiplayer cursors).
- Version history / diff view (deferred to Phase 2).
- Custom node plugin system for tenant-defined node types.
- Mobile / tablet layout optimization.

------------------------------------------------------------------------

## 2. Technology Choice

### 2.1 React Flow (@xyflow/react)

The editor is built on **React Flow** (`@xyflow/react`), MIT licensed.

**Why React Flow:**

| Criterion | React Flow | Alternatives (rete.js, Flume, raw SVG) |
|-----------|------------|----------------------------------------|
| License | MIT | Varies (some GPL) |
| React integration | Native (hooks, context) | Wrapper layers required |
| Custom node rendering | Full React component per node | Limited or template-based |
| Minimap, controls, background | Built-in plugins | Must build or import |
| Performance (1,000+ nodes) | Viewport culling, virtualized | Manual optimization |
| Community & maintenance | 20K+ GitHub stars, active | Smaller communities |
| Edge customization | Custom edge components, markers | Limited |
| Undo/redo ecosystem | Compatible with `use-undo`, Zustand | Varies |
| Touch/trackpad support | Built-in pan, zoom, selection | Varies |

React Flow integrates directly into the existing Portal SPA (Vite +
React) with no additional build tooling.

### 2.2 State Management

Workflow editor state is managed via **Zustand** (already available in
the Portal dependency tree) with an undo/redo middleware layer.

```
WorkflowEditorStore (Zustand)
  ├── nodes: Node[]              # React Flow nodes
  ├── edges: Edge[]              # React Flow edges
  ├── selectedNodeId: string | null
  ├── workflowMeta: WorkflowMeta # name, description, tenant, version
  ├── validationErrors: ValidationError[]
  ├── executionState: ExecutionOverlay | null
  ├── undoStack: Patch[]
  ├── redoStack: Patch[]
  └── actions:
      ├── addNode(type, position)
      ├── removeNode(id)
      ├── updateNodeData(id, data)
      ├── addEdge(source, target, type)
      ├── removeEdge(id)
      ├── undo()
      ├── redo()
      ├── validate()
      ├── serialize() → WorkflowYAML
      ├── deserialize(yaml) → void
      └── applyExecutionOverlay(trace)
```

------------------------------------------------------------------------

## 3. Node Types

Every node type maps to a concrete Arachne runtime concept. Nodes are
rendered as custom React components with type-specific icons, ports
(handles), and inline configuration summaries.

### 3.1 Node Type Catalog

| Node Type | Arachne Concept | Input Ports | Output Ports | Description |
|-----------|----------------|-------------|--------------|-------------|
| **Start** | Workflow entry point | -- | 1 (control) | Defines the workflow trigger (API request, schedule, webhook, channel message). Exactly one per workflow. |
| **End** | Workflow termination | 1+ (control) | -- | Marks a terminal state. Returns the final response to the caller. Multiple End nodes allowed (for branching paths). |
| **LLM Call** | Agent invocation | 1 (control), 0+ (data) | 1 (control), 1 (data: response) | Invokes a deployed agent or inline LLM configuration. Configurable: model, system prompt, temperature, max tokens. |
| **Tool Invocation** | MCP tool call | 1 (control), 0+ (data) | 1 (control), 1 (data: result) | Calls an MCP-registered tool or ToolPackage function. Tool discovery via Arachne's MCP registry. |
| **Conditional Branch** | If/else routing | 1 (control), 1 (data: condition input) | 2+ (control: labeled branches) | Evaluates a condition expression against incoming data. Routes to one of N labeled output branches. |
| **Router** | AgentTeam routing pattern | 1 (control) | N (control: one per route + fallback) | Wraps the `coordination: routing` pattern. Router agent classifies intent; each output port maps to a route. |
| **Handoff** | AgentTeam handoff pattern | 1 (control) | 1 (control) | Sequential pipeline. Internal stages are configured in the property panel (ordered list of agents). |
| **Parallel Fan-Out** | AgentTeam parallel pattern | 1 (control) | N (control: one per worker) | Dispatches the same input to N worker agents concurrently. Must pair with a Fan-In node. |
| **Parallel Fan-In** | Merge step | N (control: one per worker) | 1 (control), 1 (data: merged result) | Collects outputs from parallel workers. Configurable merge agent and strategy. |
| **Supervisor** | AgentTeam supervisor pattern | 1 (control) | 1 (control) | Dynamic loop: supervisor agent invokes workers via tool calls until satisfied. Max iterations configurable. |
| **Human-in-the-Loop (HITL)** | Approval gate | 1 (control), 1 (data: review payload) | 2 (control: approved, rejected) | Pauses execution and presents data to a human reviewer via the Portal UI or webhook. Resumes on approval/rejection. |
| **Memory / RAG** | KnowledgeBase retrieval | 1 (control), 1 (data: query) | 1 (control), 1 (data: retrieved context) | Performs RAG retrieval against a deployed KnowledgeBase. Configurable: KB ref, top-k, similarity threshold. |
| **Transform** | Data transformation | 1 (control), 1+ (data) | 1 (control), 1 (data: transformed) | Applies a JavaScript expression, Handlebars template, or JSONPath transform to reshape data between nodes. |
| **Subflow** | Nested workflow reference | 1 (control), 0+ (data) | 1 (control), 0+ (data) | References another saved workflow by name. Enables composition and reuse. Resolved at weave time. |
| **Trigger** | Schedule / event source | -- | 1 (control) | Alternative to Start for scheduled or event-driven workflows. Configurable: cron expression, webhook URL, channel subscription. |
| **Channel Send** | AgentBus message publish | 1 (control), 1 (data: message) | 1 (control) | Publishes a message to a named channel (broadcast or directed). |
| **Channel Receive** | AgentBus message subscribe | -- | 1 (control), 1 (data: message) | Subscribes to a named channel. Acts as a trigger for event-driven subflows. |
| **Delay** | Timer / wait | 1 (control) | 1 (control) | Pauses execution for a configurable duration (seconds). Useful for rate limiting or timed sequences. |

### 3.2 Node Anatomy

Each node renders as a custom React Flow component with a consistent
visual structure:

```
┌─────────────────────────────────┐
│ [icon]  Node Type Label    [?]  │  ← Header (type icon, name, help)
├─────────────────────────────────┤
│                                 │
│  Agent: billing-agent           │  ← Summary (key config, read-only)
│  Model: gpt-4.1-mini           │
│  KB: company-policies           │
│                                 │
├─────────────────────────────────┤
│  ● input    ○ control-out       │  ← Ports (handles)
│  ● data-in  ○ data-out          │
└─────────────────────────────────┘
```

**Visual coding by type:**

| Category | Color | Node Types |
|----------|-------|------------|
| Flow control | Slate/gray | Start, End, Conditional Branch, Delay |
| Agent execution | Blue | LLM Call, Router, Handoff, Supervisor |
| Parallel | Purple | Fan-Out, Fan-In |
| Data | Green | Transform, Memory/RAG |
| Integration | Orange | Tool Invocation, Channel Send/Receive |
| Human | Amber | HITL |
| Composition | Teal | Subflow, Trigger |

### 3.3 Port (Handle) Types

React Flow handles are typed to enforce valid connections:

| Port Type | Visual | Can Connect To | Description |
|-----------|--------|---------------|-------------|
| `control-in` | Solid circle, left | `control-out` | Execution flow input |
| `control-out` | Open circle, right | `control-in` | Execution flow output |
| `data-in` | Solid diamond, left | `data-out` | Data dependency input |
| `data-out` | Open diamond, right | `data-in` | Data dependency output |

**Connection validation rules:**

- Control ports connect only to control ports.
- Data ports connect only to data ports.
- Self-connections are rejected.
- Duplicate edges between the same pair of ports are rejected.
- Cycles in control flow are rejected (except Supervisor, which has
  an internal loop managed by the runtime).

------------------------------------------------------------------------

## 4. Edge Types

### 4.1 Control Flow Edges

Control flow edges define execution order. They are rendered as solid
lines with directional arrows.

```typescript
interface ControlEdge {
  id: string;
  type: 'control';
  source: string;       // source node ID
  target: string;       // target node ID
  sourceHandle: string; // e.g., 'control-out' or 'branch-billing'
  targetHandle: string; // e.g., 'control-in'
  label?: string;       // e.g., 'approved', 'billing', 'timeout'
  animated?: boolean;   // pulsing animation during execution
}
```

### 4.2 Data Flow Edges

Data flow edges define how output data from one node feeds as input to
another. They are rendered as dashed lines with diamond arrowheads.

```typescript
interface DataEdge {
  id: string;
  type: 'data';
  source: string;
  target: string;
  sourceHandle: string; // e.g., 'data-out' or 'response'
  targetHandle: string; // e.g., 'data-in' or 'query'
  label?: string;       // e.g., 'keywords', 'context'
  dataMapping?: {
    sourceField: string; // JSONPath into source output
    targetField: string; // JSONPath into target input
  };
}
```

### 4.3 Edge Rendering

| State | Style | Description |
|-------|-------|-------------|
| Default (control) | Solid, gray, arrow marker | Static control flow |
| Default (data) | Dashed, green, diamond marker | Static data flow |
| Hover | Thickened, highlighted | Mouse over edge |
| Selected | Blue outline, delete button | Click to select |
| Executing | Animated pulse (blue) | Currently active during execution |
| Completed | Solid green | Successfully traversed |
| Error | Solid red, error icon | Execution failed on this edge |

------------------------------------------------------------------------

## 5. Serialization: Canvas to YAML

The editor serializes the visual graph to Arachne's declarative YAML
format. This is the same format consumed by `arachne weave`.

### 5.1 Serialization Model

```typescript
interface WorkflowYAML {
  apiVersion: 'arachne-ai.com/v0';
  kind: 'Workflow';
  metadata: {
    name: string;
    description?: string;
    tags?: string[];
    version?: string;
  };
  spec: {
    trigger: TriggerSpec;
    steps: StepSpec[];
    edges: EdgeSpec[];
  };
}

interface TriggerSpec {
  type: 'api' | 'schedule' | 'webhook' | 'channel';
  // Schedule-specific
  cron?: string;
  timezone?: string;
  // Webhook-specific
  webhookUrl?: string;
  // Channel-specific
  channel?: string;
  channelPattern?: 'broadcast' | 'directed';
}

interface StepSpec {
  id: string;
  type: NodeType;
  name: string;
  config: Record<string, unknown>; // type-specific configuration
  position: { x: number; y: number }; // preserved for editor round-trip
}

interface EdgeSpec {
  from: string;      // step ID
  to: string;        // step ID
  type: 'control' | 'data';
  label?: string;    // branch label for conditional/router
  dataMapping?: {
    sourceField: string;
    targetField: string;
  };
}
```

### 5.2 YAML Output Example

A workflow where a router classifies customer intent, routes to
specialist agents, and collects results:

```yaml
apiVersion: arachne-ai.com/v0
kind: Workflow
metadata:
  name: customer-support-workflow
  description: Routes customer requests to specialist agents
  tags: [support, routing]
spec:
  trigger:
    type: api

  steps:
    - id: start
      type: Start
      name: Customer Request
      config: {}
      position: { x: 100, y: 300 }

    - id: classify
      type: Router
      name: Intent Classifier
      config:
        routerAgent: triage-agent
        routes:
          - intent: billing
            label: Billing
          - intent: technical
            label: Technical
          - intent: general
            label: General
        fallback: general
      position: { x: 400, y: 300 }

    - id: billing-handler
      type: LLMCall
      name: Billing Specialist
      config:
        agentRef: billing-agent
        knowledgeBaseRefs:
          - company-policies-kb
      position: { x: 700, y: 100 }

    - id: tech-handler
      type: LLMCall
      name: Tech Support
      config:
        agentRef: tech-support-agent
      position: { x: 700, y: 300 }

    - id: general-handler
      type: LLMCall
      name: General Support
      config:
        agentRef: general-agent
      position: { x: 700, y: 500 }

    - id: respond
      type: End
      name: Send Response
      config: {}
      position: { x: 1000, y: 300 }

  edges:
    - { from: start, to: classify, type: control }
    - { from: classify, to: billing-handler, type: control, label: billing }
    - { from: classify, to: tech-handler, type: control, label: technical }
    - { from: classify, to: general-handler, type: control, label: general }
    - { from: billing-handler, to: respond, type: control }
    - { from: tech-handler, to: respond, type: control }
    - { from: general-handler, to: respond, type: control }
```

### 5.3 Deserialization (YAML to Canvas)

The editor can import any valid Workflow YAML:

1. Parse YAML and validate against the Workflow JSON Schema.
2. Map each `StepSpec` to a React Flow node with the corresponding
   custom component and port configuration.
3. Map each `EdgeSpec` to a React Flow edge with type-appropriate
   styling.
4. Restore node positions from `position` fields (auto-layout if
   positions are missing).
5. Populate the Zustand store and trigger a `fitView()`.

### 5.4 Round-Trip Guarantee

The serializer preserves all fields. A workflow loaded from YAML and
immediately re-serialized produces byte-identical output (modulo
whitespace normalization). This is enforced by integration tests.

### 5.5 Mapping to Existing Artifact Kinds

When a Workflow YAML is woven, the weave pipeline expands it into
constituent artifacts:

| Workflow Construct | Produced Artifact(s) |
|-------------------|---------------------|
| LLM Call with inline config | `kind: Agent` |
| LLM Call with `agentRef` | Reference to existing Agent |
| Router / Handoff / Parallel / Supervisor | `kind: AgentTeam` with corresponding coordination pattern |
| Memory/RAG with inline config | `kind: KnowledgeBase` |
| Tool Invocation | Reference to existing ToolPackage |
| Trigger (schedule) | `schedule` block on the root agent/team |
| Channel Send/Receive | `channels` block on participating agents |
| Subflow | Reference to another Workflow artifact |

This means the `kind: Workflow` artifact is a higher-level abstraction
that compiles down to the existing Agent, AgentTeam, and KnowledgeBase
primitives. The runtime executes the compiled artifacts, not the
workflow graph directly.

------------------------------------------------------------------------

## 6. User Interface

### 6.1 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  [<] Workflows  /  customer-support-workflow  v1.2.0      [Deploy ▾]│
├────────┬─────────────────────────────────────────────┬───────────────┤
│        │                                             │               │
│  Node  │              Canvas                         │   Property    │
│ Palette│          (React Flow)                       │    Panel      │
│        │                                             │               │
│ ──────-│  ┌───────┐    ┌──────────┐    ┌───────┐    │  Node: Router │
│ Flow   │  │ Start ├───>│  Router  ├───>│  End  │    │  ──────────── │
│  Start │  └───────┘    └──┬───┬───┘    └───────┘    │  Agent: ...   │
│  End   │              ┌───┘   └───┐                  │  Routes: ...  │
│  Branch│              ▼           ▼                  │  Fallback: .. │
│  Delay │         ┌────────┐  ┌────────┐             │               │
│ ──────-│         │Billing │  │  Tech  │             │  [Validation] │
│ Agents │         └────────┘  └────────┘             │  ✓ All routes │
│  LLM   │                                            │    have agents│
│  Router│   ┌──────────────┐                         │               │
│  ...   │   │  Minimap     │                         │               │
│ ──────-│   └──────────────┘                         │               │
│ Data   │                                             │               │
│  RAG   │  [Undo] [Redo] [Zoom+] [Zoom-] [FitView]  │               │
│  Xform │                                             │               │
├────────┴─────────────────────────────────────────────┴───────────────┤
│  Validation: ✓ Valid  │  Nodes: 6  │  Edges: 7  │  Last saved: 2m  │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.2 Node Palette (Left Sidebar)

The palette is organized by category. Nodes are added to the canvas via:

1. **Drag and drop** from the palette onto the canvas.
2. **Double-click** a palette item to add at the viewport center.
3. **Context menu** (right-click on canvas) shows a searchable node
   picker.

Categories match the color coding from section 3.2.

**Search:** A filter input at the top of the palette narrows the
displayed nodes. Typing "LLM" shows only LLM Call; typing "parallel"
shows Fan-Out and Fan-In.

### 6.3 Property Panel (Right Sidebar)

When a node is selected, the right panel displays an editable form for
that node's configuration. The form is type-specific:

**LLM Call properties:**

| Field | Type | Description |
|-------|------|-------------|
| Name | text | Display name on the canvas |
| Agent | combobox | Select from deployed agents (fetched from `/v1/portal/agents`) or "Inline" |
| Model | combobox | Model selection (when inline) |
| System Prompt | textarea | System prompt (when inline) |
| Temperature | slider (0-2) | LLM temperature |
| Max Tokens | number | Response token limit |
| Knowledge Bases | multi-select | Attached KBs (fetched from `/v1/portal/knowledge-bases`) |
| Tools | multi-select | Attached MCP tools (discovered via tool registry) |

**Router properties:**

| Field | Type | Description |
|-------|------|-------------|
| Router Agent | combobox | Agent that performs classification |
| Routes | dynamic list | Intent label + target (auto-creates output ports) |
| Fallback | combobox | Default route when no intent matches |

**Conditional Branch properties:**

| Field | Type | Description |
|-------|------|-------------|
| Condition Type | select | Expression, JSONPath, LLM classifier |
| Expression | code input | JavaScript expression evaluated against input data |
| Branches | dynamic list | Label + condition value (auto-creates output ports) |
| Default Branch | select | Fallback branch |

**Transform properties:**

| Field | Type | Description |
|-------|------|-------------|
| Transform Type | select | JavaScript expression, Handlebars template, JSONPath |
| Expression | code input | The transformation logic |
| Input Schema | JSON editor | Expected input shape (optional, for validation) |
| Output Schema | JSON editor | Output shape (optional, for validation) |

### 6.4 Toolbar

| Button | Shortcut | Action |
|--------|----------|--------|
| Undo | `Cmd+Z` | Revert last action |
| Redo | `Cmd+Shift+Z` | Reapply reverted action |
| Delete | `Backspace` / `Delete` | Remove selected nodes/edges |
| Copy | `Cmd+C` | Copy selected nodes |
| Paste | `Cmd+V` | Paste copied nodes |
| Select All | `Cmd+A` | Select all nodes and edges |
| Zoom In | `Cmd+=` | Increase zoom level |
| Zoom Out | `Cmd+-` | Decrease zoom level |
| Fit View | `Cmd+0` | Fit all nodes in viewport |
| Validate | `Cmd+Shift+V` | Run validation checks |
| Save | `Cmd+S` | Save workflow to server |
| Export YAML | `Cmd+E` | Download workflow as YAML file |
| Import YAML | `Cmd+I` | Upload and parse a YAML file |

### 6.5 Canvas Interactions

| Interaction | Behavior |
|-------------|----------|
| Pan | Click+drag on background, or scroll wheel |
| Zoom | Pinch/scroll with Ctrl, or toolbar buttons |
| Select node | Click on node |
| Multi-select | Shift+click, or draw selection rectangle |
| Move node | Drag selected node(s) |
| Connect | Drag from output port to input port |
| Disconnect | Click edge, press Delete |
| Context menu | Right-click on canvas/node/edge |
| Quick add | Double-click on canvas opens node picker |

### 6.6 Minimap

React Flow's built-in `<MiniMap>` component renders a thumbnail
overview of the full graph in the bottom-left corner. Nodes are colored
by category. The viewport rectangle is draggable for quick navigation.

### 6.7 Undo/Redo

The Zustand store uses an immer-based patch system:

1. Every state mutation generates a JSON patch.
2. Patches are pushed to an undo stack (max 100 entries).
3. Undo pops the last patch and applies its inverse.
4. Redo reapplies a popped patch.
5. Any new mutation after an undo clears the redo stack.

Undo/redo covers: node add/remove/move, edge add/remove, property
changes, and bulk operations (paste, delete selection).

------------------------------------------------------------------------

## 7. Validation

The editor performs continuous validation and displays errors inline on
the canvas and in the status bar.

### 7.1 Validation Rules

| Rule | Severity | Description |
|------|----------|-------------|
| `single-start` | Error | Exactly one Start or Trigger node required |
| `reachable-end` | Error | Every control flow path must reach an End node |
| `no-orphans` | Warning | All nodes must be connected to the graph |
| `no-cycles` | Error | Control flow must be acyclic (except Supervisor internal loop) |
| `port-type-match` | Error | Control ports connect to control; data to data |
| `no-duplicate-edges` | Error | At most one edge between any port pair |
| `fan-out-fan-in-paired` | Error | Every Fan-Out must have a corresponding Fan-In |
| `agent-ref-exists` | Warning | Referenced agents must exist in the tenant's registry |
| `kb-ref-exists` | Warning | Referenced KBs must be deployed |
| `router-has-routes` | Error | Router nodes must have at least one route |
| `router-has-fallback` | Error | Router nodes must specify a fallback |
| `conditional-has-branches` | Error | Conditional Branch must have at least 2 branches |
| `transform-valid-expr` | Error | Transform expressions must parse without syntax errors |
| `schedule-valid-cron` | Error | Cron expressions must be valid 5-field format |
| `hitl-has-reviewer` | Warning | HITL nodes should specify a reviewer role or webhook |
| `subflow-ref-exists` | Warning | Referenced subflow workflows must exist |

### 7.2 Validation Display

- **Inline:** Nodes with validation errors show a red badge with error
  count. Hovering the badge shows the error messages.
- **Status bar:** Bottom bar shows overall validation status
  (valid/invalid) with error/warning counts.
- **Property panel:** The panel for a selected node highlights fields
  that have validation errors with red borders and error text.
- **Pre-save check:** Saving or deploying triggers a full validation
  pass. Errors block save; warnings allow save with confirmation.

### 7.3 Validation Timing

- **On change:** Lightweight structural checks (connectivity, port
  types) run on every graph mutation with 300ms debounce.
- **On save:** Full validation including agent/KB reference resolution
  (requires API calls).
- **On deploy:** Server-side validation mirrors the client-side checks
  plus weave-time validation (same as `arachne weave --dry-run`).

------------------------------------------------------------------------

## 8. Integration with Arachne APIs

### 8.1 Agent Registry

The editor fetches the tenant's deployed agents for LLM Call and Router
node configuration:

```
GET /v1/portal/agents → { agents: [{ id, name, model, ... }] }
```

The agent combobox in the property panel is populated from this endpoint.
Results are cached client-side with a 60-second TTL and refreshed on
panel open.

### 8.2 Knowledge Base Registry

```
GET /v1/portal/knowledge-bases → { knowledgeBases: [{ id, name, ... }] }
```

The KB multi-select in LLM Call and Memory/RAG nodes uses this endpoint.

### 8.3 MCP Tool Discovery

```
GET /v1/portal/tools → { tools: [{ name, description, inputSchema, ... }] }
```

Tool Invocation nodes display discovered MCP tools with their
descriptions and input schemas. The property panel renders a form
matching the tool's JSON Schema for static configuration.

### 8.4 Channel Registry

```
GET /v1/channels → { channels: [{ name, pattern, subscriberCount, ... }] }
```

Channel Send and Channel Receive nodes use this endpoint to populate
the channel name selector.

### 8.5 Workflow CRUD

```
POST   /v1/portal/workflows              # Create workflow
GET    /v1/portal/workflows              # List workflows
GET    /v1/portal/workflows/:id          # Get workflow (includes YAML + canvas state)
PUT    /v1/portal/workflows/:id          # Update workflow
DELETE /v1/portal/workflows/:id          # Delete workflow
POST   /v1/portal/workflows/:id/deploy   # Deploy workflow (weave + push + deploy)
POST   /v1/portal/workflows/:id/validate # Server-side validation
```

### 8.6 Execution & Trace

```
POST   /v1/portal/workflows/:id/execute  # Trigger a test execution
GET    /v1/portal/workflows/:id/executions        # List executions
GET    /v1/portal/workflows/:id/executions/:runId  # Get execution details (trace tree)
```

Execution results include per-step trace data (latency, tokens, status,
ACP messages) that the editor overlays on the canvas.

------------------------------------------------------------------------

## 9. Execution Visualization

### 9.1 Overview

When a workflow is executing or when reviewing a past execution, the
editor overlays runtime state on the canvas. This transforms the editor
from an authoring tool into a debugging and monitoring surface.

### 9.2 Node Execution States

| State | Visual | Description |
|-------|--------|-------------|
| Idle | Default appearance | Not yet reached by execution |
| Queued | Subtle pulse border | Scheduled for execution, waiting |
| Running | Blue animated border | Currently executing |
| Completed | Green border, check icon | Finished successfully |
| Error | Red border, error icon | Failed with error |
| Skipped | Gray, reduced opacity | Not reached (branch not taken) |

### 9.3 Execution Overlay Data

When a node is selected during execution view, the property panel shows
runtime data:

| Field | Description |
|-------|-------------|
| Status | Current execution state |
| Duration | Wall-clock time for this step |
| Token Usage | Input + output tokens consumed |
| Cost | Estimated cost (from analytics cost model) |
| Input | The data/message received by this node |
| Output | The data/message produced by this node |
| ACP Messages | Raw ACP wire-format messages sent/received |
| Error | Error message and stack trace (if failed) |
| Model | LLM model used (for LLM Call nodes) |
| Budget | Allocated vs consumed budget |

### 9.4 Edge Animation

During execution, control flow edges animate with a traveling pulse to
show the active execution path. Completed edges turn green; error edges
turn red.

Data flow edges show a brief flash when data is transferred between
nodes.

### 9.5 Live Execution Mode

For long-running workflows (e.g., supervisor loops), the editor
supports a live mode:

1. Client opens an SSE connection to
   `GET /v1/portal/workflows/:id/executions/:runId/stream`.
2. Server pushes `execution.step.started`, `execution.step.completed`,
   `execution.step.failed` events.
3. The editor applies each event to the execution overlay in real time.
4. The minimap shows execution progress across the full graph.

### 9.6 Trace Tree Panel

A collapsible bottom panel (similar to browser DevTools) shows the
execution trace as a tree:

```
▼ customer-support-workflow  (runId: abc123)  2.4s  $0.003
  ▼ Start: Customer Request  12ms
  ▼ Router: Intent Classifier  340ms  1,200 tokens
    ├── ACP: delegate (orch → triage)  m:1
    └── ACP: report (triage → orch)   m:2  intent=billing
  ▼ LLM Call: Billing Specialist  1,800ms  3,400 tokens
    ├── RAG retrieval: company-policies-kb  85ms  3 chunks
    ├── ACP: delegate (orch → billing)  m:3
    └── ACP: report (billing → orch)   m:4
  ▼ End: Send Response  15ms
```

Clicking a trace row highlights the corresponding node on the canvas
and scrolls it into view.

------------------------------------------------------------------------

## 10. Database Schema

### 10.1 Workflows Table

```sql
CREATE TABLE workflows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(256) NOT NULL,
  description   TEXT,
  tags          JSONB NOT NULL DEFAULT '[]',
  version       VARCHAR(64) NOT NULL DEFAULT '0.1.0',

  -- Serialized workflow definition
  spec_yaml     TEXT NOT NULL,            -- The canonical YAML source
  canvas_state  JSONB NOT NULL,           -- React Flow node positions, viewport, zoom

  -- Deployment tracking
  deployed_at       TIMESTAMPTZ,
  deployment_id     UUID REFERENCES deployments(id) ON DELETE SET NULL,
  last_execution_at TIMESTAMPTZ,

  -- Metadata
  status        VARCHAR(16) NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'deployed', 'archived')),
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, name)
);

CREATE INDEX idx_workflows_tenant ON workflows(tenant_id);
CREATE INDEX idx_workflows_status ON workflows(tenant_id, status);
```

### 10.2 Workflow Executions Table

```sql
CREATE TABLE workflow_executions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Execution state
  status        VARCHAR(16) NOT NULL DEFAULT 'running'
                CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  trigger_type  VARCHAR(16) NOT NULL DEFAULT 'manual'
                CHECK (trigger_type IN ('manual', 'api', 'schedule', 'webhook', 'channel')),

  -- Input / output
  input         JSONB,
  output        JSONB,
  error         TEXT,

  -- Trace linkage
  trace_id      UUID,                     -- Links to the top-level Trace row
  correlation_id VARCHAR(32),             -- ACP correlation ID

  -- Timing
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  duration_ms   INTEGER,

  -- Cost
  total_tokens  INTEGER DEFAULT 0,
  total_cost_cents NUMERIC(10,4) DEFAULT 0
);

CREATE INDEX idx_wf_exec_workflow ON workflow_executions(workflow_id);
CREATE INDEX idx_wf_exec_tenant ON workflow_executions(tenant_id);
CREATE INDEX idx_wf_exec_status ON workflow_executions(tenant_id, status);
```

### 10.3 Workflow Step Executions Table

```sql
CREATE TABLE workflow_step_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id    UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  step_id         VARCHAR(128) NOT NULL,   -- Matches step.id in the workflow spec

  -- Execution state
  status          VARCHAR(16) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'queued', 'running', 'completed',
                                     'failed', 'skipped')),

  -- Data
  input           JSONB,
  output          JSONB,
  error           TEXT,

  -- Trace linkage
  trace_id        UUID,                    -- Links to the sub-agent Trace row
  acp_messages    JSONB,                   -- Array of ACP messages for this step

  -- Timing
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER,

  -- Cost
  tokens_used     INTEGER DEFAULT 0,
  cost_cents      NUMERIC(10,4) DEFAULT 0
);

CREATE INDEX idx_wf_step_exec ON workflow_step_executions(execution_id);
CREATE INDEX idx_wf_step_status ON workflow_step_executions(execution_id, status);
```

### 10.4 Encryption

- `spec_yaml` and `canvas_state` are encrypted at rest using the
  per-tenant AES-256-GCM key derivation (same pattern as traces and
  conversation messages).
- `workflow_step_executions.input`, `output`, and `acp_messages` are
  encrypted with the same per-tenant key.
- Encryption/decryption happens in the application layer (service), not
  in the database.

### 10.5 Entity Schema (MikroORM)

```typescript
// src/domain/entities/Workflow.ts

class Workflow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  tags: string[];
  version: string;
  specYaml: string;
  canvasState: Record<string, unknown>;
  deployedAt: Date | null;
  deploymentId: string | null;
  lastExecutionAt: Date | null;
  status: 'draft' | 'deployed' | 'archived';
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const WorkflowSchema = new EntitySchema<Workflow>({
  class: Workflow,
  tableName: 'workflows',
  properties: {
    id:              { type: 'uuid', primary: true },
    tenantId:        { type: 'uuid', fieldName: 'tenant_id' },
    name:            { type: 'string', length: 256 },
    description:     { type: 'string', nullable: true },
    tags:            { type: 'json', default: '[]' },
    version:         { type: 'string', length: 64, default: '0.1.0' },
    specYaml:        { type: 'text', fieldName: 'spec_yaml' },
    canvasState:     { type: 'json', fieldName: 'canvas_state' },
    deployedAt:      { type: 'datetime', nullable: true, fieldName: 'deployed_at' },
    deploymentId:    { type: 'uuid', nullable: true, fieldName: 'deployment_id' },
    lastExecutionAt: { type: 'datetime', nullable: true, fieldName: 'last_execution_at' },
    status:          { type: 'string', length: 16, default: 'draft' },
    createdBy:       { type: 'uuid', nullable: true, fieldName: 'created_by' },
    createdAt:       { type: 'datetime', fieldName: 'created_at' },
    updatedAt:       { type: 'datetime', fieldName: 'updated_at' },
  },
  uniques: [{ properties: ['tenantId', 'name'] }],
});
```

------------------------------------------------------------------------

## 11. Portal UI Integration

### 11.1 Route Structure

The workflow editor is embedded within the existing Portal SPA:

```
/workflows                    → Workflow list page
/workflows/new                → New workflow (empty canvas)
/workflows/:id                → Edit existing workflow
/workflows/:id/executions     → Execution history
/workflows/:id/executions/:runId → Execution detail (trace overlay)
```

### 11.2 Navigation

The Portal's sidebar navigation gains a new "Workflows" entry:

```
├── Dashboard
├── Agents
├── Knowledge Bases
├── Workflows            ← NEW
│   ├── All Workflows
│   └── New Workflow
├── API Keys
├── Analytics
└── Settings
```

### 11.3 Workflow List Page

A table view showing all workflows for the current tenant:

| Column | Description |
|--------|-------------|
| Name | Workflow name (link to editor) |
| Status | Draft / Deployed / Archived |
| Version | Semantic version string |
| Nodes | Node count |
| Last Modified | Timestamp |
| Last Executed | Timestamp (if ever executed) |
| Actions | Edit, Duplicate, Delete, Deploy/Undeploy |

Filters: status, tags. Search: name substring match.

### 11.4 Component Architecture

```
portal/src/
  pages/
    WorkflowListPage.tsx          # List view
    WorkflowEditorPage.tsx        # Main editor page (hosts canvas)
    WorkflowExecutionPage.tsx     # Execution detail with trace overlay
  components/
    workflow/
      Canvas.tsx                  # React Flow wrapper
      NodePalette.tsx             # Left sidebar with node categories
      PropertyPanel.tsx           # Right sidebar with node config form
      Toolbar.tsx                 # Top toolbar (undo, zoom, etc.)
      ExecutionOverlay.tsx        # Execution state visualization
      TraceTreePanel.tsx          # Bottom panel for trace inspection
      ValidationBadge.tsx         # Inline node validation indicator
      nodes/                     # Custom React Flow node components
        StartNode.tsx
        EndNode.tsx
        LLMCallNode.tsx
        ToolInvocationNode.tsx
        ConditionalBranchNode.tsx
        RouterNode.tsx
        HandoffNode.tsx
        FanOutNode.tsx
        FanInNode.tsx
        SupervisorNode.tsx
        HITLNode.tsx
        MemoryRAGNode.tsx
        TransformNode.tsx
        SubflowNode.tsx
        TriggerNode.tsx
        ChannelSendNode.tsx
        ChannelReceiveNode.tsx
        DelayNode.tsx
      edges/
        ControlEdge.tsx           # Solid arrow edge
        DataEdge.tsx              # Dashed diamond edge
      panels/
        LLMCallPanel.tsx          # Property panel for LLM Call
        RouterPanel.tsx           # Property panel for Router
        ConditionalPanel.tsx      # Property panel for Conditional
        TransformPanel.tsx        # Property panel for Transform
        ... (one per node type)
  stores/
    workflowEditorStore.ts        # Zustand store
  lib/
    workflowSerializer.ts         # Canvas ↔ YAML conversion
    workflowValidator.ts          # Client-side validation engine
    workflowApi.ts                # API client for workflow endpoints
```

### 11.5 Dependencies

Added to the Portal's `package.json`:

| Package | Version | Purpose |
|---------|---------|---------|
| `@xyflow/react` | `^12.x` | Core graph editor |
| `yaml` | `^2.x` | YAML parse/stringify (already available) |
| `elkjs` | `^0.9.x` | Auto-layout engine (ELK algorithm) |
| `immer` | `^10.x` | Immutable state patches for undo/redo |

All other dependencies (React, Zustand, Tailwind, Recharts) are already
in the Portal.

------------------------------------------------------------------------

## 12. Auto-Layout

When importing YAML without position data, or when the user requests
automatic arrangement, the editor uses the **ELK** (Eclipse Layout
Kernel) algorithm via `elkjs`:

### 12.1 Layout Algorithm

```typescript
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

async function autoLayout(nodes: Node[], edges: Edge[]): Promise<Node[]> {
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '80',
      'elk.layered.spacing.nodeNodeBetweenLayers': '120',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: n.measured?.width ?? 240,
      height: n.measured?.height ?? 120,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const layout = await elk.layout(graph);

  return nodes.map((node) => {
    const laid = layout.children?.find((c) => c.id === node.id);
    return laid
      ? { ...node, position: { x: laid.x ?? 0, y: laid.y ?? 0 } }
      : node;
  });
}
```

### 12.2 Layout Triggers

- **Import YAML:** Auto-layout applied if any node lacks position data.
- **Manual:** "Auto-arrange" button in toolbar (`Cmd+Shift+A`).
- **Partial:** Select a subset of nodes and auto-arrange only those.

------------------------------------------------------------------------

## 13. Security Considerations

1. **Tenant isolation:** All workflow endpoints filter by `tenant_id`
   from the authenticated JWT context. Cross-tenant workflow access is
   not possible.

2. **Transform node sandboxing:** JavaScript expressions in Transform
   nodes execute in a sandboxed context (no access to `globalThis`,
   `process`, `require`, `fetch`, or filesystem). The sandbox uses a
   restricted function constructor with a whitelist of safe globals
   (`JSON`, `Math`, `Date`, `String`, `Number`, `Array`, `Object`).

3. **Encryption at rest:** Workflow specs, canvas state, and execution
   data are encrypted using per-tenant AES-256-GCM keys (same pattern
   as traces and conversations).

4. **Deploy authorization:** Only users with `admin` or `editor` role
   in the tenant can deploy workflows. `viewer` role can view and run
   test executions but cannot modify or deploy.

5. **Subflow reference resolution:** Subflow references are resolved
   within the same tenant. Cross-tenant subflow references are not
   permitted.

6. **YAML import validation:** Imported YAML is validated against a
   strict JSON Schema before deserialization. Malformed or
   unrecognized fields are rejected with descriptive errors.

7. **Execution cost limits:** Test executions respect the tenant's
   configured token/cost budgets. Budget propagation through ACP
   ensures no single test run can exhaust tenant resources.

------------------------------------------------------------------------

## 14. Accessibility

The workflow editor follows WAI-ARIA patterns where applicable within
a canvas-based interface:

| Feature | Implementation |
|---------|---------------|
| Keyboard navigation | Tab between nodes, Enter to select, arrow keys to move |
| Screen reader labels | ARIA labels on all nodes, edges, and toolbar buttons |
| Focus indicators | Visible focus ring on selected nodes and controls |
| Palette keyboard access | Arrow keys to navigate categories, Enter to add node |
| High contrast | Respects system-level high-contrast preference |
| Reduced motion | Disables edge animations when `prefers-reduced-motion` is set |

------------------------------------------------------------------------

## 15. Phase Plan

### Phase 1: Core Editor (MVP)

**Scope:**
- Canvas with Start, End, LLM Call, Conditional Branch, Transform nodes
- Control flow edges only (no data edges)
- Node palette (drag and drop)
- Property panel for all Phase 1 node types
- YAML serialization and deserialization (round-trip fidelity)
- Import/export YAML files
- Client-side validation (structural rules)
- Undo/redo (50-level stack)
- Minimap and zoom controls
- Workflow CRUD API and database schema
- Workflow list page in Portal

**Milestone:** Users can visually build simple sequential and branching
agent workflows and export valid YAML.

### Phase 2: Multi-Agent Patterns

**Scope:**
- Router, Handoff, Parallel (Fan-Out/Fan-In), Supervisor nodes
- Data flow edges with data mapping configuration
- Agent registry integration (combobox population)
- KB registry integration (Memory/RAG node)
- Auto-layout (ELK)
- Server-side validation (weave dry-run)
- Deploy from editor (one-click weave + push + deploy)

**Milestone:** Full coverage of AgentTeam coordination patterns.
Users can deploy multi-agent workflows directly from the editor.

### Phase 3: Execution & Debugging

**Scope:**
- Test execution from editor
- Execution overlay (node states, edge animation)
- Trace tree panel
- Live execution mode (SSE streaming)
- Execution history page
- Per-step token/cost breakdown

**Milestone:** End-to-end workflow lifecycle: build, deploy, execute,
debug -- all within the editor.

### Phase 4: Advanced Nodes & Polish

**Scope:**
- Tool Invocation node (MCP tool discovery)
- HITL node (approval gate UI)
- Channel Send/Receive nodes
- Subflow node (workflow composition)
- Trigger node (schedule, webhook, channel)
- Delay node
- Copy/paste node groups
- Keyboard shortcuts for all actions
- Accessibility audit and fixes
- Performance optimization for 100+ node workflows

**Milestone:** Feature-complete workflow editor with all node types.

### Phase 5: Collaboration & History (Future)

**Scope:**
- Workflow version history (diff view)
- Workflow templates / marketplace
- Collaborative editing (multiplayer)
- Workflow-level analytics dashboard
- Custom node types via plugin system

------------------------------------------------------------------------

## 16. Comparison with Existing Tools

### 16.1 Langflow

Langflow is an open-source visual framework for LangChain workflows.
Key differences from Arachne's editor:

| Aspect | Langflow | Arachne Workflow Editor |
|--------|----------|------------------------|
| Runtime | LangChain (Python) | Arachne (Node.js/TypeScript) |
| Artifact model | Standalone flows | Compiles to Agent/AgentTeam YAML artifacts |
| Multi-agent patterns | Ad hoc node wiring | First-class Router/Handoff/Parallel/Supervisor nodes |
| Protocol | REST between components | ACP wire protocol with budget propagation |
| Execution tracing | Basic logging | Full ACP trace DAG with cost tracking |
| Deployment | Docker container per flow | Standard Arachne weave/push/deploy pipeline |
| Multi-tenancy | None | Native tenant isolation, encrypted at rest |

### 16.2 Dify

Dify provides a visual orchestration layer with a canvas editor. Key
differences:

| Aspect | Dify | Arachne Workflow Editor |
|--------|------|------------------------|
| Agent model | Built-in agent types | Custom agents via YAML specs |
| Knowledge management | Built-in KB | Arachne KnowledgeBase artifacts with RAG |
| Channel messaging | Not supported | Native AgentBus channels |
| Cost governance | Token tracking only | ACP budget propagation (tokens, cost, TTL) |
| CLI/IaC | GUI-only | Bidirectional YAML round-trip; CLI-first |
| Scheduling | Basic cron | Declarative schedules with retry policies |

### 16.3 Design Principles from Prior Art

Patterns adopted from Langflow/Dify that inform the Arachne editor:

1. **Drag-and-drop palette** with categorized node types.
2. **Right-panel property editor** that adapts to selected node type.
3. **Real-time validation** with inline error badges.
4. **Minimap** for navigation in complex workflows.
5. **One-click test execution** with result overlay.

Patterns we deliberately diverge from:

1. **No embedded code editor.** Arachne agents are configured
   declaratively, not programmed. Transform nodes support expressions
   but not arbitrary scripts.
2. **YAML is the source of truth,** not a database-only representation.
   Workflows are portable, version-controllable, and CLI-compatible.
3. **Multi-agent patterns are first-class nodes,** not emergent
   properties of arbitrary wiring. A Router node is semantically
   distinct from manually connecting an LLM node to a conditional
   branch, because the runtime optimizes for the pattern.

------------------------------------------------------------------------

## 17. Open Questions

1. **Workflow versioning model.** Should workflow versions follow
   semantic versioning (manual bump) or auto-increment on save?
   Recommendation: semver with manual bump, matching agent versioning.

2. **Subflow depth limit.** Should there be a maximum nesting depth
   for subflow references to prevent runaway compilation? Proposed
   limit: 5 levels.

3. **Transform node language.** Should transforms support only
   JavaScript expressions, or also JSONata / JMESPath? Proposal: start
   with JavaScript expressions only; add JSONata in Phase 4 if demand
   exists.

4. **HITL webhook vs. Portal UI.** Should HITL approval flow through a
   dedicated Portal page, a webhook to an external system, or both?
   Recommendation: Portal page for MVP, webhook for Phase 4.

5. **Collaborative editing priority.** Is real-time collaboration
   (Phase 5) a near-term need for the target customer, or is it
   deferred indefinitely? Depends on go-to-market feedback.

------------------------------------------------------------------------

## Summary

The Workflow Editor introduces a visual authoring surface for Arachne's
multi-agent workflows, built on React Flow within the existing Portal
SPA. It provides drag-and-drop workflow construction, bidirectional YAML
serialization, integration with Arachne's agent/KB/tool registries, and
execution visualization powered by ACP trace data. The five-phase
delivery plan starts with a core canvas for simple workflows and
progressively adds multi-agent patterns, execution debugging, advanced
node types, and collaboration features. The editor complements -- but
does not replace -- the CLI-first YAML workflow, ensuring that all
workflows remain portable, version-controllable, and deployable through
the standard `arachne weave` pipeline.
