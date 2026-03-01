# Decision: Tenant Constructor — Required Parameters

**Date:** 2025  
**Author:** Fenster (Backend Dev)  
**Requested by:** Michael Brown  

## Decision

Changed `Tenant` constructor from optional to required parameters:

```typescript
// Before
constructor(owner?: User, name?: string) {
  if (owner !== undefined && name !== undefined) {
    // init only sometimes
  }
}

// After
constructor(owner: User, name: string) {
  this.id = randomUUID();
  this.name = name;
  // ... always runs full init
  this.addMembership(owner, 'owner');
}
```

## Rationale

- **Type safety**: `new Tenant()` with no args is now a TypeScript compile error, preventing accidental construction of uninitialized Tenant objects.
- **MikroORM compatibility**: MikroORM hydrates entities via `Object.create(Entity.prototype)` — it never invokes the constructor. Required params are therefore safe and impose no ORM cost.
- **Invariant enforcement**: The constructor always sets all fields and creates the owner membership. No partial-init path exists.

## Callsites Updated

| Location | Change |
|---|---|
| `src/domain/entities/Tenant.ts#createSubtenant` | `new Tenant()` → `Object.assign(Object.create(Tenant.prototype), {...})` |
| `tests/domain-entities.test.ts` (×2) | `new Tenant()` → `Object.assign(Object.create(Tenant.prototype), {...})` |
| `tests/application-services.test.ts#makeTenant` | `new Tenant()` → `Object.assign(Object.create(Tenant.prototype), {...})` |

`User.create()` in `src/domain/entities/User.ts` already passed both args — no change needed.

## Fixture Pattern

For test fixtures and internal factory methods that need a bare Tenant without owner-membership side effects:

```typescript
const t = Object.assign(Object.create(Tenant.prototype) as Tenant, {
  id: 'tenant-1',
  name: 'Test Tenant',
  parentId: null,
  // ... remaining fields
});
```

## Outcome

- `npx tsc --noEmit` — clean, no errors
- `npm test` — 381/381 tests pass
