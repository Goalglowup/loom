# User Creation Factory Pattern

**By:** Fenster (Backend)  
**Date:** 2026-02-27  
**What:** Implemented `User.create()` static factory method to enforce domain invariant: every User is ALWAYS created with a personal Tenant, owner TenantMembership, and default Agent.  

## Changes

1. **User.create() factory** (`src/domain/entities/User.ts`):
   - Static method: `create(email: string, passwordHash: string, tenantName?: string)`
   - Returns `{ user, tenant, membership, defaultAgent }`
   - Encodes the invariant: User creation = User + personal Tenant + owner membership + default Agent
   - Uses parameterless `new Entity()` pattern (MikroORM requirement)
   - No circular imports: User imports Tenant/TenantMembership/Agent

2. **UserManagementService.createUser** updated:
   - Replaced manual construction (48 lines) with `User.create()` call (6 lines)
   - Service layer now expresses intent, not mechanics

3. **UserManagementService.acceptInvite** updated:
   - New users created via invite ALSO get a personal tenant (invariant respected)
   - User ends up with: (1) their personal tenant + (2) the invited tenant membership

## Why

- **Domain-Driven Design**: Invariants belong in the domain model, not service layer
- **Single Responsibility**: User creation logic lives in one place
- **Prevents bugs**: Impossible to create a User without required entities
- **Testability**: Factory can be tested independently; services stay simple

## Impact

- All new users (signup OR invite) get a personal tenant + default agent
- Service layer code reduced from ~50 lines to ~6 lines per user creation
- Zero breaking changes: all 381 tests pass
- Future user creation code MUST use `User.create()` to respect the invariant

## Alternatives Considered

- **Aggregate class with state**: Rejected; MikroORM entities cannot have constructor params
- **Service-layer logic**: Current approach; moved to domain for better encapsulation
- **Database triggers**: Rejected; domain logic belongs in application code, not DB

## Pattern

```typescript
// Domain entity enforces invariant
const { user, tenant, membership, defaultAgent } = User.create(email, passwordHash, tenantName);

// Service persists the graph
em.persist(user);
em.persist(tenant);
em.persist(membership);
em.persist(defaultAgent);
await em.flush();
```
