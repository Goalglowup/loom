# User.memberships Collection

**Date:** 2025-01-27  
**Author:** Fenster (Backend Dev)  
**Status:** Implemented

## Decision

Added a `memberships` collection property to the `User` entity, enabling bi-directional navigation between users and their tenant memberships via MikroORM.

## Implementation

- **Entity:** `User.memberships = new Collection<TenantMembership>(this)`
- **Schema:** `memberships: { kind: '1:m', entity: () => TenantMembership, mappedBy: 'user', eager: false }`
- **Import strategy:** Type-only import of `TenantMembership` in `User.ts` to avoid circular dependencies

## Rationale

- The owning side (`TenantMembership.user`) already existed with the `user_id` foreign key
- This adds the inverse side, allowing code to navigate from a User to all their memberships
- No database migration required — this is purely an ORM-level relationship mapping
- Follows standard MikroORM 1:m pattern with `mappedBy` pointing to the owning side
- Lazy loading (`eager: false`) keeps query performance predictable

## Impact

- Enables queries like `user.memberships.loadItems()` to fetch all tenants a user belongs to
- No breaking changes — purely additive
- All existing tests pass (381 tests)
