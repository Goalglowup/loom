# Decision: Subtenant Rollup in Analytics Queries

**Author:** Fenster (Backend Dev)
**Date:** 2025-02-24
**Status:** Implemented

## Context

Tenants now have a `parent_id` column (nullable) enabling a hierarchy of subtenants. Portal operators managing a parent tenant need aggregate analytics that include all descendant tenants, not just their own traces.

## Decision

Add an optional `rollup: boolean` parameter (default `false`) to the three per-tenant analytics functions in `src/analytics.ts`:

- `getAnalyticsSummary(tenantId, windowHours, rollup)`
- `getTimeseriesMetrics(tenantId, windowHours, bucketMinutes, rollup)`
- `getModelBreakdown(tenantId, windowHours, limit, rollup)`

When `rollup = true`, a `WITH RECURSIVE subtenant_tree` CTE is prepended to the query. The CTE walks `tenants.parent_id` to collect all descendant tenant IDs, and the `WHERE` clause changes from `tenant_id = $1` to `tenant_id IN (SELECT id FROM subtenant_tree)`.

The three portal analytics routes (`/v1/portal/analytics/summary`, `/v1/portal/analytics/timeseries`, `/v1/portal/analytics/models`) now accept a `rollup` query parameter (truthy values: `"true"` or `"1"`).

## Rationale

- **CTE restricted to `tenants` table only**: The `traces` table is partitioned by `created_at`. Keeping the recursion entirely on the non-partitioned `tenants` table and referencing `subtenant_tree` only in an `IN (subquery)` predicate preserves PostgreSQL's ability to prune partitions on `created_at`.
- **Backward compatible**: `rollup` defaults to `false`, so all existing callers and admin variants are unaffected.
- **Admin functions unchanged**: `getAdminAnalyticsSummary`, `getAdminTimeseriesMetrics`, and `getAdminModelBreakdown` already accept an optional `tenantId` filter; rollup is a portal-only concern.

## Alternatives Considered

- **JOIN on tenants at query time**: Would have required restructuring all queries; rejected for complexity and potential index miss on the partitioned table.
- **Materialised view of tenant trees**: Overkill at this stage; recursive CTE is fast for shallow hierarchies and avoids stale-data issues.
