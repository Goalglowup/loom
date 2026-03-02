# Decision Record: ProvisionService

**Author:** Fenster (Backend)  
**Date:** 2026-03-03  
**Status:** Implemented

## Context

`src/services/ProvisionService.ts` was created to handle `arachne deploy` — the end-to-end provisioning flow that validates an artifact, validates KB readiness, and mints a scoped runtime JWT.

## Decisions Made

### 1. Runtime JWT secret: `RUNTIME_JWT_SECRET` with `PORTAL_JWT_SECRET` fallback

Runtime tokens use a dedicated `RUNTIME_JWT_SECRET` env var. If not set, falls back to `PORTAL_JWT_SECRET` (consistent with spec: "use the same signJwt utility as portal auth"). This avoids a hard boot failure in dev while clearly separating runtime tokens from portal session tokens in production.

### 2. `deploymentId` returned even on artifact-not-found FAILED

The `DeployResult` interface requires `deploymentId: string`. When an artifact isn't found (step 2 short-circuit), no Deployment row is created. A `randomUUID()` is returned as the deploymentId for interface compliance. Downstream callers should treat this as a transient ID — not a persisted deployment.

### 3. RegistryService injected via constructor default

`RegistryService` is injected as a constructor parameter with `new RegistryService()` as default. No DI container wiring needed for P0; test overrides just pass a mock.

### 4. KB validation: `em.count(KbChunk, ...)` not `artifact.chunkCount`

`artifact.chunkCount` is populated at push time but could be stale if chunks were deleted. Using `em.count(KbChunk, { artifact: artifact.id })` queries the live count for correctness.

### 5. `unprovision` calls `markFailed('Unprovisioned')` then nulls `runtimeToken`

`Deployment.markFailed()` sets status + errorMessage but doesn't clear `runtimeToken` (by design). `unprovision` explicitly nulls it after calling `markFailed` to revoke runtime access.

## Implementation Notes

- `ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000` — runtime tokens are long-lived by design
- `listDeployments` populates `artifact` relation for join data
- `Agent` and `EmbeddingAgent` artifacts skip KB chunk validation (as specified)
- All operations are tenant-scoped
