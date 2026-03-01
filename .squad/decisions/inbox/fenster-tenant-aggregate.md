# Decision: Tenant as Aggregate Root

**Date:** 2026-02-27  
**Author:** Fenster (Backend Dev)  
**Status:** Implemented

## Context

Before this refactoring, `TenantMembership` entities could be created anywhere in the codebase via `new TenantMembership()` followed by manual property assignment. This violated aggregate boundaries and made it difficult to enforce domain invariants around tenant membership.

The domain model needed to enforce:
1. Every tenant has at least one owner (the creator)
2. Memberships are only added through controlled methods
3. Subtenants inherit parent memberships automatically

## Decision

We implemented the **Aggregate Root Pattern** with `Tenant` as the aggregate root:

1. **Tenant Constructor with Owner**: `new Tenant(owner?: User, name?: string)` automatically creates the owner membership when parameters are provided. Parameters are optional to support MikroORM entity hydration.

2. **Controlled Membership Creation**: The `addMembership(user, role)` method is the ONLY way to create `TenantMembership` entities in production code. Service layer code is forbidden from calling `new TenantMembership()` directly.

3. **Subtenant Inheritance**: `createSubtenant(name)` automatically copies all parent memberships to the child tenant, ensuring consistent access control across the tenant hierarchy.

4. **Cascade Persistence**: Added `cascade: [Cascade.PERSIST]` to the `members`, `agents`, and `invites` collections in `TenantSchema`. This allows the ORM to automatically persist membership entities when persisting the tenant.

## Consequences

### Positive

- **Enforced Invariants**: It's now impossible to create a tenant without an owner or to create orphaned memberships
- **Clearer Domain Model**: The relationship between Tenant and TenantMembership is explicit in the code structure
- **Less Boilerplate**: Service layer code is simpler — just `em.persist(tenant)` instead of persisting multiple entities
- **Automatic Inheritance**: Subtenant membership inheritance is handled automatically by domain logic
- **Better Encapsulation**: All membership-related logic lives in the Tenant entity

### Negative

- **MikroORM Constructor Constraint**: Constructors must have optional parameters, which is less type-safe than required parameters
- **Cascade Behavior**: Developers must understand that persisting a tenant also persists its collections
- **Test Complexity**: Test fixtures need to populate parent.members for subtenant tests to work correctly

## Alternatives Considered

1. **Required Constructor Parameters**: Would be more type-safe but incompatible with MikroORM entity hydration
2. **Service-Layer Membership Management**: Simpler but doesn't enforce domain invariants at compile time
3. **Database Foreign Key Cascade**: Would enforce at DB level but not at application level, harder to test

## Implementation Notes

### Key Code Patterns

**Creating a new tenant with owner:**
```typescript
const tenant = new Tenant(user, 'Workspace Name');
em.persist(tenant); // membership auto-cascades
```

**Adding members to existing tenant:**
```typescript
await em.findOneOrFail(Tenant, { id: tenantId });
tenant.addMembership(user, 'member');
await em.flush(); // cascade handles persistence
```

**Creating subtenants:**
```typescript
const parent = await em.findOneOrFail(Tenant, { id: parentId }, { populate: ['members', 'members.user'] });
const child = parent.createSubtenant('Child Name');
em.persist(child); // child.members already populated with parent members
```

### Migration Path

1. Updated `Tenant.ts` — added constructor, renamed `addMember` → `addMembership`, updated `createSubtenant`
2. Updated `Tenant.schema.ts` — added cascade configuration
3. Updated `User.create()` factory — use new Tenant constructor
4. Updated `UserManagementService` — use `addMembership`, remove direct TenantMembership creation
5. Updated `TenantManagementService` — populate parent members for subtenant creation
6. Updated tests — fix persist count expectations, populate parent members in fixtures

All 381 tests pass after refactoring.

## References

- Domain-Driven Design: Aggregates — Eric Evans
- MikroORM Entity References and Cascading — https://mikro-orm.io/docs/cascading
- Related: `User.create()` factory pattern (established 2026-02-27)
