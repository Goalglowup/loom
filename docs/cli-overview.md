# Loom CLI — Weave, Registry & Deploy: Overview

> **Review document** — Read this before implementation begins. Leave comments on the GitHub epic (#63) or in-line here.

## What We're Building

Loom gains a reproducible artifact system for AI Agents and KnowledgeBases. There are two entry points:

1. **CLI (`loom`)** — for developers who prefer declarative YAML workflows
2. **Portal UI** — for operators who prefer a browser-based workflow

Both entry points share the same backend: a Registry and Weave pipeline running inside the Gateway.

---

## The Artifact Model

Everything in this system revolves around three concepts:

### KnowledgeBase
A collection of documents that have been chunked and embedded. The KnowledgeBase YAML spec describes _where_ the documents are and _how_ they should be processed:

```yaml
apiVersion: loom.ai/v0
kind: KnowledgeBase
metadata:
  name: support-kb
spec:
  docsPath: ./docs          # directory, single file, or .zip
  embedder:                 # optional — defaults to openai/text-embedding-3-small
    provider: openai
    model: text-embedding-3-small
  chunking:
    tokenSize: 650          # tokens per chunk
    overlap: 120            # token overlap between chunks
  retrieval:
    topK: 8                 # chunks returned per query
    citations: true
```

The `docsPath` field is flexible:
- **Directory** — all files in the directory are processed recursively
- **Single file** — just that file is processed
- **.zip file** — extracted in-memory; all contained files are processed

When the spec is woven, the Gateway chunks the documents, generates embeddings using the configured (or default) provider, and records a **VectorSpace contract** — a fingerprint of the embedder model, dimensions, and preprocessing config. This fingerprint ensures that the same bundle always produces identical embeddings.

### Agent
An Agent YAML spec describes a model configuration and (optionally) a KnowledgeBase reference:

```yaml
apiVersion: loom.ai/v0
kind: Agent
metadata:
  name: support-agent
spec:
  model: gpt-4.1-mini
  systemPrompt: |
    You are SupportAgent. Use the knowledge base to answer.
    If the answer isn't in the knowledge base, say you don't know.
  knowledgeBaseRef: support-kb    # name of a KnowledgeBase artifact
```

### Bundle
A bundle is the output of `loom weave` — a `.tgz` file containing:
- `manifest.json` — artifact metadata, SHA-256, VectorSpace contract, signature
- `chunks/` — document chunks with their embedding vectors

Bundles are **immutable and content-addressed**: the same inputs always produce the same bundle, and the same bundle always produces identical embeddings when deployed.

---

## How It All Fits Together

```
Developer writes YAML specs
         │
         ▼
loom weave kb.yaml           ← Gateway chunks docs, generates embeddings, signs bundle
         │
         ▼
dist/support-kb.bundle.tgz   ← Immutable, content-addressed artifact
         │
         ▼
loom push dist/support-kb.bundle.tgz --tag 0.1.0
         │
         ▼
Registry stores bundle        ← org/name:0.1.0 now resolvable
         │
         ▼
loom deploy support-agent:0.1.0 --tenant acme --env prod
         │
         ▼
Gateway provisions KB         ← pgvector index created for tenant
Gateway attaches agent config
Gateway mints runtime token   ← scoped to inference + KB read
         │
         ▼
Agent is READY for inference  ← API key requests use the deployed KB
```

---

## Stories

### Story 1 — CLI Authentication (#55)
**As a developer, I want to authenticate the loom CLI so that I can use CLI commands without manually managing tokens.**

The `loom login <gateway-url>` command prompts for email and password, calls the existing portal login endpoint, and stores the JWT in `~/.loom/config.json`. All subsequent CLI commands read from this file automatically.

The portal JWT is extended to include a `scopes[]` array. Tenant owners automatically receive registry scopes (`weave:write`, `registry:push`, `deploy:write`, `artifact:read`). A new `registryAuth.ts` middleware on the Gateway checks the required scope per endpoint.

_What changes:_ New `cli/` package scaffold. Portal JWT extended. `~/.loom/config.json` config helpers.

---

### Story 2 — KnowledgeBase YAML Spec (#56)
**As a developer, I want to define a KnowledgeBase in a YAML file so that I can declaratively configure document ingestion.**

This story defines the YAML schema for `kind: KnowledgeBase`, the docsPath resolver (directory/zip/single file), and the spec validator. It establishes the contract that other stories build on.

_What changes:_ YAML parser + validator. docsPath resolver. Default embedder logic (falls back to `openai/text-embedding-3-small` when `spec.embedder` is absent).

---

### Story 3 — loom weave (#57)
**As a developer, I want to run `loom weave` to produce a signed artifact bundle.**

`loom weave <spec.yaml>` uploads the spec and docs to the Gateway. The Gateway's WeaveService:
1. Parses the YAML
2. Resolves docsPath (directory/zip/file)
3. Chunks documents (650 tokens, 120 overlap by default)
4. Calls the configured embedding provider
5. Computes the VectorSpace hash (SHA-256 of embedder config)
6. Packages everything into a `.tgz`
7. Signs it with HMAC-SHA256 (`BUNDLE_SIGNING_SECRET` env var)
8. Returns the bundle to the CLI

The CLI saves the bundle to `dist/<name>.bundle.tgz`.

_What changes:_ DB migration (pgvector extension + `vector_spaces`, `kb_chunks` tables). WeaveService. `POST /v1/registry/weave` gateway route. `loom weave` CLI command.

---

### Story 4 — loom push (#58)
**As a developer, I want to push a bundle to the Gateway registry.**

`loom push <bundle.tgz> --tag 0.1.0` stores the bundle in the database and registers the tag. Artifacts are immutable: pushing the same SHA-256 again is a no-op. The registry supports:
- `push` — store artifact + chunks + tag
- `pull` — download bundle by ref
- `resolve` — look up `org/name:tag` → artifact metadata
- `list` — all versions for `org/name`

Artifact naming follows: `{org}/{name}:{tag}` (e.g., `acme/support-agent:0.1.0`). The `org` is derived from the authenticated tenant's org.

_What changes:_ DB migration (`artifacts`, `artifact_tags` BYTEA tables). RegistryService. `POST /v1/registry/push` and `GET /v1/registry/artifacts/*` gateway routes. `loom push` CLI command.

---

### Story 5 — loom deploy (#59)
**As a developer, I want to deploy an artifact to a tenant.**

`loom deploy support-agent:0.1.0 --tenant acme --env prod`:
1. Resolves the artifact from the registry
2. Validates tenant permissions
3. Verifies VectorSpace contract (refuses mismatched embedder)
4. Provisions a pgvector index on the `kb_chunks` table scoped to this artifact
5. Attaches the agent's runtime config to the tenant
6. Mints a scoped runtime JWT (valid for inference + `artifact:read` only)
7. Marks the deployment READY

_What changes:_ DB migration (`deployments` table). ProvisionService. `POST /v1/registry/deploy` gateway route. `loom deploy` CLI command.

---

### Story 6 — Portal Knowledge Bases (#60)
**As a tenant operator, I want to manage KnowledgeBases in the portal without the CLI.**

A new **Knowledge Bases** page in the portal (between Agents and Settings in the nav):
- Lists all KBs with chunk count, vector space (embedder model + dimensions), creation date
- Drag-and-drop file or .zip upload to create a new KB (runs weave in-process on the Gateway)
- Click a KB to see its document list and per-document chunk counts
- Delete a KB (removes artifact + chunks)

The creation flow mirrors `loom weave` + `loom push` — the portal sends a multipart upload to the Gateway which runs the same WeaveService pipeline.

_What changes:_ Portal API routes (`/v1/portal/knowledge-bases`). `KnowledgeBasesPage.tsx`. Nav item.

---

### Story 7 — Portal Deployments (#61)
**As a tenant operator, I want to manage artifact deployments from the portal.**

A new **Deployments** page:
- Lists current deployments grouped by environment
- Provision form: enter `org/name:tag` to provision an artifact to the current tenant
- Shows deployment status (READY / PENDING / FAILED) and creation time
- Unprovision button removes the deployment (runtime token is revoked)

_What changes:_ Portal API routes (`/v1/portal/deployments`). `DeploymentsPage.tsx`. Nav item.

---

### Story 8 — Agent KB Reference & YAML Export (#62)
**As a developer, I want to attach a KB to an agent in the portal and export the agent as YAML.**

Two additions to the Agent Editor:

1. **Knowledge Base section** — dropdown lists deployed KBs (name, chunk count, embedder model). Selecting one sets `agent.knowledgeBaseRef`. The resolved KB is used at inference time for RAG retrieval.

2. **"Export as YAML" button** — downloads a pre-filled `agent.yaml`:
   ```yaml
   apiVersion: loom.ai/v0
   kind: Agent
   metadata:
     name: support-agent
   spec:
     model: gpt-4.1-mini
     systemPrompt: |
       You are SupportAgent...
     knowledgeBaseRef: support-kb
   ```
   The developer can take this file, run `loom weave agent.yaml`, and produce a versioned bundle.

_What changes:_ Extend `PUT /v1/portal/agents/:id` with `knowledgeBaseRef`. `GET /v1/portal/agents/:id/export` route. AgentEditor KB selector + Export button.

---

## Database Changes

One migration adds:
1. `CREATE EXTENSION IF NOT EXISTS vector` — enables pgvector
2. `vector_spaces` — embedder fingerprint (provider, model, dimensions, preprocessing hash)
3. `artifacts` — content-addressed bundles (org, name, version, kind, sha256, bundle_data BYTEA)
4. `artifact_tags` — mutable tags pointing to artifact versions
5. `kb_chunks` — document chunks with `embedding vector` column (pgvector)
6. `deployments` — tenant attachment records with env, status, runtime_token

---

## Auth Model

The portal JWT is extended with a `scopes: string[]` field. Tenant owners automatically receive:
- `weave:write` — required for `POST /v1/registry/weave`
- `registry:push` — required for `POST /v1/registry/push`
- `deploy:write` — required for `POST /v1/registry/deploy`
- `artifact:read` — required for `GET /v1/registry/artifacts/*`

A new `registryAuth(scope)` middleware factory checks the presence of the required scope in the JWT and returns 403 if missing.

CLI commands (`loom weave`, `loom push`, `loom deploy`) use the stored portal JWT from `~/.loom/config.json`.

---

## Success Criteria (from PRD)

- [ ] Developer can define KB + Agent in under 20 lines of YAML ✓
- [ ] `loom weave` completes under 10s for small doc sets
- [ ] `loom deploy` completes under 5s
- [ ] Same bundle deploys identically across environments (VectorSpace guarantee)
- [ ] Multi-tenant isolation enforced (all artifacts + deployments scoped to tenant/org)
- [ ] No embedding occurs at deploy time (embeddings are in the bundle, not recomputed)

---

## Open Questions

_Anything unclear? Leave comments on GitHub epic #63 or edit this document._

1. **Artifact naming / org resolution** — the `org` in `org/name:tag` is derived from the authenticated tenant's name (slugified). Is this the right default, or should there be an explicit org slug on tenant accounts?
2. **KB at inference time** — when an agent with `knowledgeBaseRef` processes a request, the Gateway should perform a similarity search on `kb_chunks` and inject the top-K chunks into the system prompt. This inference-time retrieval logic is **not in scope for P0** — it's a follow-on story. The deploy step wires up the association; the actual RAG call comes next.
3. **Embedder scoping** — the default `openai/text-embedding-3-small` uses the tenant's configured OpenAI API key. If a tenant hasn't configured OpenAI, weave will fail. Should there be a Gateway-level fallback embedder key?
