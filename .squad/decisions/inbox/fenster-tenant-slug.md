# Decision Record: Tenant org_slug Server-Side Implementation

**Author:** Fenster (Backend Dev)
**Date:** 2025-01
**Status:** Implemented

## What was done

Added `orgSlug` field to the Tenant entity, schema, DTOs, and all JWT-issuing paths in `UserManagementService`. Created `src/utils/slug.ts` with `generateOrgSlug` and `validateOrgSlug`. Extended the existing `PATCH /v1/portal/settings` endpoint to accept an `orgSlug` field with validation and uniqueness checking.

## Files created

- `src/utils/slug.ts` — `generateOrgSlug(name)` and `validateOrgSlug(slug)` utilities

## Files modified

- `src/domain/entities/Tenant.ts` — added `orgSlug?: string | null`
- `src/domain/schemas/Tenant.schema.ts` — added `orgSlug` → `org_slug varchar(100)` mapping
- `src/application/dtos/tenant.dto.ts` — added `orgSlug?: string | null` to `UpdateTenantDto`
- `src/application/services/TenantManagementService.ts` — `updateSettings` handles `orgSlug`; new `findByOrgSlug(slug)` helper
- `src/application/services/UserManagementService.ts` — `assignUniqueSlug()` helper; slug auto-generated on `createUser` and `acceptInvite`; all four JWT sign calls now use `tenant.orgSlug ?? null`
- `src/routes/portal.ts` — `PATCH /v1/portal/settings` extended with optional `orgSlug` param; validates, checks uniqueness (excluding self), updates

## Key decisions

- **Made `provider` optional in PATCH /v1/portal/settings**: Fastify prohibits duplicate route registration, so the existing provider-config endpoint was extended. `provider` is now optional; if only `orgSlug` is provided the handler short-circuits after the slug update.
- **Uniqueness collision strategy**: On creation, appends `-2`, `-3`, etc. to the base slug. On update via PATCH, returns 409 if slug is taken by another tenant (let client pick a different one).
- **`assignUniqueSlug` called before `em.flush()`**: Runs DB uniqueness check against committed rows while the new tenant row is still pending; safe because the new tenant isn't visible in DB yet.
