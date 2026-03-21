# Arachne Workspace Specification

> Tracked by Epic [#163](https://github.com/Synaptic-Weave/arachne/issues/163)

## Status

Draft -- MVP Specification

## Overview

An Arachne **Workspace** groups related artifacts (Agents, KnowledgeBases,
EmbeddingAgents, ToolPackages) so they can be validated, woven, pushed,
and deployed as a coordinated unit.

A workspace takes one of two forms:

1. **Directory workspace:** a directory containing one or more `.yaml`
   spec files, each defining exactly one artifact.
2. **Multi-document YAML workspace:** a single file containing multiple
   YAML documents separated by `---`, each document defining one artifact.

Both forms produce the same output: one `.orb` bundle per artifact,
written to `dist/` (or a custom output directory).

Workspaces are opt-in. The existing single-file `arachne weave
single-file.yaml` workflow continues to work without changes.

------------------------------------------------------------------------

## Design Goals

1. **Coordinated weave:** Process all related artifacts in a single
   command, resolving cross-references locally before falling back to
   the registry.
2. **Dependency ordering:** Automatically determine the correct build
   order based on cross-references between artifacts.
3. **Validation first:** Catch reference errors, missing fields, and
   circular dependencies before any embedding API calls or bundle
   generation.
4. **Backward compatibility:** No changes to the existing spec format
   (`apiVersion`, `kind`, `metadata`, `spec`). Workspace features
   activate only when the target is a directory or multi-document YAML.

------------------------------------------------------------------------

## Workspace Directory Format

A workspace directory contains one or more `.yaml` files. Each file
defines exactly one artifact using the standard Arachne spec structure.

```
support-app/
  embedder.yaml          # kind: EmbeddingAgent
  support-kb.yaml        # kind: KnowledgeBase
  support-agent.yaml     # kind: Agent
  docs/
    faq.md
    troubleshooting.md
```

**Conventions:**

- Name the directory after the project or application.
- One artifact per file.
- Use an optional `docs/` subdirectory for KnowledgeBase source
  documents. The KB spec references this via `spec.docsPath: ./docs`.
- Files are discovered non-recursively (only top-level `.yaml` files
  in the directory). Subdirectories like `docs/` are not scanned for
  specs.

------------------------------------------------------------------------

## Multi-Document YAML Format

For simple projects where a directory feels heavyweight, all artifacts
can live in a single file with `---` separators between documents.

```yaml
apiVersion: arachne-ai.com/v0
kind: EmbeddingAgent
metadata:
  name: my-embedder
spec:
  provider: openai
  model: text-embedding-3-small
---
apiVersion: arachne-ai.com/v0
kind: KnowledgeBase
metadata:
  name: support-kb
spec:
  docsPath: ./docs
  embedder:
    agentRef: my-embedder
  chunking:
    tokenSize: 650
    overlap: 120
  retrieval:
    topK: 8
    citations: true
---
apiVersion: arachne-ai.com/v0
kind: Agent
metadata:
  name: support-agent
spec:
  model: gpt-4.1-mini
  systemPrompt: |
    You are SupportAgent. Use the knowledge base to answer questions.
    If the answer isn't in the knowledge base, say you don't know.
  knowledgeBaseRef: support-kb
```

Each document uses the same `apiVersion`/`kind`/`metadata`/`spec`
structure as individual files. The `docsPath` is resolved relative to
the multi-document file's location.

------------------------------------------------------------------------

## CLI: `arachne weave` on Workspaces

### Directory workspace

```bash
arachne weave ./support-app/
```

Discovers all `.yaml` files in the directory, resolves cross-references,
determines dependency order, and weaves each artifact.

### Multi-document YAML workspace

```bash
arachne weave combined.yaml
```

Parses all YAML documents in the file, then follows the same resolution
and ordering logic as a directory workspace.

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--out <dir>` | `dist/` | Output directory for bundles |
| `--dry-run` | `false` | Validate without producing artifacts |
| `--gateway <url>` | from config | Override the gateway URL |

### Output

Each artifact produces one `.orb` file in the output directory:

```
dist/
  my-embedder.orb
  support-kb.orb
  support-agent.orb
```

### Progress output

```
Workspace: ./support-app/ (3 artifacts)
  Dependency order:
    1. EmbeddingAgent/my-embedder
    2. KnowledgeBase/support-kb
    3. Agent/support-agent

  Weaving EmbeddingAgent/my-embedder...
  ✓ dist/my-embedder.orb (sha256: a1b2c3...)

  Weaving KnowledgeBase/support-kb...
    Chunking 2 documents (48 chunks)...
    Generating embeddings...
  ✓ dist/support-kb.orb (sha256: d4e5f6...)

  Weaving Agent/support-agent...
  ✓ dist/support-agent.orb (sha256: 7a8b9c...)

✓ 3 artifacts woven successfully
```

------------------------------------------------------------------------

## Cross-Reference Resolution

Artifacts reference each other through named fields:

| Field | Source Kind | Target Kind |
|-------|-----------|-------------|
| `spec.knowledgeBaseRef` | Agent | KnowledgeBase |
| `spec.embedder.agentRef` | KnowledgeBase | EmbeddingAgent |
| `spec.toolPackageRef` | Agent | ToolPackage (future) |

### Resolution order

When the weaver encounters a cross-reference, it resolves it in this
order:

1. **Local workspace:** Match by `metadata.name` against other specs in
   the same workspace (directory or multi-document file).
2. **Registry fallback:** Call `GET /v1/registry/list` to check whether
   the artifact exists in the tenant's registry.
3. **Error:** If the reference cannot be resolved in either location,
   emit a clear error listing the missing artifact, which spec
   references it, and a suggestion to add the spec to the workspace.

**Example error:**

```
Error: Unresolved reference in KnowledgeBase/support-kb
  spec.embedder.agentRef: "my-embedder"
  Not found in workspace or registry.
  → Add an EmbeddingAgent spec with metadata.name: "my-embedder"
    to this workspace, or push it to the registry first.
```

Resolution happens during weave (not deploy). By the time `.orb` bundles
are produced, all references have been validated.

------------------------------------------------------------------------

## Dependency Graph

Artifacts have implicit dependencies via their cross-references. The
weaver builds a directed acyclic graph (DAG) and processes artifacts in
topological order.

### Default ordering by kind

| Order | Kind | Rationale |
|-------|------|-----------|
| 1 | EmbeddingAgent | No dependencies on other workspace artifacts |
| 2 | ToolPackage | Independent (no cross-references to other kinds) |
| 3 | KnowledgeBase | May depend on EmbeddingAgent via `embedder.agentRef` |
| 4 | Agent | May depend on KnowledgeBase via `knowledgeBaseRef` |

Within a kind tier, artifacts with no intra-tier dependencies are
processed in alphabetical order for deterministic output.

### Circular dependency detection

Circular references are an error. The weaver detects cycles during graph
construction and reports them before any weaving begins.

```
Error: Circular dependency detected
  Agent/agent-a → KnowledgeBase/kb-a → EmbeddingAgent/emb-a → Agent/agent-a
  Break the cycle by removing one of these references.
```

------------------------------------------------------------------------

## `--dry-run` Flag

```bash
arachne weave --dry-run ./support-app/
```

Validates the workspace without producing artifacts or calling external
APIs.

### What `--dry-run` checks

- Valid YAML syntax in all spec files
- Required fields present (`apiVersion`, `kind`, `metadata.name`)
- Kind-specific required fields (e.g., `spec.model` for Agent,
  `spec.docsPath` for KnowledgeBase)
- Cross-reference resolution (local workspace + registry fallback)
- Dependency graph is acyclic
- `docsPath` exists and contains files
- Embedding config is available (embedder can be resolved)

### What `--dry-run` does NOT do

- Call embedding APIs
- Produce `.orb` bundle files
- Upload anything to the gateway

### Output

```
Workspace: ./support-app/ (3 artifacts)

  Validating specs...
  ✓ EmbeddingAgent/my-embedder — valid
  ✓ KnowledgeBase/support-kb — valid
    docsPath: ./docs (2 files)
    embedder: my-embedder (local workspace)
  ✓ Agent/support-agent — valid
    knowledgeBaseRef: support-kb (local workspace)

  Dependency order:
    1. EmbeddingAgent/my-embedder
    2. KnowledgeBase/support-kb
    3. Agent/support-agent

✓ Workspace is valid (3 artifacts, 0 errors)
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Workspace is valid |
| 1 | Validation errors found |

------------------------------------------------------------------------

## Push and Deploy for Workspaces

### Push

Pushing workspace bundles uses the existing `arachne push` command with
shell globbing:

```bash
arachne push dist/*.orb --tag 0.1.0
```

This pushes all bundles produced by the workspace weave. Each bundle is
tagged independently in the registry.

### Deploy (current)

For now, deploy each artifact individually in dependency order:

```bash
arachne deploy acme/my-embedder:0.1.0 --tenant acme --env prod
arachne deploy acme/support-kb:0.1.0 --tenant acme --env prod
arachne deploy acme/support-agent:0.1.0 --tenant acme --env prod
```

Deploy validates that referenced artifacts are already deployed. If you
deploy `support-agent` before `support-kb`, the deploy will fail with a
reference error.

### Deploy (future: `--workspace` flag)

```bash
arachne deploy --workspace ./support-app/ --tag 0.1.0 --tenant acme --env prod
```

This future command will deploy all artifacts in the workspace in
dependency order, stopping on the first failure.

------------------------------------------------------------------------

## Registry Fallback Details

During cross-reference resolution, if a reference is not found among the
specs in the local workspace, the CLI falls back to the registry.

### Lookup flow

1. CLI calls `GET /v1/registry/list?org=<tenant-org>` using the portal
   JWT from `~/.arachne/config.json`.
2. Filters the response for an artifact matching the referenced
   `metadata.name` and the expected `kind`.
3. **If found:** the reference is valid. The artifact exists in the
   registry and does not need to be re-woven. The weaver records the
   registry artifact's version for traceability.
4. **If not found:** the reference is unresolved. The weaver emits an
   error with a suggestion to add the missing spec to the workspace.

### Authentication

Registry fallback requires a valid portal JWT. If the user is not
authenticated (no `~/.arachne/config.json` or expired token), the CLI
skips registry fallback and treats all non-local references as errors.
The error message includes a reminder to run `arachne login`.

### Offline mode

When working without network access, registry fallback is skipped. Only
local workspace references are resolved. The CLI warns that registry
fallback was skipped:

```
Warning: Registry fallback skipped (no network/auth).
  References not found locally will be treated as errors.
```

------------------------------------------------------------------------

## Backward Compatibility

| Scenario | Behavior |
|----------|----------|
| `arachne weave single-file.yaml` (one document) | Unchanged. Works exactly as before. |
| `arachne weave single-file.yaml` (multi-document) | Detected as workspace. Activates dependency resolution. |
| `arachne weave ./directory/` | Detected as workspace. Activates dependency resolution. |
| Existing `.orb` bundles | Unchanged format. Workspace weave produces the same `.orb` format. |
| `arachne push` and `arachne deploy` | Unchanged. No workspace-specific changes. |

### Detection logic

- If the target path is a directory: directory workspace.
- If the target path is a file containing multiple YAML documents
  (more than one `---` separator at the top level): multi-document
  workspace.
- If the target path is a file with a single YAML document: legacy
  single-artifact weave.

------------------------------------------------------------------------

## Full Workspace Example

### Directory layout

```
support-app/
  embedder.yaml
  support-kb.yaml
  support-agent.yaml
  docs/
    faq.md
    troubleshooting.md
```

### embedder.yaml

```yaml
apiVersion: arachne-ai.com/v0
kind: EmbeddingAgent
metadata:
  name: my-embedder
spec:
  provider: openai
  model: text-embedding-3-small
```

### support-kb.yaml

```yaml
apiVersion: arachne-ai.com/v0
kind: KnowledgeBase
metadata:
  name: support-kb
spec:
  docsPath: ./docs
  embedder:
    agentRef: my-embedder
  chunking:
    tokenSize: 650
    overlap: 120
  retrieval:
    topK: 8
    citations: true
```

### support-agent.yaml

```yaml
apiVersion: arachne-ai.com/v0
kind: Agent
metadata:
  name: support-agent
spec:
  model: gpt-4.1-mini
  systemPrompt: |
    You are SupportAgent. Use the knowledge base to answer questions.
    If the answer isn't in the knowledge base, say you don't know.
  knowledgeBaseRef: support-kb
```

### CLI workflow

```bash
# Authenticate
arachne login https://your-arachne-runtime.com

# Validate the workspace
arachne weave --dry-run ./support-app/

# Weave all artifacts
arachne weave ./support-app/

# Push all bundles
arachne push dist/my-embedder.orb --tag 0.1.0
arachne push dist/support-kb.orb --tag 0.1.0
arachne push dist/support-agent.orb --tag 0.1.0

# Deploy in dependency order
arachne deploy acme/my-embedder:0.1.0 --tenant acme --env prod
arachne deploy acme/support-kb:0.1.0 --tenant acme --env prod
arachne deploy acme/support-agent:0.1.0 --tenant acme --env prod
```

### Equivalent multi-document YAML

The same workspace as a single file (`support-app.yaml`):

```yaml
apiVersion: arachne-ai.com/v0
kind: EmbeddingAgent
metadata:
  name: my-embedder
spec:
  provider: openai
  model: text-embedding-3-small
---
apiVersion: arachne-ai.com/v0
kind: KnowledgeBase
metadata:
  name: support-kb
spec:
  docsPath: ./docs
  embedder:
    agentRef: my-embedder
  chunking:
    tokenSize: 650
    overlap: 120
  retrieval:
    topK: 8
    citations: true
---
apiVersion: arachne-ai.com/v0
kind: Agent
metadata:
  name: support-agent
spec:
  model: gpt-4.1-mini
  systemPrompt: |
    You are SupportAgent. Use the knowledge base to answer questions.
    If the answer isn't in the knowledge base, say you don't know.
  knowledgeBaseRef: support-kb
```

```bash
arachne weave support-app.yaml
arachne push dist/*.orb --tag 0.1.0
```

------------------------------------------------------------------------

## Future Extensions

These features are out of scope for MVP but inform the design decisions
above.

### `arachne deploy --workspace`

One-command workspace deployment that pushes and deploys all artifacts in
dependency order. Eliminates the need to run individual deploy commands.

### Workspace lockfile (`arachne.lock`)

A lockfile tracking artifact versions, content hashes, and registry
coordinates for each artifact in the workspace. Enables reproducible
deployments and drift detection.

```yaml
# arachne.lock (future)
artifacts:
  my-embedder:
    kind: EmbeddingAgent
    version: 0.1.0
    sha256: a1b2c3d4...
    registry: acme/my-embedder:0.1.0
  support-kb:
    kind: KnowledgeBase
    version: 0.1.0
    sha256: d4e5f678...
    vectorSpaceId: vs_sha256_...
    registry: acme/support-kb:0.1.0
  support-agent:
    kind: Agent
    version: 0.1.0
    sha256: 7a8b9c01...
    registry: acme/support-agent:0.1.0
```

### `arachne diff`

Compare the current workspace state against what is deployed in the
registry. Shows which artifacts have changed, which are new, and which
are unchanged.

```bash
arachne diff ./support-app/
#   modified: KnowledgeBase/support-kb (docs changed)
#   unchanged: EmbeddingAgent/my-embedder
#   unchanged: Agent/support-agent
```

### AgentTeam specs

A new `kind: AgentTeam` that references multiple Agent specs in a
workspace and defines coordination patterns (routing, handoff, parallel
execution). AgentTeam specs would participate in the dependency graph
as a layer above individual Agents.

------------------------------------------------------------------------

## Blog Entry

I spent today designing the Workspace spec for Arachne, and the core
insight is that workspaces are really just a dependency graph with a
nice CLI surface. The interesting design tension is between keeping the
single-file workflow untouched (backward compatibility is non-negotiable)
and adding enough structure to make multi-artifact projects manageable.

The cross-reference resolution order (local workspace first, registry
fallback second) is the decision I'm most confident about. It means you
can develop entirely offline with a self-contained workspace, but you
can also reference shared artifacts that live in the registry without
pulling them into your local directory. The registry fallback during
weave (not deploy) catches broken references early, before any embedding
API calls burn tokens.

The dependency graph is straightforward because the artifact kinds have
a natural ordering: EmbeddingAgents are leaves, KnowledgeBases depend on
embedders, Agents depend on KBs. Circular dependencies are impossible in
practice with the current reference types, but the spec guards against
them explicitly because future reference types (toolPackageRef,
AgentTeam) could introduce cycles. Building the topological sort now
means the weaver is ready for those extensions without redesign.

The `--dry-run` flag was a late addition to the outline but it might be
the most valuable feature for developer experience. Validating a
workspace of five artifacts against the registry before committing to a
full weave (which involves embedding API calls) saves real time and
money. It also makes CI pipelines practical: run `arachne weave
--dry-run` on every PR to catch spec errors before merge.
