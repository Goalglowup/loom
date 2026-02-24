# McManus's Project Knowledge

## Project Context

**Project:** Loom — AI runtime control plane  
**Owner:** Michael Brown  
**Stack:** Node.js + TypeScript  
**Description:** Provider-agnostic OpenAI-compatible proxy with auditability, structured trace recording, streaming support, multi-tenant architecture, and observability dashboard.

**Frontend Scope:**
- Minimal observability dashboard for Phase 1
- Structured trace display (token usage, cost, latency)
- Multi-tenant UI with tenant-scoped views
- Real-time updates for streaming traces (if needed)
- Consume Fenster's backend APIs

**UI Priorities:** Visibility and auditability first — not a heavy analytics dashboard

## Learnings

### 2024-12-25: M1 - Dashboard Scaffold Complete

**Implemented:**
- React 19 + Vite + TypeScript dashboard in `dashboard/` subdirectory
- React Router with `/dashboard` basename for SPA navigation
- Basic layout: header (Loom branding), navigation (Traces, Analytics), content area
- Two placeholder pages: TracesPage and AnalyticsPage
- Fastify static file serving at `/dashboard` route with SPA fallback
- Responsive design with mobile support

**Key Files:**
- `/dashboard/src/App.tsx` - Route configuration
- `/dashboard/src/components/Layout.tsx` - Main layout component
- `/dashboard/src/pages/TracesPage.tsx` - Traces page placeholder
- `/dashboard/src/pages/AnalyticsPage.tsx` - Analytics page placeholder
- `/src/index.ts` - Updated with dashboard static serving (lines 15-28)

**Technical Decisions:**
- Used Vite `base: '/dashboard/'` for correct asset paths
- Fastify `@fastify/static` plugin with `prefix: '/dashboard'`
- SPA fallback in `setNotFoundHandler` using `readFileSync` for index.html
- Build output: `dashboard/dist/`
- No wildcard route handler (conflicts with static plugin)

**Integration Points:**
- Dashboard served by Fenster's Fastify server
- Ready for API integration in Wave 3
- Assets load correctly at `/dashboard/assets/*`
- React Router navigation works (client-side, SPA fallback)

**Next Wave:** M2-M4 will integrate with Fenster's REST APIs for real trace/analytics data

### 2024-12-25: M2 - Trace Viewer Page Complete

**Implemented:**
- Professional trace table in TracesPage component showing mock data
- Table columns: timestamp, tenant, model, provider, latency, tokens, cost
- Clean table styling with hover effects, proper typography, and responsive design
- Formatted data display: localized timestamps, currency formatting, number formatting
- Mock data structure matches expected trace schema (8 sample traces)
- Monospace font for model names, right-aligned numeric columns, tabular numbers

**Key Files:**
- `/dashboard/src/pages/TracesPage.tsx` - Trace viewer component with mock data
- `/dashboard/src/pages/TracesPage.css` - Table styling and responsive layout

**Technical Patterns:**
- TypeScript interface for Trace type with all required fields
- Helper functions for formatting (timestamp, cost, latency)
- Semantic CSS classes (timestamp, tenant, model, provider, cost)
- Responsive table with mobile breakpoint at 768px
- Table styling follows modern web UI patterns (hover states, proper borders)

**Design Decisions:**
- Used system fonts for consistency with dashboard layout
- Monospace font for model names (developer-friendly)
- Right-aligned numeric columns for easier scanning
- Subtle hover effect for row highlighting
- Clean border treatment with rounded container

**Ready for:** Wave 3 API integration — component structure ready to swap mock data with REST API calls


## 2026-02-24T03:31:15Z: Wave 1 Encryption Launch Spawn

**Event:** Spawned for encryption infrastructure Phase 1  
**Task:** Build trace viewer page  
**Mode:** Background  
**Coordination:** Part of 4-agent wave (Keaton sync, Fenster/McManus/Hockney background)

## Learnings

### M2–M5: API Integration & Dashboard Components Complete

**Implemented:**
- `dashboard/src/utils/api.ts` — shared API base URL + auth header helpers; reads `VITE_API_URL` env var, falls back to `http://localhost:3000`; API key from `localStorage.loom_api_key`
- `dashboard/src/components/ApiKeyPrompt.tsx/.css` — modal overlay shown when no API key in localStorage; saves to localStorage on submit
- `dashboard/src/components/TracesTable.tsx/.css` — real `/v1/traces` API, infinite scroll via IntersectionObserver, model+status filter bar (client-side), loading skeleton rows, empty state, status color badges (2xx/4xx/5xx), accessible row click
- `dashboard/src/components/TraceDetails.tsx/.css` — slide-in panel (40% width), escape/click-outside dismiss, encrypted body placeholder, estimated cost calculation
- `dashboard/src/components/AnalyticsSummary.tsx/.css` — 6 metric cards from `/v1/analytics/summary`, time window selector (1h/6h/24h/7d) shared with charts, 30s auto-refresh via setInterval in useEffect cleanup
- `dashboard/src/components/TimeseriesCharts.tsx/.css` — recharts AreaChart for requests + latency, responsive containers, bucket size derived from window
- `dashboard/src/pages/TracesPage.tsx` — replaced mock with real API, integrates TracesTable + TraceDetails
- `dashboard/src/pages/AnalyticsPage.tsx` — integrates AnalyticsSummary + TimeseriesCharts with shared window state
- `dashboard/src/vite-env.d.ts` — added missing Vite client type reference (was absent from scaffold)
- `dashboard/.env.example` — added `VITE_API_URL=http://localhost:3000`

**Key Technical Patterns:**
- Window state lifted to AnalyticsPage so both AnalyticsSummary and TimeseriesCharts respond to same selector
- Infinite scroll: IntersectionObserver on sentinel div at bottom of table, 200px rootMargin trigger
- Auto-refresh: setInterval inside useEffect with cleanup function; `cancelled` flag prevents state updates after unmount
- recharts Tooltip `formatter` receives `number | undefined` — always guard with `?? 0`
- Missing `vite-env.d.ts` causes `import.meta.env` TypeScript errors — always create this for Vite projects

**Issues Closed:** #8 (M2), #9 (M3), #10 (M4), #11 (M5)

## Wave 3 Cross-Agent Learnings

**From Fenster's backend (F8/F9/F10):**
- Analytics engine working perfectly; `/v1/analytics` summary returns correct request counts, average latencies, and total costs.
- `/v1/analytics/timeseries` bucketing correctly handles all time windows (1h→5min, 6h→30min, 24h→60min, 7d→360min).
- `/v1/traces` cursor pagination with ISO timestamp is stable; `nextCursor` logic works correctly with IntersectionObserver.
- Status code (`statusCode` field from TraceInput) now persisted in traces table via migration 1000000000006.
- **Implication:** All backend APIs fully functional. Dashboard M2–M5 components can consume endpoints without modification.

**From Hockney's test suite (H4/H6/H7):**
- Multi-tenant auth tested with 10 cases; key isolation and race conditions all passing.
- Streaming + batch flush integration validated; fire-and-forget trace recording during SSE works correctly.
- Encryption-at-rest per-tenant key derivation verified; dashboard sees encrypted data placeholder as expected.
- **Implication:** Backend security and data integrity fully validated. Production-ready for Wave 4.

**Test Coverage Status:** 85 tests (61 existing + 24 new Wave 3), 100% passing. End-to-end dashboard integration confirmed working.
