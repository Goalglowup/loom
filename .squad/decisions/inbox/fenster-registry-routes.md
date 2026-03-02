# Decision: Registry Gateway Routes Implementation

**Date:** 2026-07-15  
**Author:** Fenster (Backend)  
**Status:** Implemented

## Summary

Created `src/routes/registry.ts` with 7 Fastify route handlers covering the full artifact registry lifecycle. Registered in `src/index.ts` alongside portal/admin/dashboard route groups.

## Routes

| Method | Path | Scope | Delegate |
|--------|------|-------|----------|
| POST | `/v1/registry/push` | `registry:push` | `RegistryService.push()` |
| GET | `/v1/registry/list` | `artifact:read` | `RegistryService.list()` |
| GET | `/v1/registry/pull/:org/:name/:tag` | `artifact:read` | `RegistryService.pull()` |
| DELETE | `/v1/registry/:org/:name/:tag` | `registry:push` | `RegistryService.delete()` |
| POST | `/v1/registry/deploy` | `deploy:write` | `ProvisionService.deploy()` |
| GET | `/v1/registry/deployments` | `artifact:read` | `ProvisionService.listDeployments()` |
| DELETE | `/v1/registry/deployments/:id` | `deploy:write` | `ProvisionService.unprovision()` |

## Decisions Made

### @fastify/multipart dependency added
`@fastify/multipart` was not in package.json. Added as a runtime dependency (^9.4.0). This is the canonical Fastify multipart plugin, uses busboy internally.

### JWT secret resolution order
`REGISTRY_JWT_SECRET` → `PORTAL_JWT_SECRET` → dev fallback. Matches the pattern in `ProvisionService.ts`.

### orm passed (not em)
`registerRegistryRoutes(instance, orm)` — each handler calls `orm.em.fork()` to get a request-scoped EntityManager. Passing the shared `em` would be unsafe.

### sha256 validation on push
If the client provides a `sha256` field, we compute it from the uploaded bundle and return 400 on mismatch. If omitted, we use the computed value.

### tenantId / orgSlug source
Both extracted from `request.registryUser` (attached by `registryAuth` preHandler). `orgSlug` used as default `org` for list operations if query param not provided.
