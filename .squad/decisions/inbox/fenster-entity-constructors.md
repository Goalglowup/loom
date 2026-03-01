# Decision: Domain Entity Required-Param Constructors

**Author:** Fenster  
**Date:** 2026-xx-xx  
**Status:** Proposed

## Decision

All domain entities (Agent, Invite, TenantMembership, ApiKey) now have required-param constructors. No bare `new Entity()` in production code — all construction goes through factory methods (Tenant.createAgent, etc.) or constructors directly. Tests use `Object.assign(Object.create(Entity.prototype), {...})` for fixtures.

## Rationale

- Moves initialization logic out of aggregate factory methods and into entity constructors, following DDD principles already established for `User` and `Tenant`.
- MikroORM uses `Object.create(Entity.prototype)` for hydration — it never calls constructors — so required-param constructors are safe.
- Aggregate factory methods (`Tenant.createAgent`, `Tenant.createInvite`, `Tenant.addMembership`) become thin wrappers: construct entity, push to collection, return it.
- `ApiKey.rawKey` is a `readonly` non-persistent property available immediately after construction, keeping raw secret material out of the DB.

## Impact

- `src/domain/entities/Agent.ts`, `ApiKey.ts`, `Invite.ts`, `TenantMembership.ts` — constructors added.
- `src/domain/entities/Tenant.ts` — factory methods slimmed down; `randomBytes` import removed.
- `tests/domain-entities.test.ts`, `tests/application-services.test.ts` — bare `new Entity()` fixture patterns replaced with `Object.assign(Object.create(Entity.prototype), {...})`.
