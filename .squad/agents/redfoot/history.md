# Redfoot — History

## Core Context

**Project:** Loom — AI runtime control plane  
**Owner:** Michael Brown  
**Stack:** Node.js + TypeScript  
**Description:** Provider-agnostic OpenAI-compatible proxy with auditability, structured trace recording, streaming support, multi-tenant architecture, and observability dashboard.

**Joined:** 2026-03-01

## Learnings

### 2026-03-01: Analytics Needs for LLM Gateway Operators

Identified six priority areas for Loom analytics expansion:

**P1 - Cost Management:** Multi-dimensional cost attribution (by agent, API key, user metadata, endpoint), cost forecasting, token efficiency metrics. Users need chargeback, budget tracking, and waste identification.

**P2 - Performance & Reliability:** Detailed error breakdowns (by status code, model, provider), latency distributions beyond p95/p99, gateway overhead analysis, streaming vs non-streaming performance comparison.

**P3 - Usage Patterns:** Agent-level analytics (requests, cost, errors per agent), API key usage monitoring, provider/model adoption trends, endpoint usage patterns.

**P4 - Operational Intelligence:** Rate limit tracking (429 errors, near-misses), request/response size analytics, tenant health scorecards (composite metrics), MCP tool routing metrics.

**P5 - Compliance & Security:** Data retention reporting, PII detection, audit log analytics, encryption tracking.

**P6 - Business Intelligence:** Tenant segmentation, cohort retention analysis, feature adoption tracking (streaming, tool calls, vision), revenue analytics for SaaS deployments.

**Key insight:** Different personas need different views. Developers want error diagnostics and latency outliers. Finance wants cost forecasting and attribution. Product wants adoption trends. Admins want health scores and capacity planning. Analytics layer must serve all personas efficiently.

**Implementation strategy:** Leverage existing partition pruning, add composite indexes for common group-bys, consider materialized views for expensive aggregations (daily rollups). Keep dashboard data contracts clean and composable.

### 2025-03-01: Analytics Requirements Analysis
**Context:** Analyzed what analytics Loom users need beyond current minimal coverage (requests, tokens, cost, latency, errors, per-model breakdown).

**Key Categories Identified:**
1. **Platform Operator Needs:** Tenant capacity monitoring, provider economics, system performance SLIs, anomaly detection
2. **Tenant Developer Needs:** Request pattern analysis (endpoint/agent breakdown), cost attribution (per-conversation, prompt efficiency, burn rate), error categorization, trace drill-down
3. **Product/Business Needs:** Adoption metrics (active keys, cohort retention), revenue attribution, margin analysis, usage forecasting

**High-Impact Quick Wins:**
- Endpoint usage breakdown (already have `endpoint` field)
- Agent performance comparison (already have `agent_id`)
- Prompt efficiency ratio (`prompt_tokens / total_tokens`)
- Error categorization by status code
- Latency distribution per model
- Provider reliability scorecard

**Data Gaps Found:**
- No `api_key_id` in traces (can't measure active users/DAU)
- No streaming detection flag (can't compare streaming vs non-streaming TTFB)
- No comprehensive provider pricing table (cost estimates hardcoded for GPT-3.5/4o only)
- No quota/billing tables (blocks budget burn rate, revenue analysis)
- Conversation tracking exists but unclear if `conversation_id` linked to traces

**Architectural Notes:**
- Traces are partitioned by month (good for retention, need to consider cross-partition analytics)
- Already support subtenant rollup via recursive CTE (can extend to tree visualizations)
- Encryption on request/response bodies requires careful access control for trace drill-down feature

**Recommendations Filed:** `.squad/decisions/inbox/redfoot-analytics-recommendations.md`
