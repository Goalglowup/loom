# fenster-registry-migration

**Author:** Fenster (Backend Dev)  
**Date:** 2026

## Summary

Created `migrations/1000000000015_registry.cjs` — the registry/KB database migration.

## What It Does

Adds all schema required to support the artifact registry and knowledge base (RAG) pipeline:

1. **`vector` extension** — pgvector support via `CREATE EXTENSION IF NOT EXISTS vector`
2. **`tenants.org_slug`** — nullable `VARCHAR(100) UNIQUE` for org slug (backfill deferred)
3. **`agents.kind`** — `VARCHAR(20) NOT NULL DEFAULT 'inference'` (`'inference'` | `'embedding'`)
4. **`vector_spaces`** — tracks embedding model/dimensions/preprocessing config per vector space
5. **`artifacts`** — registry entries (KnowledgeBase, Agent, EmbeddingAgent bundles) with SHA256, bundle_data, version
6. **`artifact_tags`** — mutable tags pointing at artifact versions; indexed on `(artifact_id, tag)`
7. **`kb_chunks`** — chunked KB content with pgvector `vector(1536)` embedding column; ivfflat index (cosine, 100 lists)
8. **`deployments`** — deployment state per `(tenant_id, artifact_id, environment)`; holds runtime_token (scoped JWT)
9. **`embedding_operations`** — audit log for embedding API calls (`query` | `weave`); indexed by agent+time, tenant+time
10. **`artifact_operations`** — audit log for registry operations (`weave` | `push` | `deploy`); indexed by tenant+time
11. **`traces` RAG columns** — 13 new nullable columns: knowledge_base_id, embedding_agent_id, retrieval latencies, chunk stats, token overhead, cost overhead, failure stage, fallback flag; partial index on knowledge_base_id

## Pattern Followed

Matches `migrations/1000000000014_conversations.cjs` exactly:
- `exports.shorthands = undefined`
- `exports.up = async (pgm) => { ... }`
- `exports.down = async (pgm) => { ... }`
- `pgm.createTable`, `pgm.addColumns`, `pgm.addConstraint`, `pgm.createIndex` for standard DDL
- `pgm.sql()` for pgvector extension, ivfflat index, and partial index (requires raw SQL)
- Down migration drops in full reverse order

## Decisions Reflected

- `org_slug` is nullable — no backfill migration bundled here; application logic or a separate migration will enforce NOT NULL after backfill
- `kb_chunks.embedding` is `vector(1536)` matching text-embedding-3-small dimensions
- ivfflat index uses `lists = 100` (appropriate for initial data volumes; tune later)
- `deployments.runtime_token` stored as plain TEXT — encryption at rest handled by infrastructure, not the DB layer
