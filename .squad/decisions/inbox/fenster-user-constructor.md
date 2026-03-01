# Decision: Convert User.create() to Constructor

**Date:** 2025  
**Author:** Fenster (Backend Dev)  
**Status:** Implemented

## Context

`User` had a static factory method `User.create(email, passwordHash, tenantName?)` that returned `{ user, tenant }`. This was inconsistent with `Tenant`, which already used a proper constructor. The task was to align `User` with the established `Tenant` pattern.

## Decision

Replace `static create()` with `constructor(email: string, passwordHash: string, tenantName?: string)`.

## Consequences

### Transient property for auto-created Tenant
A constructor cannot return `{ user, tenant }`. To preserve the ability for callers to persist the auto-created `Tenant`, it is stored as a transient in-memory property `user.tenant`. This property is undefined after ORM hydration (MikroORM uses `Object.create(User.prototype)` — the constructor is never called on the ORM path).

### Schema declaration required
MikroORM's `EntitySchema<User>` type requires all class properties to be declared. `tenant` was added to `User.schema.ts` with `persist: false, nullable: true` to satisfy the type without creating any DB column.

### Test fixture pattern
Test helpers that need a mock `User` without running constructor logic must use:
```typescript
Object.assign(Object.create(User.prototype) as User, { id: '...', email: '...', ... })
```
This is the same pattern already used for `Tenant` in `makeTenant()`.

## Caller pattern after change

```typescript
const user = new User(email, passwordHash, tenantName);
const tenant = user.tenant!;
em.persist(user);
em.persist(tenant);
await em.flush();
```
