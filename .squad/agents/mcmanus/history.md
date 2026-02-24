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


## 2026-02-24T03:31:15Z: Wave 1 Encryption Launch Spawn

**Event:** Spawned for encryption infrastructure Phase 1  
**Task:** Build trace viewer page  
**Mode:** Background  
**Coordination:** Part of 4-agent wave (Keaton sync, Fenster/McManus/Hockney background)
