# Routing Rules

| Signal | Agent | Why |
|--------|-------|-----|
| Architecture, design decisions, code review | Keaton | Lead owns high-level decisions and review gates |
| Gateway, proxy, streaming, API endpoints, trace recording | Fenster | Backend owns server-side implementation |
| Dashboard, UI, React components, visualization | McManus | Frontend owns client-side implementation |
| Tests, validation, quality checks, edge cases | Hockney | Tester owns quality assurance |
| PRD decomposition, work breakdown | Keaton | Lead decomposes requirements into work items |
| Multi-tenant architecture, database schema | Fenster | Backend owns data layer |
| Observability, metrics display | McManus | Frontend owns visualization layer |
| Integration testing, streaming validation | Hockney | Tester validates end-to-end flows |
| AI provider integration, OpenAI/Anthropic/Azure adapters | Kobayashi | AI Expert owns provider-side implementation |
| Prompt engineering, system messages, context strategies | Kobayashi | AI Expert owns LLM input design |
| Model routing, cost/latency/capability tradeoffs | Kobayashi | AI Expert owns model selection logic |
| Token budgeting, context window management, truncation | Kobayashi | AI Expert owns token lifecycle |
| LLM observability, trace enrichment, token counts, cost estimates | Kobayashi | AI Expert owns AI-specific telemetry |
| Streaming chunk handling, SSE, partial trace recording | Kobayashi | AI Expert owns LLM streaming behavior |
| Embeddings, multi-modal, evals, A/B model testing | Kobayashi | AI Expert owns advanced AI capabilities |
