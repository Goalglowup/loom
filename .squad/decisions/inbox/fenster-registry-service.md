# Decision: RegistryService Implementation

**Author:** Fenster (Backend)  
**Date:** 2026-02-25  
**Status:** Implemented

## What

Created `src/services/RegistryService.ts` — the backend service for publishing, resolving, listing, downloading, and deleting content-addressed artifacts (KnowledgeBase, Agent, EmbeddingAgent).

## Methods

| Method | Signature | Purpose |
|--------|-----------|---------|
| `push` | `(input: PushInput, em: EntityManager) => Promise<{ artifactId, ref }>` | Idempotent publish of an artifact bundle |
| `resolve` | `(ref: ArtifactRef, tenantId, em) => Promise<Artifact \| null>` | Look up artifact by org/name:tag |
| `list` | `(tenantId, org, em) => Promise<Summary[]>` | List artifacts grouped by name with all tags |
| `pull` | `(ref: ArtifactRef, tenantId, em) => Promise<Buffer \| null>` | Download bundle data |
| `delete` | `(ref: ArtifactRef, tenantId, em) => Promise<boolean>` | Remove tag; cascade-delete artifact+chunks if orphaned |

## Key Decisions

### 1. sha256 Idempotency (no error on duplicate)
On duplicate sha256 for the same tenant, `push()` returns the existing artifact and re-upserts the tag. No exception thrown. Rationale: content-addressed storage means same content = same artifact; callers should not need to pre-check.

### 2. `version` Field = Tag Name
The `Artifact.version` field is set to `input.tag`. The tag name (e.g., `latest`, `1.0.0`) doubles as the version label for the artifact. Tags are mutable pointers; the version on Artifact is immutable after creation.

### 3. ArtifactTag Upsert Pattern
`_upsertTag` looks up an existing tag for the same `org/name` under the tenant. If found, calls `.reassign(artifact)` to move the pointer. If not found, creates a new ArtifactTag. This enables `push org/kb:latest` to update the `latest` pointer atomically.

### 4. VectorSpace Scoped to KnowledgeBase Only
`VectorSpace` is created only when `kind === 'KnowledgeBase'` and `vectorSpaceData` is provided. Agent and EmbeddingAgent artifacts do not need vector space metadata.

### 5. Chunk Deletion Before Artifact
`delete()` queries `KbChunk` entities and removes them individually before removing the `Artifact`. This avoids FK constraint violations and works with MikroORM's unit-of-work pattern.

### 6. Tenant Scope Guard in `resolve()`
The guard handles both the case where `artifact.tenant` is a hydrated `Tenant` object (with `.id`) and the raw string ID (when not populated). This is defensive and consistent with how other services handle MikroORM entity references.

## Files Changed

- **Created:** `src/services/RegistryService.ts`

## No Architecture Decisions Required
This implementation follows existing patterns (EntityManager injection, `em.persist()`/`em.flush()`, `em.findOneOrFail()`) without introducing new infrastructure or dependencies. No Keaton approval needed.
