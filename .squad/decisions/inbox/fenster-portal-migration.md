# Portal Migration — Phases 2 & 3 Complete

**Date:** 2026-02-24  
**Agent:** Fenster  
**Status:** ✅ Complete

## Summary

Successfully completed Phases 2 and 3 of the portal migration, wiring `UserManagementService` and `TenantManagementService` into the portal routes and migrating 20+ route handlers away from PortalService.

## Changes

### Phase 2: Service Wiring
- Updated `src/index.ts` to instantiate domain services and pass them to `registerPortalRoutes`
- Modified `src/routes/portal.ts` function signature to accept the new services

### Phase 3: Route Handler Migration
Migrated the following routes to use domain services:

**Auth (→ UserManagementService):**
- POST /v1/portal/auth/signup
- POST /v1/portal/auth/login  
- POST /v1/portal/auth/signup-with-invite
- POST /v1/portal/auth/switch-tenant
- POST /v1/portal/tenants/:tenantId/leave

**API Keys (→ TenantManagementService):**
- GET /v1/portal/api-keys
- POST /v1/portal/api-keys
- DELETE /v1/portal/api-keys/:id

**Agents (→ TenantManagementService):**
- POST /v1/portal/agents
- PUT /v1/portal/agents/:id
- DELETE /v1/portal/agents/:id

**Members (→ TenantManagementService):**
- GET /v1/portal/members
- PATCH /v1/portal/members/:userId
- DELETE /v1/portal/members/:userId

**Invites (→ TenantManagementService):**
- POST /v1/portal/invites
- GET /v1/portal/invites
- DELETE /v1/portal/invites/:id

**Subtenants (→ TenantManagementService):**
- POST /v1/portal/subtenants

**Settings (→ TenantManagementService):**
- PATCH /v1/portal/settings

## Routes Still on PortalService
- GET /v1/portal/agents (listAgents) — migration pending
- GET /v1/portal/agents/:id (getAgent) — migration pending  
- GET /v1/portal/agents/:id/resolved (getAgentResolved) — migration pending
- GET /v1/portal/me — migration pending
- GET /v1/portal/traces — stays on PortalService
- Analytics routes — stay on PortalService
- Conversation/partition routes — stay on ConversationManagementService

## Technical Notes
- Domain services return view models with camelCase fields; routes transform these to match existing API contracts
- Error handling: domain services throw errors; routes catch and map to HTTP status codes
- Type conversions needed for `number | null` → `number | undefined` in formatAgent calls
- Test suite required mock updates to match new service interfaces

## Test Results
- All 355 tests passing
- No breaking changes to API contracts
- TypeScript compiles without errors

## Next Steps
- Consider migrating remaining agent routes (getAgent, getAgentResolved) in a future phase
- PortalService can be deprecated once all migrations are complete
