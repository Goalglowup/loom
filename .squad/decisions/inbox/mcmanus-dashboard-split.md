# Decision: Admin Dashboard Split — Separate Auth + Tenant Filter

**By:** McManus (Frontend)  
**Date:** 2026-02-26  
**Status:** Implemented

## Context

The admin dashboard previously used an API key (stored in `localStorage.loom_api_key`) to call the tenant-scoped `/v1/traces` endpoint. This meant an admin could only see one tenant's data at a time — whichever tenant's API key they had loaded. There was no way to browse across tenants.

Simultaneously, the tenant portal (portal/) had no traces or analytics UI — tenants couldn't see their own request history.

## Decision

### Admin Dashboard
- Switch TracesPage and AnalyticsPage from API key auth to admin JWT (`localStorage.loom_admin_token`, managed by `adminApi.ts`)
- Call the new admin endpoints: `/v1/admin/traces`, `/v1/admin/analytics/summary`, `/v1/admin/analytics/timeseries`
- Add a tenant filter dropdown above traces/analytics; fetches tenant list from `/v1/admin/tenants`
- No API key prompt shown for admin dashboard — if admin token missing, show a sign-in link instead

### Portal
- Add `/app/traces` → TracesPage (tenant-scoped, JWT auth, calls `/v1/traces`)
- Add `/app/analytics` → AnalyticsPage (tenant-scoped, JWT auth, calls `/v1/analytics/summary` + timeseries)
- Add Traces and Analytics nav links to AppLayout sidebar

## Implementation Pattern

Added `adminMode?: boolean` and `tenantId?: string` props to `TracesTable`, `AnalyticsSummary`, `TimeseriesCharts`. When `adminMode` is true:
- Use `ADMIN_BASE` (from adminApi.ts) instead of `API_BASE`
- Use `adminAuthHeaders()` (Bearer admin JWT) instead of `authHeaders()` (Bearer API key)
- Append `?tenant_id=X` when a tenant is selected

This pattern keeps the component API minimal. The alternative — passing full endpoint URLs and header factories as props — would cause useCallback dependency issues with inline functions.

## Scope Boundaries

- Did **not** build admin analytics charts for per-tenant comparison — deferred to future wave
- Did **not** add real-time refresh to portal traces — not required for Phase 1
- Portal analytics shows a data table (buckets) rather than recharts visualization — portal doesn't have recharts dep; table is sufficient for Phase 1 observability
- Architecture decisions (endpoint shapes, auth model) remain Fenster's domain; this PR purely consumes Fenster's new admin endpoints

## Files Changed

- `dashboard/src/pages/TracesPage.tsx` — admin auth, tenant filter
- `dashboard/src/pages/AnalyticsPage.tsx` — admin auth, tenant filter  
- `dashboard/src/components/TracesTable.tsx` — adminMode/tenantId props
- `dashboard/src/components/AnalyticsSummary.tsx` — adminMode/tenantId props
- `dashboard/src/components/TimeseriesCharts.tsx` — adminMode/tenantId props
- `portal/src/pages/TracesPage.tsx` — new file
- `portal/src/pages/AnalyticsPage.tsx` — new file
- `portal/src/App.tsx` — two new routes
- `portal/src/components/AppLayout.tsx` — two new nav links
