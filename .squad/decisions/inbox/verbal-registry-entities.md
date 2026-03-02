# Decision: Registry/KB Domain Entities

**Author:** Verbal (Domain Model Expert)  
**Date:** 2026-03-01  
**Status:** Proposed

## Context

The registry migration (`1000000000015_registry.cjs`) defined database tables for artifact management and knowledge base storage. Domain entities were needed to represent these concepts in the application layer.

## Decision

Created five new domain entities using Peter Coad's Color Modeling archetypes:

| Entity | Archetype | Purpose |
|--------|-----------|---------|
| `Artifact` | 🟢 Thing | Content-addressed bundle (KB, Agent, EmbeddingAgent) |
| `VectorSpace` | 🔵 Catalog-Entry | Embedding configuration fingerprint |
| `KbChunk` | 🟢 Thing | Document chunk with optional vector embedding |
| `Deployment` | 🩷 Moment-Interval | Artifact deployment lifecycle event |
| `ArtifactTag` | 🔵 Catalog-Entry | Mutable version pointer/label |

Additionally, the `Agent` entity was extended with a `kind` field to distinguish inference vs embedding agents.

## Key Design Choices

1. **Plain TypeScript classes** — Followed existing pattern (no MikroORM decorators)
2. **pgvector embedding field** — Stored as `number[]` with raw SQL for similarity search (ORM doesn't support pgvector natively)
3. **Exported types** — `ArtifactKind`, `AgentKind`, `DeploymentStatus` exported alongside entities

## Files Created/Modified

- `src/domain/entities/Artifact.ts` (new)
- `src/domain/entities/VectorSpace.ts` (new)
- `src/domain/entities/KbChunk.ts` (new)
- `src/domain/entities/Deployment.ts` (new)
- `src/domain/entities/ArtifactTag.ts` (new)
- `src/domain/entities/Agent.ts` (modified — added `kind` field)
- `src/domain/entities/index.ts` (modified — exports)

## Consequences

- Fenster can now implement repository and service layers for these entities
- Raw SQL will be needed for vector similarity search operations
- Future work may include a custom MikroORM type for pgvector if needed
