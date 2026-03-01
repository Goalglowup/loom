# Decision: Domain Service Parity with Legacy PortalService

**Date:** 2026-02-28  
**Author:** Fenster  
**Status:** ✅ Implemented  
**Related:** [Keaton's PortalService Audit](./keaton-portal-service-audit.md)

## Context

Keaton's audit identified 13 **must-fix** gaps in the domain-layer services (`UserManagementService`, `TenantManagementService`) compared to the legacy `PortalService`. These gaps would break functionality or create security issues when migrating portal routes to use domain services.

## Decision

Fixed all 13 critical gaps to achieve functional parity between domain services and legacy PortalService:

### UserManagementService (6 gaps fixed)

1. **Email uniqueness with 409**: Added explicit pre-check in `createUser()`, throws 409 "Email already registered" instead of relying on DB constraint
2. **Tenant name trimming**: Applied `.trim()` to tenant name in `createUser()`
3. **Default agent creation**: `createUser()` now creates a default Agent entity named "Default" after tenant creation — **critical for API key creation**
4. **Active tenant filtering in login**: `login()` now loads ALL memberships and filters to only `status = 'active'` tenants
5. **Multi-tenant list in login**: `login()` returns `tenants: [{id, name, role}]` array in `AuthResult` for all active memberships
6. **No active tenants guard**: `login()` throws 403 "No active tenant memberships" if user has zero active tenants

**New methods added:**
- `switchTenant(userId, newTenantId)` — validates membership + status, signs new JWT, returns full context
- `leaveTenant(userId, tenantId, currentTenantId)` — prevents leaving active tenant, last-owner protection

**Fixes in acceptInvite:**
- Tenant status check: throw 400 if `tenant.status !== 'active'`
- Duplicate membership: throw 409 "Already a member" instead of silent skip

### TenantManagementService (7 gaps fixed)

1. **Cache invalidation after key revocation**: `revokeApiKey()` now returns `{ keyHash: string }` for route handler to call `invalidateCachedKey()`
2. **Provider cache eviction**: `updateSettings()` calls `evictProvider(tenantId)` when `providerConfig` is updated
3. **Creator membership for subtenants**: `createSubtenant()` now adds `createdByUserId` as owner (prevents orphaned subtenants)

**New methods added:**
- `revokeInvite(tenantId, inviteId)` — sets `revokedAt`, throws 404 if not found
- `listInvites(tenantId)` — returns all invites with `revokedAt` field
- `updateMemberRole(tenantId, targetUserId, role)` — last-owner protection before demotion
- `removeMember(tenantId, targetUserId, requestingUserId)` — prevents self-removal, last-owner protection

### DTO Updates

- `AuthResult` — added `tenants?: Array<{ id, name, role }>` for multi-tenant context
- `CreateSubtenantDto` — added `createdByUserId: string` field
- `InviteViewModel` — added `revokedAt: string | null` field

## Rationale

**Why fix all 13 now?**
- These are **blocking issues** — without them, portal routes cannot migrate to domain services
- Default agent creation breaks API key flow (agent required for keys)
- Cache invalidation gaps create 60-second windows where revoked keys remain usable
- Missing tenant switcher breaks multi-tenant UX

**Why not keep legacy PortalService?**
- Technical debt accumulation
- Inconsistent patterns between routes (some use domain services, some use legacy)
- ORM-based domain services are easier to test and maintain than raw SQL

## Consequences

**Positive:**
- ✅ Portal routes can now safely migrate to domain services
- ✅ API key creation works on new signups (default agent exists)
- ✅ Revoked API keys invalidate immediately (cache eviction)
- ✅ Provider config changes take effect immediately (cache eviction)
- ✅ Multi-tenant switching fully supported
- ✅ Last-owner protection prevents orphaned tenants

**Neutral:**
- Tests updated to reflect 4 persist calls in `createUser` (was 3)
- Login tests updated to mock `find()` instead of `findOne()`

**Negative:**
- None identified

## Verification

- ✅ TypeScript compilation clean (`npx tsc --noEmit`)
- ✅ All 355 tests passing (`npm test`)
- ✅ No breaking changes to existing method signatures (only additions)

## Next Steps

1. **Route migration**: Update portal routes to use domain services instead of PortalService
2. **Integration testing**: Verify cache invalidation works end-to-end in deployed environment
3. **Deprecation plan**: Mark PortalService methods as deprecated once routes are migrated

## Notes

**Error pattern**: Domain services use `throw Object.assign(new Error('message'), { status: 409 })` for HTTP status codes.

**Last-owner protection**: All member removal/demotion methods count owners before proceeding, throw 400 if removing/demoting the last owner.

**Cache eviction imports**: `evictProvider` imported from `../../providers/registry.js` in TenantManagementService.
