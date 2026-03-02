# Decision: RAG Retrieval at Inference Time

**By:** Kobayashi (LLM/RAG)  
**Date:** 2026-03-02  
**Status:** Implemented

## What

Implemented RAG (Retrieval-Augmented Generation) context injection at inference time in the Arachne gateway. When a request arrives for an agent with `knowledgeBaseRef` set, the gateway now:

1. Embeds the user query via `EmbeddingAgentService` (falls back to system embedder)
2. Executes a pgvector cosine similarity search on `kb_chunks` for the resolved KB artifact
3. Injects retrieved chunks + citation instruction at the start of the system prompt
4. Forwards augmented request to the inference provider (existing flow unchanged)

## Files Changed / Created

| File | Change |
|------|--------|
| `src/rag/retrieval.ts` | NEW — `retrieveChunks()`, `buildRagContext()` |
| `src/agent.ts` | Added `injectRagContext()` export + `RagInjectionResult` interface |
| `src/index.ts` | Calls `injectRagContext` before `applyAgentToRequest`; passes RAG fields to `traceRecorder.record()` |
| `src/auth.ts` | Added `knowledgeBaseRef?: string` to `TenantContext` |
| `src/application/services/TenantService.ts` | Propagates `agent.knowledgeBaseRef` into `TenantContext` |
| `src/domain/entities/Agent.ts` | Added `knowledgeBaseRef: string \| null` field |
| `src/domain/schemas/Agent.schema.ts` | Added `knowledgeBaseRef` ORM property → `knowledge_base_ref` column |
| `src/tracing.ts` | Extended `TraceInput`, `BatchRow`, `record()`, `flush()` with 13 RAG analytics fields |
| `src/domain/entities/Trace.ts` | Added 13 RAG fields for ORM reads |
| `src/domain/schemas/Trace.schema.ts` | Added RAG field ORM mappings |
| `migrations/1000000000016_add-agent-knowledge-base-ref.cjs` | NEW — adds `knowledge_base_ref` varchar(255) to agents |

## Key Decisions

**Injection order:** RAG context injected BEFORE `applyAgentToRequest`. This means the final system message is `[rag-context]\n\n[agent-system-prompt]` when merge policy is `prepend`. This is intentional — the agent's own system prompt takes authority over the KB context.

**Fallback policy:** Any RAG failure (embedding API error, DB error, artifact not found) logs the error, records `ragStageFailed` + `fallbackToNoRag: true` in the trace, and continues without RAG. Inference is never blocked.

**Embedder resolution:** Passes `embeddingAgentRef: undefined` to `EmbeddingAgentService.resolveEmbedder()`, which falls back to `SYSTEM_EMBEDDER_PROVIDER` + `SYSTEM_EMBEDDER_MODEL` env vars. Future enhancement: parse embedder ref from KB artifact's bundleData spec.

**topK default:** 5 chunks. Hardcoded for Phase 1; can be made configurable via agent config or KB spec in Phase 2.

**pgvector query:** `knex.raw('... <=> ?::vector ...', [vectorLiteral, artifactId, vectorLiteral, topK])` where `vectorLiteral` is `[x1,x2,...,xN]` string. Returns cosine similarity as `1 - cosine_distance`.

## RAG Analytics Fields (TraceInput → traces table)

| Field | Description |
|-------|-------------|
| `knowledgeBaseId` | Artifact UUID of the KB used |
| `ragRetrievalLatencyMs` | Total RAG pipeline latency (embed + search) |
| `embeddingLatencyMs` | Time to embed query |
| `vectorSearchLatencyMs` | Time for pgvector SELECT |
| `retrievedChunkCount` | Number of chunks returned |
| `topChunkSimilarity` | Highest cosine similarity score |
| `avgChunkSimilarity` | Average cosine similarity score |
| `ragStageFailed` | 'none' \| 'embedding' \| 'retrieval' \| 'injection' |
| `fallbackToNoRag` | true if RAG failed and request continued without it |

## Handoff Notes

- **Fenster:** `knowledge_base_ref` column added to `agents` table via migration 0016. Agent creation/update routes in portal may need to expose this field in DTOs for user configuration.
- **Redfoot:** RAG analytics fields now flowing into traces. Can build dashboard panels for retrieval latency, similarity score distribution, fallback rate.
- **Phase 2 items:** (1) Per-KB configurable topK from spec, (2) Azure embedding support in `embedQuery()`, (3) Streaming RAG support, (4) Citation tracking (parse `[N]` refs from response)
