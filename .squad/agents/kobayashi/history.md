# Kobayashi — History

## Core Context

**Project:** Loom — AI runtime control plane  
**Owner:** Michael Brown  
**Stack:** Node.js + TypeScript  
**Description:** Provider-agnostic OpenAI-compatible proxy with auditability, structured trace recording, streaming support, multi-tenant architecture, and observability dashboard.

**Joined:** 2026-03-01

## Learnings

### 2026-03-01: RAG Analytics Metrics Design

**Context:** Designed comprehensive RAG-specific metrics for Loom gateway layer when agents use `knowledgeBaseRef`. RAG flow: (1) embed query via EmbeddingAgent, (2) pgvector similarity search on `kb_chunks`, (3) inject chunks + citations into system prompt, (4) forward to provider.

**Key Decisions:**

**Raw Signals (Captured at Gateway):**
- **Embedding metrics:** `embedding_latency_ms`, `embedding_token_count`, `embedding_model` — captured per-request after embedding completes
- **Retrieval metrics:** `retrieval_latency_ms`, `chunks_retrieved_count`, `chunks_requested_k`, `retrieval_similarity_scores` (JSONB array) — captured after pgvector SELECT
- **Context injection:** `context_tokens_added`, `context_injection_position`, `original_prompt_tokens` — measured before/after augmentation
- **Chunk utilization:** `chunks_cited_count` (parse response for citations), `chunk_ids_retrieved` (JSONB array) — enables precision tracking
- **Cost attribution:** `rag_overhead_tokens` (prompt_tokens - original_prompt_tokens), `rag_cost_overhead_usd` — pre-computed at capture time
- **Failure modes:** `rag_stage_failed` (enum: embedding|retrieval|injection|none), `fallback_to_no_rag` (boolean) — isolates failure points

**Derived Signals (Redfoot Aggregates):**
- **Quality proxies (no ground truth):** `avg_max_similarity_score`, `chunk_utilization_rate` (cited/retrieved %), `kb_exhaustion_rate` (retrieved < K)
- **Latency analysis:** `rag_overhead_percentage`, `ttfb_impact_of_rag`, `retrieval_latency_p95`
- **Token economics:** `context_overhead_ratio` (added/original), `rag_cost_per_request_avg`, `token_utilization_by_kb`
- **Reliability:** `rag_failure_rate`, `fallback_rate`, `retrieval_timeout_rate`

**Implementation Strategy:**
- Add nullable RAG columns to `traces` table (backward compatible)
- Store similarity scores as JSONB arrays (efficient aggregation, no N+1 queries)
- Pre-compute derived-at-capture-time signals like `rag_overhead_tokens` (avoids joins in analytics queries)
- Token counting via tiktoken (~0.5ms overhead, acceptable)
- Citation parsing via regex on response; defer to trace flush if >2ms

**Observability Without Ground Truth:**
- Chunk utilization rate (% of retrieved chunks cited) as precision proxy
- Similarity score trends detect KB degradation
- Context overhead ratio identifies prompt crowding
- Retrieval latency p95 for SLA monitoring

**Open Questions for Team:**
- Citation format standard (proposed: `[1]`, `[chunk-id]`, or markdown footnotes?)
- Acceptable chunk utilization threshold (proposed: >40%)
- Separate `embedding_traces` table vs embedding data in main traces?
- Fallback policy: automatic graceful degradation vs fail-fast?
- Recommended top-K range (proposed: 3-10, make configurable for A/B testing)

**Handoff to Redfoot:**
- All raw signals are gateway-observable; Redfoot owns aggregation pipeline
- Dashboard panels: utilization rate, cost overhead, latency breakdown by stage
- Alerting thresholds: `rag_failure_rate > 1%`, `chunk_utilization_rate < 30%`
- Time-series for embedding/retrieval latency trends

**What I Learned:**
- RAG observability requires balance: capture enough to diagnose, not so much it bloats traces
- Similarity scores + utilization rate provide quality signal without ground truth labels
- Pre-computing derived metrics at capture time (e.g., `rag_overhead_tokens`) avoids expensive joins
- JSONB arrays for similarity scores beat separate tables (no N+1, native pg aggregation)
- Token counting overhead (~0.5ms) negligible compared to embedding/retrieval latency
- Failure stage isolation critical: distinguish embedding failures from DB timeouts from prompt injection issues
- Cost attribution must separate RAG overhead from base request cost for ROI analysis

**Decision Merged:** 2026-03-01  
Kobayashi's RAG metrics spec merged into `.squad/decisions.md` alongside Redfoot's aggregation strategy. Team now has unified raw/derived signal framework for implementation phasing (P0/P1/P2).
