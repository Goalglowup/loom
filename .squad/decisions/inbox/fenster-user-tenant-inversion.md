# Decision: User/Tenant Construction Inversion

**Date:** 2026-02-25  
**Author:** Fenster (Backend Dev)  
**Status:** Implemented

## Context

Previously, the `User` entity's constructor internally created a `Tenant` and exposed it as a transient `user.tenant` property:

```typescript
constructor(email: string, passwordHash: string, tenantName?: string) {
  // ... set user fields ...
  this.tenant = new Tenant(this, tenantName ?? `${email.split('@')[0]}'s Workspace`);
  this.tenant.createAgent('Default');
}
```

This violated separation of concerns:
- Domain entities shouldn't orchestrate multi-entity creation
- The `tenant` property was marked `persist: false` in the schema — it was a construction artifact, not a domain relationship
- Service layer had to reach into `user.tenant!` to persist the tenant separately

## Decision

**Pull tenant creation out of User and into the service layer.**

### Changes Made

1. **User entity (`src/domain/entities/User.ts`):**
   - Removed `tenant?: Tenant` property
   - Removed `import { Tenant }`
   - Simplified constructor to `constructor(email: string, passwordHash: string)` — just sets id, email, passwordHash, createdAt, lastLogin
   - Removed domain invariant comment about "every User has a default personal Tenant" (now a service rule)

2. **User schema (`src/domain/schemas/User.schema.ts`):**
   - Removed `tenant: { entity: () => Tenant, persist: false, nullable: true }` property
   - Removed unused `import { Tenant }`

3. **UserManagementService (`src/application/services/UserManagementService.ts`):**
   - Added private helper `createUserWithTenant(email, passwordHash, tenantName?)` that:
     - Constructs User
     - Constructs Tenant with user as owner
     - Calls `tenant.createAgent('Default')`
     - Returns `{ user, tenant }`
   - Updated `registerUser()` to use helper
   - Updated `acceptInvite()` (new user branch) to use helper and explicitly persist both user and personalTenant

## Rationale

- **Separation of concerns:** Domain entities are data holders; services orchestrate multi-entity workflows
- **Explicit lifecycle management:** Service layer now clearly shows both user and tenant are created and persisted
- **No transient properties:** User entity no longer has a non-persistent property that only exists during construction
- **Cleaner domain model:** User constructor signature is simpler and focused on user data only

## Impact

- **No schema changes:** The `tenant` property was never a DB column
- **No test changes:** Existing test fixtures use `Object.assign()` and don't call the constructor
- **All tests pass:** 381 tests passing after refactoring

## Alternative Considered

Keeping tenant creation in the User constructor and having the service extract it. Rejected because:
- Leaky abstraction (domain entity constructing other entities)
- Transient property pattern is confusing
- Service layer should own orchestration logic
