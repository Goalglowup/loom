# Decision Record: WeaveService

**Author:** Fenster (Backend)  
**Date:** 2026-02-25  
**Status:** Implemented — awaiting Keaton review if architectural decisions need ratification

---

## What

Created `src/services/WeaveService.ts` implementing the `loom weave` pipeline for KnowledgeBase, Agent, and EmbeddingAgent spec files.

## Methods Implemented

| Method | Description |
|--------|-------------|
| `parseSpec(yamlPath)` | Parse + validate YAML spec → typed `AnySpec` |
| `resolveDocs(docsPath)` | Resolve docs from dir / .zip / single file |
| `chunkText(text, tokenSize, overlap)` | Word-aligned sliding-window chunker |
| `embedTexts(texts, provider, model, apiKey)` | OpenAI embeddings, batched at 100/req |
| `computePreprocessingHash(config)` | SHA-256 of chunking+model config |
| `packageBundle(spec, chunks, vectorSpace)` | `.tgz` bundle with HMAC-SHA256 signature |
| `weaveKnowledgeBase(yamlPath, outputDir, tenantId, em?)` | Full KB pipeline |
| `weaveConfigArtifact(yamlPath, outputDir)` | Config-only bundle for Agent/EmbeddingAgent |

## Key Decisions

**No new npm dependencies added.**  
- YAML parsing: custom minimal indent-stack parser (~40 lines)  
- Tar packaging: custom POSIX ustar builder + `node:zlib` gzip  
- ZIP extraction: binary local-header scanner supporting stored (0) + deflated (8)  
- Embeddings: native `fetch` (Node 25)  
- Signing: `node:crypto` HMAC-SHA256

**EmbeddingAgent resolution (P0 scope):**  
The `em` EntityManager param is wired but not yet used for DB lookup. P0 always falls back to `SYSTEM_EMBEDDER_PROVIDER` / `SYSTEM_EMBEDDER_MODEL` / `SYSTEM_EMBEDDER_API_KEY` env vars. Full agent resolution via DB is deferred.

**Only OpenAI supported for P0.**  
Provider routing (Azure OpenAI, Cohere, etc.) can be added to `embedTexts` switch in a later wave.

**Bundle output:**  
Written to `<outputDir>/<spec.metadata.name>.tgz`. Caller owns versioning strategy.

## Needs Keaton Review?

Only if the team wants a different VectorSpace ID strategy (currently: `preprocessingHash` hex string returned as `vectorSpaceId`). The `VectorSpace` entity exists in domain but is not yet persisted by WeaveService — that wiring belongs to a future artifact storage task.
