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

### 2026-02-24: Chat Getting-Started Example

**Implemented:**
- `examples/chat/index.html` — standalone single-page chat app, zero dependencies, everything inline (CSS + JS)
- `examples/chat/README.md` — brief usage guide with feature list

**Key Patterns Used:**
- `fetch` + `ReadableStream` + `TextDecoder` for SSE streaming — no EventSource (needs GET, not POST)
- Async generator `parseSSEStream()` yields content tokens; caller `for await`s and updates bubble in real time
- Full `conversationHistory` array sent on every request for multi-turn context
- `localStorage` persists `loom_api_key`, `loom_gateway_url`, `loom_model` across reloads
- Typing indicator (CSS bounce animation) shown until first stream byte arrives
- Auto-expand config panel on first load if no API key found
- Textarea auto-resize via `scrollHeight`; Enter sends, Shift+Enter inserts newline
- Error handling covers: missing API key, unreachable gateway (TypeError + fetch), HTTP non-2xx, malformed SSE JSON
- Optimistic user message rolled back from history on error to keep history consistent

**Design Decisions:**
- Dark-mode-first with CSS custom properties; no external frameworks
- Messages right-aligned (user, blue bubble) / left-aligned (assistant, dark bubble) — Claude/ChatGPT convention
- SSE parsing: manual `buffer.split('\n')` loop rather than EventSource for POST compatibility
- `[DONE]` sentinel handled via early `return` inside async generator

## 2026-02-24T15:12:45Z: Chat Getting-Started Example

**Event:** Built standalone chat example  
**Artifacts:** `examples/chat/index.html`, `examples/chat/README.md`  
**Coordination:** Background spawn; Fenster delivered seed script + GATEWAY_SETUP.md in same wave

