# Decision: Registry Auth Middleware + JWT Scope Extension

**By:** Fenster (Backend)  
**Date:** 2026-02-27  
**Status:** Implemented

## What

- Created `src/auth/registryScopes.ts` — defines `REGISTRY_SCOPES` constants and `TENANT_OWNER_SCOPES` array
- Extended `src/auth/jwtUtils.ts` — added `JwtPayload` interface with `scopes?: string[]` and `orgSlug?: string | null`
- Created `src/middleware/registryAuth.ts` — factory that returns a Fastify preHandler for scope-based registry authorization
- Updated `src/application/services/UserManagementService.ts` — all four `signJwt` calls now include `scopes` (owner gets `TENANT_OWNER_SCOPES`, member gets `[]`) and `orgSlug: null` (pending org_slug migration)

## Why

Registry routes require fine-grained permission checks beyond the coarse tenant role (`owner`/`member`). Embedding scopes in the JWT avoids additional DB lookups per request and enables stateless authorization at the gateway layer.

## Decisions

- `registryAuth(requiredScope, secret)` takes an explicit `secret` parameter to match the existing `createBearerAuth` factory pattern; no global secret singleton
- `orgSlug` set to `null` until the column migration lands (parallel work); no breakage since it's nullable
- Scope assignment is role-based at token-mint time: `owner` → full `TENANT_OWNER_SCOPES`, `member` → `[]`
- `JwtPayload` interface lives in `jwtUtils.ts` (co-located with sign/verify) rather than a separate types file

## Impact

- All existing portal auth flows are backward-compatible (payload is additive only)
- New registry routes can gate on any `REGISTRY_SCOPES` value using `registryAuth(scope, secret)` as a Fastify preHandler
- When `org_slug` migration runs, update `UserManagementService` to populate it from the Tenant entity
