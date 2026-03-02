# Decision: Portal KB + Deployment routes

**Date:** 2026-02-28  
**Author:** Fenster (Backend Agent)  
**Status:** Implemented

## What was built

Six new portal API routes added to `src/routes/portal.ts`:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/portal/knowledge-bases` | List all KB artifacts for tenant |
| GET | `/v1/portal/knowledge-bases/:id` | KB detail with live chunk count |
| DELETE | `/v1/portal/knowledge-bases/:id` | Delete KB + all chunks |
| GET | `/v1/portal/deployments` | List deployments with artifact info |
| GET | `/v1/portal/deployments/:id` | Single deployment detail |
| DELETE | `/v1/portal/deployments/:id` | Unprovision deployment |

## Key decisions

**`orm.em.fork()` per request**: Since `RegistryService` and `ProvisionService` take `em` as a method-level parameter (not constructor), we import `orm` from `../orm.js` and fork per handler. No changes to `registerPortalRoutes` signature or `index.ts` needed.

**No `runtimeToken` in responses**: Portal responses intentionally exclude `runtimeToken`. The existing `ProvisionService.unprovision()` clears it internally; we only return `{ success: true }`.

**Live `chunkCount` on KB detail**: Uses `em.count(KbChunk, ...)` rather than `artifact.chunkCount` to match the ProvisionService deploy-validation pattern (chunkCount field can drift).

**`searchReady` flag**: KB detail includes `searchReady: chunkCount > 0` — convenience for the browser UI to show deployment eligibility.

**Auth**: All routes use `authRequired` (not `ownerRequired`) — listing and deleting KBs/deployments is allowed for all tenant members, consistent with trace and analytics routes.