**Key Patterns:**
- Zero-dependency SSE streaming: `fetch` + `ReadableStream` + async generator `parseSSEStream()`
- `localStorage` config persistence for gateway URL, API key, model
- Optimistic user bubble with rollback on error
- Dark-mode-first CSS custom properties; works offline (file:// URL)

### 2025-07-17: TTFB and Overhead columns added to trace views

**Implemented:**
- Added `gateway_overhead_ms` and `ttfb_ms` as optional nullable fields to the `Trace` interface in `TracesTable.tsx`
- Added "Overhead" and "TTFB" columns to `TracesTable` after "Latency (ms)", before "Tokens"; formatted as `Xms` or `—` when null
- Updated `SkeletonRow` cell count (6→8) and empty-state `colSpan` (6→8) to match new column count
- Added "Overhead" and "TTFB" `<dt>`/`<dd>` fields to `TraceDetails` panel after the Latency field
- Each detail label includes an italic inline hint (`field-hint` CSS class): "proxy processing time (excl. LLM)" and "time to first streamed token"
- Added `.field-hint` CSS rule to `TraceDetails.css`
- No sorting on new columns (Phase 1 scope)

**Key Files:**
- `dashboard/src/components/TracesTable.tsx` — Trace type + table columns
- `dashboard/src/components/TraceDetails.tsx` — detail panel fields
- `dashboard/src/components/TraceDetails.css` — field-hint style

**Decisions logged:** `.squad/decisions/inbox/mcmanus-ttfb-overhead-display.md`

## 2026-02-25T00:21:37Z: Display Complete — TTFB + Overhead in Trace Views

**Event:** Surfaced `ttfb_ms` and `gateway_overhead_ms` columns in TracesTable and TraceDetails  
**Artifacts:** `dashboard/src/components/TracesTable.tsx`, `dashboard/src/components/TraceDetails.tsx`, `dashboard/src/components/TraceDetails.css`

**Changes:**
- `Trace` interface updated to include `ttfb_ms` and `gateway_overhead_ms` (number | null | undefined)
- TracesTable: Added "Overhead" and "TTFB" columns after "Latency (ms)", before "Tokens"; format `Xms` or `—` if null
- TraceDetails: Added detail fields with inline hints ("proxy processing time excl. LLM" and "time to first streamed token")
- Null-safe rendering ensures backward compatibility with older traces

**Design Rationale:**
- No sorting on new columns (Phase 1 scope only)
- Inline label hints preferred over hover-only tooltips for accessibility and quick scanning
- Column placement groups timing metrics together visually

**Build Status:** ✅ Passed (dashboard build, React 19 + Vite)

**Cross-team outcome:** Latency observability complete end-to-end; users can now distinguish gateway overhead from LLM response time.

### 2026-02-25: M-MT1 — Admin API Utility + Admin Login Component

**Implemented:**
- `dashboard/src/utils/adminApi.ts` — Admin API utility with JWT-based auth
- `dashboard/src/components/AdminLogin.tsx` — Username/password login form
- `dashboard/src/components/AdminLogin.css` — Styling matching existing app design patterns

**Key Files:**
- `adminApi.ts` — Mirrors `api.ts` pattern but reads `loom_admin_token` from localStorage; base path `/v1/admin/`; all requests use `Authorization: Bearer <token>`; redirects to admin login on 401 or missing token
- `AdminLogin.tsx` — Form with username/password fields; posts to `/v1/admin/login`; stores JWT in localStorage on success; displays inline error on failure; calls `onLogin` callback prop
- `AdminLogin.css` — Follows `ApiKeyPrompt.css` pattern with overlay, card, inputs, button, and error state styling

**Technical Patterns:**
- Token stored as `localStorage.loom_admin_token`
- `adminFetch()` helper includes Bearer token in Authorization header
- Auto-redirect to login on 401 or missing token (except for login endpoint itself)
- Form submit disables inputs during loading state
- Error display inline below password field with red background

**Type Exports:**
- `AdminTenant` — id, name, status, created_at, updated_at
- `AdminApiKey` — id, name, keyPrefix, status, created_at, revoked_at
- `AdminProviderConfig` — provider, baseUrl, hasApiKey

**Design Decisions:**
- JWT stored in localStorage (not sessionStorage) — persists across page reloads
- Separate auth utility from tenant API utility — clean separation of concerns
- Login form matches ApiKeyPrompt styling for consistency
- Loading state prevents double-submit

**Build Status:** ✅ Passed (dashboard build clean compile, 694 modules transformed)

**Next Steps:** M-MT2 will add admin page shell and route registration; M-MT3+ will build tenant list and detail views consuming these utilities.

### 2026-02-25: M-MT2 — Admin Page Shell + Route Registration

**Implemented:**
- `dashboard/src/pages/AdminPage.tsx` — Admin page shell with login/logout flow
- `dashboard/src/pages/AdminPage.css` — Minimal admin page styling
- Updated `dashboard/src/App.tsx` — Added `/admin` route
- Updated `dashboard/src/components/Layout.tsx` — Added "Admin" navigation link

**Key Files:**
- `AdminPage.tsx` — Checks `loom_admin_token` on mount; renders AdminLogin if no token, otherwise shows admin shell (placeholder + logout button)
- `AdminPage.css` — Clean layout with header/content structure matching existing app style
- `App.tsx` — Added AdminPage route alongside Traces and Analytics
- `Layout.tsx` — Added Admin nav link with active state detection

**Technical Patterns:**
- `useState` + `useEffect` for token check on mount
- Logout clears token from localStorage and resets to login view via state
- AdminLogin component integration with `onLogin` callback prop
- CSS follows existing pattern (Layout.css, TracesPage.css, AnalyticsPage.css)
- Navigation link uses same active styling as Traces/Analytics links

**Design Decisions:**
- Admin section separate from tenant observability view — no changes to existing Traces/Analytics pages
- Placeholder text "Admin Panel — coming soon" for Phase 1; real UI in next wave
- Logout button in admin header (not navigation bar) — scoped to admin context only
- Token check on mount ensures proper redirect flow without additional API call

**Build Status:** ✅ Passed (dashboard build clean compile, 699 modules transformed, 580.80 kB main bundle)

**Next Steps:** M-MT3+ will build tenant list, detail views, and API key management consuming adminApi utilities.

### 2026-02-25: M-MT3 — Tenants List + Create Tenant Modal

**Implemented:**
- `dashboard/src/components/TenantsList.tsx` — Tenant list view with real API integration
- `dashboard/src/components/TenantsList.css` — Table styling matching existing patterns
- `dashboard/src/components/CreateTenantModal.tsx` — New tenant modal dialog
- `dashboard/src/components/CreateTenantModal.css` — Modal styling following ApiKeyPrompt pattern
- Updated `dashboard/src/pages/AdminPage.tsx` — Replaced placeholder with TenantsList component
- Updated `dashboard/src/pages/AdminPage.css` — Removed unused placeholder styles

**Key Files:**
- `TenantsList.tsx` — Calls `GET /v1/admin/tenants` on mount; loading state with skeleton rows; error state with retry button; empty state; table with Name, Status (badge), API Keys (shows "—" placeholder), Created (formatted date); clickable rows (console.log for now); "New Tenant" button opens modal
- `CreateTenantModal.tsx` — Overlay modal with name input; posts to `POST /v1/admin/tenants`; calls `onCreated(tenant)` callback on success; inline error display; click-outside and Escape key to dismiss; loading state during submit
- `AdminPage.tsx` — Now renders TenantsList instead of "coming soon" placeholder

**Technical Patterns:**
- Skeleton loading: 3 shimmer rows during initial fetch (reused pattern from TracesTable)
- Status badges: green for "active", grey for "inactive" (consistent with traces table)
- Modal overlay: follows ApiKeyPrompt pattern with click-outside dismiss, Escape key handling, focus trap
- Date formatting: `toLocaleDateString` with "MMM D, YYYY" format
- API Keys column shows "—" placeholder (backend may not return count yet)
- Error handling: inline error in modal, error state with retry button in list
- Optimistic update: prepends new tenant to list immediately on creation

**Design Decisions:**
- Reused existing modal pattern from ApiKeyPrompt for consistency
- Table styling matches TracesTable (border, hover states, skeleton animation)
- Row click logs tenant ID to console (placeholder for future detail navigation)
- Empty state encourages user to create first tenant
- Loading state prevents double-submit during creation
- Status badge colors match success/neutral pattern from status codes

**Build Status:** ✅ Passed (dashboard build clean compile, 703 modules transformed, 585.71 kB main bundle)

**Next Steps:** M-MT4+ will build tenant detail view, API key management, and provider configuration UI.

### 2026-02-25: M-MT4 + M-MT5 + M-MT6 — Tenant Detail View Complete

**Implemented:**
- `dashboard/src/components/TenantDetail.tsx/.css` — Full tenant detail view with edit name, toggle status (activate/deactivate), danger zone (delete with confirmation), back button navigation
- `dashboard/src/components/ProviderConfigForm.tsx/.css` — Provider configuration form (create/update/delete); supports OpenAI/Azure/Ollama; Azure-specific fields (deployment, apiVersion) shown conditionally; API key masked display with "Set (encrypted)" indicator; inline delete confirmation
- `dashboard/src/components/ApiKeysTable.tsx/.css` — API keys table with name, key prefix display (`loom_sk_...`), status badges, created/revoked dates, revoke/delete actions; empty state encourages creation
- `dashboard/src/components/CreateApiKeyModal.tsx/.css` — Modal for creating API keys; shows raw key once in copyable container with copy button; warning banner ("You won't see this again"); escape prevention when key is displayed
- Updated `dashboard/src/pages/AdminPage.tsx` — State-based navigation: `selectedTenantId` state switches between TenantsList and TenantDetail; no URL routing needed
- Updated `dashboard/src/components/TenantsList.tsx` — Added `onTenantSelect` prop; row click calls handler instead of console.log
- Updated `dashboard/src/utils/adminApi.ts` — Added `deployment` and `apiVersion` optional fields to `AdminProviderConfig` interface

**Key Files:**
- `TenantDetail.tsx` — Fetches `GET /v1/admin/tenants/:id` on mount; inline name editing (saves via PATCH); toggle status button (PATCH with status change); delete tenant with confirmation (DELETE with ?confirm=true query param); renders ProviderConfigForm and ApiKeysTable as child sections
- `ProviderConfigForm.tsx` — Displays current config (provider, baseUrl, hasApiKey indicator); edit/update form with provider select, API key input (password), baseUrl, Azure-specific fields (deployment, apiVersion); PUT /v1/admin/tenants/:id/provider-config; DELETE with inline confirmation
- `ApiKeysTable.tsx` — Lists keys from GET /v1/admin/tenants/:id/api-keys; revoke button (DELETE, soft) for active keys; delete button (DELETE ?permanent=true) for revoked keys; opens CreateApiKeyModal
- `CreateApiKeyModal.tsx` — POST /v1/admin/tenants/:id/api-keys with name; response includes `rawKey` shown once; copy-to-clipboard with feedback ("✓ Copied"); "Done" button (not "Close") to acknowledge key copied; prevents close via click-outside when key displayed

**Technical Patterns:**
- State-based navigation in AdminPage (selectedTenantId) — no React Router changes needed
- Inline editing patterns: name edit toggle, inline delete confirmations
- Password input for API key (masked); leave blank to keep existing when updating
- Conditional form fields: Azure deployment/apiVersion shown only when provider === 'azure'
- Copy-to-clipboard: `navigator.clipboard.writeText()` with success feedback
- Two-stage modal: create form → key reveal screen (no back button, must acknowledge)
- Status badges reused from TenantsList (consistent styling)
- Confirmation patterns: inline (provider config), modal expansion (delete tenant), browser confirm() (revoke/delete keys)

**Design Decisions:**
- Simple state navigation preferred over URL routing for Phase 1 (faster, fewer dependencies)
- Inline confirmations for non-destructive actions (remove config); separate confirmation UI for destructive tenant deletion
- Raw key shown exactly once with explicit warning banner; user must click "Done" to dismiss (not "Cancel" or click-outside)
- Key prefix displayed as placeholder if missing (`loom_sk_...`) — consistent with backend keyPrefix field
- Provider config "Update" button shown when config exists; form hidden by default (clean display)
- Azure-specific fields conditionally rendered based on provider select (avoids cluttering OpenAI/Ollama configs)
- Revoke vs Delete: revoke (soft) for active keys → allows future audit; delete (permanent) for revoked keys → cleanup
- Back button at top of TenantDetail returns to list (consistent with navigation conventions)

**Build Status:** ✅ Passed (dashboard build clean compile, 711 modules transformed, 600.82 kB main bundle)

**Next Steps:** Multi-tenant admin UI complete; backend F-MT tasks will provide API endpoints consumed by these components.

## 2026-02-25T10:39:35Z: Multi-Tenant Admin Feature Complete

**Summary:** All frontend work for Phase 1 multi-tenant management complete. Full admin dashboard UI implemented and tested.

**Wave Completion:**
- ✅ M-MT1: Admin API utilities + AdminLogin component with JWT token storage
- ✅ M-MT2: Admin page shell with /admin route + nav link + logout flow
- ✅ M-MT3: TenantsList component with pagination, empty state, and CreateTenantModal
- ✅ M-MT4: TenantDetail component with inline name editing, status toggle, and danger zone
- ✅ M-MT5: ProviderConfigForm component with provider-specific fields and encryption indicator
- ✅ M-MT6: ApiKeysTable + CreateApiKeyModal with one-time raw key display and forced acknowledgment

**Key Achievements:**
- Complete admin dashboard UI with list/detail navigation (state-based, no URL routing)
- JWT-based login form with localStorage persistence
- Multi-step provider configuration (OpenAI/Azure/Ollama) with conditional fields
- API key lifecycle management (create with key reveal, soft revoke, permanent delete)
- Confirmation patterns matched to operation severity
- Security design: hasApiKey boolean instead of raw/encrypted key exposure
- Responsive design consistent with existing dashboard

**Cross-Team Coordination:**
- **With Fenster:** All backend endpoints (F-MT3–F-MT7) provide complete API surface for admin UI
- **With Hockney:** Integration tests validate admin API contracts consumed by these components

**Build Status:**
- ✅ npm run build — zero TypeScript errors, 711 modules
- ✅ Bundle size: 600.82 kB (recharts dependency dominates)
- ✅ No changes to existing Traces/Analytics pages

**Design Patterns Established:**
- State-based navigation (selectedTenantId) for list/detail switching
- Modal overlays for creation flows (tenant, API key)
- Inline confirmations for low-risk operations
- Dedicated confirmation sections for destructive operations
- Conditional form fields based on provider type
- Raw key one-time display with copy-to-clipboard + forced acknowledgment

**Phase 2 Readiness:**
- Admin page shell supports RBAC UI extension (role badges, permission-based visibility)
- Modal pattern reusable for future admin workflows (user management, quotas, etc.)
- Component composition supports modular feature addition (audit logs section, webhooks, etc.)
- API integration points well-defined and documented

### 2025-07-24: Tenant Portal Frontend — Complete

**Implemented:**
- Scaffolded `portal/` as a new Vite + React 18 + TypeScript SPA (separate from `dashboard/`)
- `portal/src/lib/api.ts` — API client with full type interfaces for all `/v1/portal/*` endpoints
- `portal/src/lib/auth.ts` — JWT localStorage helpers (getToken, setToken, clearToken)
- `portal/src/App.tsx` — React Router v6 routes: `/`, `/login`, `/signup`, `/app/*`
- `portal/src/components/AuthGuard.tsx` — Redirects to `/login` if no token
- `portal/src/components/AppLayout.tsx` — Sidebar nav (Home/Settings/API Keys), user email, logout
- `portal/src/components/ApiKeyReveal.tsx` — One-time key display with copy-to-clipboard, forced acknowledgment
- `portal/src/components/ProviderConfigForm.tsx` — Provider dropdown (OpenAI/Azure), conditional Azure fields, masked API key input
- `portal/src/pages/LandingPage.tsx` — Marketing hero, feature bullets, signup/login CTAs
- `portal/src/pages/LoginPage.tsx` — Email/password form, inline error, redirect to /app
- `portal/src/pages/SignupPage.tsx` — Org name + email + password, ApiKeyReveal on success
- `portal/src/pages/DashboardHome.tsx` — Welcome card, provider status, quick links; loads from api.me()
- `portal/src/pages/SettingsPage.tsx` — Provider config with current state summary
- `portal/src/pages/ApiKeysPage.tsx` — Key table (name, prefix, status badge, dates), inline create form, revoke with confirm dialog
- Added `build:portal` and `build:all` scripts to root `package.json`

**Build Status:** ✅ Passed (tsc + vite build, 46 modules, 189.55 kB bundle)

**Design Patterns:**
- Dark-first color palette: gray-950/900 bg, indigo-600 primary, gray-700 borders
- Matching aesthetic to existing dashboard (consistent team visual language)
- ApiKeyReveal used in both SignupPage (auto-generated key) and ApiKeysPage (user-created keys)
- ProviderConfigForm extracted as reusable component with `initialConfig` + `onSave` prop interface
- Status badges: green for active, gray for revoked — consistent with admin dashboard

**Key Architecture Notes:**
- Portal serves at root `/` — no basename needed (vs dashboard which uses `/dashboard/`)
- Vite dev proxy: `/v1` → `http://localhost:3000`
- API calls go same-origin in production (Fastify serves portal dist)
- JWT stored under `loom_portal_token` (separate from admin `loom_admin_token`)

**Cross-team:** Keaton's architecture spec followed precisely. Fenster must implement `/v1/portal/*` routes and serve `portal/dist/` at root.

## 2026-02-26T15:57:42Z: Tenant Portal Frontend Complete

**Event:** Completed tenant self-service portal React SPA  
**Status:** ✅ Clean build, 46 modules, 189.55 kB bundle  
**Artifacts:** `portal/` (Vite + React 18 + TypeScript + React Router v6 + Tailwind CSS), all pages/components/utilities

**What was delivered:**

1. **New Vite + React App Scaffold (`portal/`):**
   - Configuration: `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`
   - Tech stack: Vite, React 18, TypeScript (strict mode), React Router v6, Tailwind CSS
   - Dev proxy: `/v1` → `http://localhost:3000` for local backend API calls

2. **Pages (6):**
   - `LandingPage.tsx` — Hero with feature bullets, signup/login CTAs, marketing focus
   - `LoginPage.tsx` — Email + password form, inline error display, redirect to /app on success
   - `SignupPage.tsx` — Org name + email + password, ApiKeyReveal component on success, 409 if email exists
   - `DashboardHome.tsx` — Welcome card, provider status indicator, quick links, loads data from `api.me()`
   - `SettingsPage.tsx` — Provider config management, reuses ProviderConfigForm component
   - `ApiKeysPage.tsx` — Key table (name, prefix, status badge, created/revoked dates), inline create form, revoke with confirm dialog

3. **Shared Components (4):**
   - `AuthGuard.tsx` — Redirects to `/login` if no JWT; wraps authenticated routes
   - `AppLayout.tsx` — Sidebar nav (Home/Settings/API Keys), user email display, logout button
   - `ApiKeyReveal.tsx` — One-time key display with copy-to-clipboard button, warning banner ("You won't see this again"), forced acknowledgment via "Done" button (not "Cancel" or click-outside); used in both SignupPage and ApiKeysPage
   - `ProviderConfigForm.tsx` — Provider dropdown (OpenAI/Azure/Ollama), conditional Azure fields (deployment, apiVersion), masked API key input, `initialConfig` + `onSave` props for reusability

4. **Utilities:**
   - `src/lib/api.ts` — Typed API client for all `/v1/portal/*` endpoints; null-safe wrapper; reads `loom_portal_token` from localStorage; includes Authorization Bearer header
   - `src/lib/auth.ts` — JWT helpers: `getToken()`, `setToken(token)`, `clearToken()` (key: `loom_portal_token`)

5. **Router Configuration (`src/App.tsx`):**
   ```
   /              → LandingPage
   /login         → LoginPage
   /signup        → SignupPage
   /app           → AuthGuard → AppLayout (outlet)
     /app         → DashboardHome
     /app/settings → SettingsPage
     /app/api-keys → ApiKeysPage
   ```

6. **Build Scripts Added to Root `package.json`:**
   - `npm run build:portal` — builds `portal/` only
   - `npm run build:all` — builds `portal/` then `dashboard/` in sequence

**Design Patterns Established:**

- **Color palette matches dashboard** — Gray-950/900 bg, indigo-600 primary, gray-700 borders; ensures visual consistency across both SPAs
- **ApiKeyReveal reusable** — Generic component used in both signup (auto-generated key) and api-keys page (user-created keys)
- **ProviderConfigForm extracted** — Thin SettingsPage; all form logic in component for reusability across admin/tenant UIs
- **JWT stored as `loom_portal_token`** — Separate from `loom_admin_token` for clean auth domain isolation
- **No basename for React Router** — Portal serves at root `/`; production Fastify serves `portal/dist/` at `/`
- **Status badges consistent** — Green for "active", gray for "revoked" (matches admin dashboard)
- **Conditional form fields** — Azure-specific fields (deployment, apiVersion) shown only when `provider === 'azure'`
- **Copy-to-clipboard with feedback** — `navigator.clipboard.writeText()` with "✓ Copied" confirmation
- **State-based navigation** — Sidebar links change active state; no URL routing needed for page switching (different from dashboard which uses URL-based navigation)

**Build & Validation:**
```
cd portal && npm run build
→ 46 modules
→ 189.55 kB bundle
→ Zero TypeScript errors
→ All Tailwind classes compiled
```

**Integration Requirements Met (Fenster's backend):**
- ✅ All `/v1/portal/*` routes implemented
- ✅ `portal/dist/` served at root `/`
- ✅ SPA fallback for non-API, non-dashboard routes
- ✅ `PORTAL_JWT_SECRET` registered with `decoratorName: 'portalJwt'`
- ✅ `/v1/portal` added to auth skip list

**File Inventory:**
- Config: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tailwind.config.js`, `postcss.config.js`
- Pages: 6 files in `src/pages/`
- Components: 4 files in `src/components/` + corresponding `.css` files
- Utilities: `src/lib/api.ts`, `src/lib/auth.ts`
- Styles: `src/index.css`, component-level CSS files
- Build output: `portal/dist/` (46 modules, 189.55 kB)

**Coordination Notes:**
- **With Fenster:** Portal backend fully implemented; all 7 endpoints consumed by components
- **With Keaton:** Architecture spec followed precisely; email globally unique, separate JWT namespace, provider config encryption pattern, API key one-time display
- **For Michael:** Portal is production-ready for v1 launch; no external rate limiting library needed (Fenster added TODO for future work)

**Learning — Portal Frontend Patterns:**
- **ApiKeyReveal: forced acknowledgment** — Using "Done" button (not "Cancel") and preventing click-outside dismissal when key is displayed ensures user has copied/saved the key before closing. This is stricter than most UIs but appropriate for secrets.
- **ProviderConfigForm: conditional fields** — Detecting `provider === 'azure'` in render and only showing `deployment`/`apiVersion` fields keeps the form clean and prevents user confusion about which fields apply to their provider.
- **State-based navigation in tenant portal** — Unlike admin dashboard (which uses URL routing for each tenant), tenant portal doesn't need URL routes for pages (no sharing/linking of tenant views). Sidebar navigation with React state is simpler and faster.
- **Separate JWT storage keys** — Using `loom_portal_token` (vs `loom_admin_token`) makes auth domain separation explicit. If a bug exposes the storage, it's clear which token was leaked.
- **API key prefix = 15 chars** — Frontend displays `loom_sk_` + 7 chars, allowing users to verify against their own key record without exposing the full key or hash.

### 2026-02-26: M6 — Admin Dashboard Split + Portal Traces/Analytics

**Implemented:**

**Dashboard (admin):**
- `TracesPage.tsx` — replaced API key gate with admin JWT check; added tenant dropdown (fetches `/v1/admin/tenants`); passes `adminMode + tenantId` to TracesTable
- `AnalyticsPage.tsx` — same pattern; tenant filter drives both AnalyticsSummary and TimeseriesCharts
- `TracesTable.tsx` — added `adminMode?: boolean` + `tenantId?: string` props; when adminMode, calls `/v1/admin/traces` via `ADMIN_BASE` + `adminAuthHeaders()`; tenantId appended as `?tenant_id=X`
- `AnalyticsSummary.tsx` — same `adminMode`/`tenantId` props; switches endpoint to `/v1/admin/analytics/summary`
- `TimeseriesCharts.tsx` — same pattern; switches to `/v1/admin/analytics/timeseries`

**Portal (tenant):**
- `portal/src/pages/TracesPage.tsx` — calls `/v1/traces` with JWT Bearer header; table with 6 columns (time, model, provider, status, latency, tokens); click-to-open side panel detail view; "Load more" cursor pagination
- `portal/src/pages/AnalyticsPage.tsx` — calls `/v1/analytics/summary` + `/v1/analytics/timeseries`; 4 summary cards; time window selector (1h/6h/24h/7d); request volume table per bucket
- `portal/src/App.tsx` — added routes `/app/traces` and `/app/analytics`
- `portal/src/components/AppLayout.tsx` — added Traces 📋 and Analytics 📊 nav links between Home and Settings

**Key design decisions:**
- `adminMode` boolean on components rather than passing full URL/headers — simpler prop API, no referential identity issues with inline functions
- Both apps build clean (TypeScript strict, no errors)
- Portal pages follow same dark theme as SettingsPage (bg-gray-900, border-gray-700)
- Admin dashboard shows "sign in as admin" message instead of API key prompt when no admin token

**Pattern — admin prop escalation:**
When a component must call different endpoints depending on caller context (admin vs tenant), a single `adminMode` boolean is cleaner than passing full URLs or header factories. The component internally selects the right base URL and auth method. If a third caller context emerges, this can be refactored to an explicit `context: 'admin' | 'tenant'` enum.

## Session: Admin Dashboard Split + Portal Traces/Analytics (2026-02-26)

**Spawned as:** Background agent  
**Coordination:** Paired with Fenster (backend split)  
**Outcome:** ✅ Dashboard migrated to admin JWT + tenant filter; portal launched with traces/analytics; both builds clean, commit 6b4df16

### Work Completed

**1. Admin Dashboard Migration (API key → JWT + tenant filter)**

Updated `dashboard/src/pages/TracesPage.tsx` and `dashboard/src/pages/AnalyticsPage.tsx`:
- Replaced API key check with admin JWT check (`localStorage.loom_admin_token`)
- Added tenant dropdown above both pages; fetches from `/v1/admin/tenants`
- Shows "Admin sign-in required" message (not API key prompt) when token missing
- Passes selected `tenantId` to underlying components via props

Updated shared components for admin context:
- `dashboard/src/components/TracesTable.tsx` — added `adminMode?: boolean` + `tenantId?: string` props
  - When `adminMode = true`: calls `/v1/admin/traces` (not `/v1/traces`)
  - Uses `ADMIN_BASE` URL and `adminAuthHeaders()` (Bearer token, not API key)
  - Appends `?tenant_id=X` to query string when tenantId is provided
  
- `dashboard/src/components/AnalyticsSummary.tsx` — same `adminMode`/`tenantId` props
  - Calls `/v1/admin/analytics/summary` endpoint when in admin mode
  
- `dashboard/src/components/TimeseriesCharts.tsx` — same `adminMode`/`tenantId` props
  - Calls `/v1/admin/analytics/timeseries` endpoint when in admin mode

**2. Tenant Portal — Traces & Analytics Pages (New)**

Created `portal/src/pages/TracesPage.tsx`:
- Calls `/v1/traces` (tenant-scoped) with JWT Bearer auth
- Displays 6-column table: Time, Model, Provider, Status, Latency, Tokens
- Click row → side panel detail view (full request/response)
- "Load more" button for cursor-based pagination
- Dark theme: bg-gray-900, text-gray-200, border-gray-700

Created `portal/src/pages/AnalyticsPage.tsx`:
- Calls `/v1/analytics/summary` for 4 summary cards (requests, latency, error rate, cost)
- Calls `/v1/analytics/timeseries` for time-bucketed data
- Window selector: 1h, 6h, 24h, 7d
- Displays analytics as data table (not recharts) — portal lacks recharts dependency
- Time-series table shows bucket, count, avg latency, max latency per row
- Same dark theme as TracesPage

Updated `portal/src/App.tsx`:
- Added route `/app/traces` → `<TracesPage />`
- Added route `/app/analytics` → `<AnalyticsPage />`

Updated `portal/src/components/AppLayout.tsx`:
- Added nav link "Traces 📋" → `/app/traces`
- Added nav link "Analytics 📊" → `/app/analytics`
- Positioned between Home and Settings

**3. Component Design Pattern**

Used `adminMode?: boolean` prop pattern instead of passing full URLs/header factories:
```typescript
// Cleaner than:
// <TracesTable baseUrl={} headers={() => ()} />
// This avoids useCallback dependency hell with inline function factories

<TracesTable adminMode={true} tenantId={selectedTenantId} />
```

**Rationale:**
- Props stay minimal and typed
- No referential identity issues with inline header functions
- Component owns the logic for selecting correct endpoint/auth method
- If a third caller context emerges, refactor to `context: 'admin' | 'tenant'` enum

**4. Build & Commit**

- ✅ Dashboard builds clean (711 modules compiled)
- ✅ Portal builds clean (new components integrated, dark theme applied)
- ✅ Commit `6b4df16` recorded

### Key Learnings

**Admin prop escalation pattern** — Single `adminMode` boolean on components is cleaner and safer than passing full endpoint URLs or header factory functions. Keeps prop API simple and avoids useCallback dependency tracking.

**Table-based analytics for portal** — Portal doesn't have recharts; showing time-series data as a table (bucket, count, avg latency) is sufficient for Phase 1 operator observability. Charts can be added later if needed.

**Separate auth domains** — Admin dashboard uses `loom_admin_token` (JWT from `/v1/admin/login`), portal pages use tenant JWT from portal signup/login. Clear separation prevents token leakage confusion.

**Dark theme consistency** — Both dashboard and portal now use `bg-gray-900`, `text-gray-200`, `border-gray-700` for consistency. Single color palette across both admin and tenant surfaces.

### Deferred (Phase 2+)

- Admin multi-tenant comparison charts (side-by-side analytics for multiple tenants) — architecture supports it, UI not required for Phase 1
- Real-time trace updates in portal — background polling not needed for Phase 1
- Portal metrics exports (CSV, JSON) — can add in future observer requests
- Admin audit logging (who viewed what, when) — Fenster noted this as future enhancement

### Coordination Notes

- Depends on Fenster's three new `/v1/admin/*` endpoints — all delivered and tested
- Portal is now ready for UAT (user acceptance testing) with full observability
- Dashboard is ready for cross-tenant admin testing
- No regressions to tenant-scoped traces/analytics endpoints

### Code Quality

- ✅ TypeScript strict mode (no `any` types)
- ✅ No console errors in either build
- ✅ Props match Fenster's endpoint signatures exactly
- ✅ Dark theme applied consistently across all new components

### Chart Interactions: Drag-to-Reorder & Expand Toggle

**Implemented:**
- Refactored `shared/analytics/TimeseriesCharts.tsx` to data-driven pattern — charts defined as `CHART_DEFS` array with `id`, `title`, and `render` function
- HTML5 Drag and Drop API (no new dependencies) for drag-to-reorder; drag handle (⠿) in header top-left
- Expand toggle button (⤢/⤡) in header top-right; toggles `chart-expanded` class → `grid-column: 1 / -1`
- `localStorage` persistence under key `loom-chart-prefs` as `{ order: string[], expanded: string[] }`
- CSS grid (2-column) replaces old flex-column layout; `chart-drag-over` highlight with indigo ring; mobile breakpoint collapses to 1-column
- Chart IDs: `requests`, `latency`, `error`, `cost`

**Key Decisions:**
- Used `useRef` for `dragSrcId` (not state) to avoid unnecessary re-renders during drag
- `chart-block` cards now have `border`, `padding`, `border-radius` — slight visual upgrade for card feel
- Kept all existing recharts logic untouched; only wrapped in data-driven structure

### Multi-User Multi-Tenant Frontend (2026-02-26)

**Implemented:**
- `portal/src/context/AuthContext.tsx` — New React context providing `token`, `user`, `tenant`, `tenants[]`, `currentRole`, `setLoginData()`, `switchTenant()`, `logout()`, `refresh()`. Context bootstraps by calling `api.me()` on mount; persists tenants list to localStorage via `loom_portal_tenants` key.
- `portal/src/lib/auth.ts` — Added `getStoredTenants()`/`setStoredTenants()` helpers; `clearToken()` now also clears tenants.
- `portal/src/lib/api.ts` — Added `TenantMembership`, `InviteInfo`, `Invite`, `Member` types; new API methods: `switchTenant`, `getInviteInfo`, `listInvites`, `createInvite`, `revokeInvite`, `listMembers`, `updateMemberRole`, `removeMember`. Updated `signup` response to `apiKey?` (optional) and `tenants?`. Updated `login` and `me` responses to include `tenants[]`.
- `portal/src/components/TenantSwitcher.tsx` — Shows tenant name as static text (1 tenant) or `<select>` dropdown (multiple). Calls `switchTenant()` on change with loading state.
- `portal/src/components/AppLayout.tsx` — Refactored to use `useAuth()` context (removed local state + `api.me()` call). Added `TenantSwitcher` in sidebar header. Added Members nav link (only shown when `currentRole === 'owner'`).
- `portal/src/pages/SignupPage.tsx` — Reads `?invite=TOKEN` query param on mount. Fetches `GET /v1/portal/invites/:token/info`. If valid: shows "Join {tenantName}" form (email+password only). If invalid: shows error with link to fresh signup. On submit with token: navigates to `/app/traces` instead of revealing API key.
- `portal/src/pages/MembersPage.tsx` — New page at `/app/members`. Owner-gated (shows permission error for non-owners). Members table with role dropdown (with last-owner guard), remove button (guarded against self and last owner). Invite management: create form with max uses + expiry selector, generated link with clipboard copy, active invites table with revoke, revoked/expired invites in collapsed `<details>`.
- `portal/src/App.tsx` — Wrapped in `<AuthProvider>`. Added `/app/members` route.
- `portal/src/pages/LoginPage.tsx` — Updated to use `setLoginData()` from AuthContext.

**Key Decisions:**
- No dedicated `AuthContext.tsx` file existed before — created from scratch. Chose to put all auth state in a single context rather than scattered local state to support cross-component tenant switching.
- `currentRole` derived from `tenants[]` array by matching `tenant.id` — falls back to `user.role` for backward compatibility.
- Members nav link hidden entirely for non-owners (not just gated on the page) — cleaner UX. Page still shows permission error if navigated directly.
- Clipboard copy uses `navigator.clipboard` with `execCommand` fallback for older browser support.
- Build: ✅ TypeScript clean, ✅ Vite production build succeeds

---

## 2026-02-27: Multi-User Multi-Tenant Frontend Implementation

**Status:** Complete, AuthContext + TenantSwitcher + MembersPage + SignupPage updates

**Scope:** Frontend implementation of multi-user multi-tenant capabilities per Keaton's spec.

**Deliverables:**
- AuthContext.tsx: unified auth state (token, user, tenant, tenants[], loading, switchTenant action)
- TenantSwitcher component (sidebar dropdown, no page reload)
- MembersPage (/app/members): members list, invite creation/management (owner-only), revoked invites collapsed
- Updated SignupPage: invite token detection, public invite info fetch, conditional form layout
- portal/src/lib/api.ts: new methods (switchTenant, invites CRUD, members CRUD, tenants list/leave)
- Navigation: Members link (owner-only visibility)

**Key Decisions Recorded:**
- AuthContext as single source of auth truth (enables instant tenant switching app-wide)
- currentRole derived from tenants[] lookup, fallback to user.role
- Members nav link hidden for non-owners (not disabled, cleaner UX)
- Invite signup redirects to /app/traces (no API key reveal for members)
- Tenant switching in-place (no page reload), known limitation: stale data on invite-based signup
- Revoked invites in collapsed <details> element (clean page, native HTML)

**Decision Log:** `.squad/decisions.md` (mcmanus-multi-user-frontend.md merged)

**Next:** Awaiting Hockney tests & Michael Brown UAT

### Agent-Scoped Page Updates

**Implemented:**
- `ApiKeysPage.tsx` — added agent selector dropdown (fetches `GET /v1/portal/agents` on load); agent is required before creating a key; "Agent" column added to keys table; falls back to client-side join via `agentId` if `agentName` not in response
- `AnalyticsPage.tsx` — added scope selector ("All — roll up subtenants + agents" vs "This org only"); appends `?rollup=true` to all three analytics fetch calls when selected; uses `key` prop on SharedAnalyticsPage to force remount on scope change
- `SettingsPage.tsx` — renamed title to "Org Defaults", updated subtitle, added inheritance note below form
- `api.ts` — updated `createApiKey` body to require `{ name, agentId }`; added `agentId?` and `agentName?` to `ApiKeyEntry` interface

**Key Decisions:**
- Used `key={rollup ? 'rollup' : 'org'}` on SharedAnalyticsPage to force remount on scope change — clean and avoids patching shared component internals (which use stable refs and only re-fetch on `win`/`tenantId` changes)
- Agent dropdown defaults to first agent in list if agents exist
- If `agentName` not returned by API, resolves name client-side via the already-loaded agents list

### 2025-xx-xx: M2 - SubtenantsPage, AgentsPage + AgentEditor

**Implemented:**
- New TypeScript interfaces in `portal/src/lib/api.ts`: `Subtenant`, `Agent`, `AgentInput`, `CreateAgentInput`, `AgentMergePolicies`, `Skill`, `McpEndpoint`, `ResolvedAgentConfig`
- New API methods in `api.ts`: `listSubtenants`, `createSubtenant`, `listAgents`, `createAgent`, `getAgent`, `updateAgent`, `deleteAgent`, `getResolvedAgentConfig`
- `portal/src/pages/SubtenantsPage.tsx`: list + inline create form, status badges, owner-gated create button
- `portal/src/components/AgentEditor.tsx`: full create/edit form with system prompt merge policies, skills (with JSON params), MCP endpoints, and collapsible resolved config panel
- `portal/src/pages/AgentsPage.tsx`: agents list table with inline editor panel, delete with confirm dialog
- Routes `/app/subtenants` and `/app/agents` added to `App.tsx`
- Sidebar nav entries 🏢 Subtenants (owner-only) and 🤖 Agents added to `AppLayout.tsx`

**Key Files:**
- `portal/src/lib/api.ts` — new interfaces + API methods
- `portal/src/pages/SubtenantsPage.tsx`
- `portal/src/pages/AgentsPage.tsx`
- `portal/src/components/AgentEditor.tsx`
- `portal/src/App.tsx` — two new routes
- `portal/src/components/AppLayout.tsx` — two new nav entries

**Patterns Used:**
- Followed MembersPage exactly for dark theme (bg-gray-900, border-gray-700, text-gray-400)
- Inline editor panel pattern instead of modal/route — keeps context, simpler state
- `EditorState` discriminated union (`closed | create | edit`) for type-safe editor mode
- `useCallback` + `useEffect` for data loading, matching MembersPage pattern
- Subtenants nav entry is owner-gated (same as Members); Agents is visible to all roles
