# Decision: Admin Trace & Analytics Endpoints

**Date:** 2025-01-31  
**Author:** Fenster  
**Status:** Implemented

## Context

The admin dashboard previously had no way to view traces across tenants — `/v1/traces` is scoped to the API key's tenant. Admin operators need visibility into all tenant activity.

## Decisions

### 1. Separate admin analytics functions, not overloading existing ones

`getAnalyticsSummary` and `getTimeseriesMetrics` in `analytics.ts` take a required `tenantId`. Rather than making `tenantId` optional on the existing functions (which could mask callers that accidentally omit it), we added:

- `getAdminAnalyticsSummary(tenantId?: string, windowHours?)`
- `getAdminTimeseriesMetrics(tenantId?: string, windowHours?, bucketMinutes?)`

Per-tenant dashboard routes remain unchanged and continue to pass a required `tenantId`.

### 2. Dynamic SQL parameter numbering via `params.push()`

Admin queries conditionally include a `tenant_id` filter. We use `params.push(value)` inside template literals — `Array.push` returns the new array length, giving us the correct `$N` placeholder inline. Clean and avoids string-splitting logic.

### 3. `$1` = `limit` in admin traces query

The `LIMIT` binding is always `$1` so it appears at the top of the query. All `WHERE` filter params are pushed after, yielding `$2`, `$3` etc. This keeps the query readable and consistent regardless of which filters are active.

### 4. Endpoints protected by `adminAuthMiddleware` (JWT)

All three new endpoints use the `authOpts = { preHandler: adminAuthMiddleware }` pattern already established in `admin.ts`. No API-key auth is involved — these are admin-only surfaces.

## New Endpoints

| Method | Path | Auth |
|--------|------|------|
| GET | `/v1/admin/traces` | Admin JWT |
| GET | `/v1/admin/analytics/summary` | Admin JWT |
| GET | `/v1/admin/analytics/timeseries` | Admin JWT |

## Impact

- `src/analytics.ts` — two new exported functions added (non-breaking)
- `src/routes/admin.ts` — three new GET routes, two new imports (`getAdminAnalyticsSummary`, `getAdminTimeseriesMetrics`, `query`)
