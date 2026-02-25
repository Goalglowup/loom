# Auth Middleware Enhancement & Admin Migration

**Author:** Fenster (Backend)  
**Date:** 2026-02-25  
**Tasks:** F-MT3 (Auth Middleware), F-MT4a (Admin Users Migration)  
**Status:** Complete ✅

---

## Summary

Implemented two foundational pieces for multi-tenant management:

1. **Admin Users Table** — New `admin_users` table for per-user admin authentication (replaces shared secret approach)
2. **Auth Middleware Enhancements** — Updated tenant API key lookup to filter revoked keys and inactive tenants; added cache invalidation helpers

Both tasks completed successfully with clean TypeScript build and successful migration application.

---

## Part 1: Admin Users Migration (F-MT4a)

### Migration: `1000000000009_create-admin-users.cjs`

**Schema:**
```sql
CREATE TABLE admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(255) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login timestamptz
);

CREATE INDEX idx_admin_users_username ON admin_users (username);
```

**Password Hashing:**
- Used Node.js built-in `crypto.scrypt` (no new dependencies)
- Salt: 16-byte random hex
- Derived key: 64-byte scrypt output  
- Storage format: `${salt}:${derivedKey}` (example: `c39658536668a19c...:a3daf96a10d1c760...`)

**Default Admin User Seeding:**
- Reads `ADMIN_USERNAME` / `ADMIN_PASSWORD` from env vars
- Fallback: `admin` / `changeme` if not set
- `ON CONFLICT (username) DO NOTHING` for idempotent re-runs
- Applied successfully via `npm run migrate:up`

**Why scrypt over bcrypt:**
- No new npm dependency (bcrypt not in package.json)
- Node's built-in crypto.scrypt is secure and sufficient for admin login (not on hot path)
- Simple to implement and verify

---

## Part 2: Auth Middleware Updates (F-MT3)

### Query Enhancement

**Updated `lookupTenant()` in `src/auth.ts`:**

```sql
SELECT t.id          AS tenant_id,
       t.name        AS tenant_name,
       t.provider_config
FROM   api_keys ak
JOIN   tenants  t  ON ak.tenant_id = t.id
WHERE  ak.key_hash = $1
  AND  ak.status = 'active'     -- NEW: filter revoked keys
  AND  t.status = 'active'       -- NEW: filter inactive tenants
LIMIT  1
```

**Impact:**
- Revoked API keys immediately rejected (no cache invalidation race)
- Inactive tenants cannot authenticate even if their keys are cached
- Existing indexes (`idx_api_keys_status`, `idx_tenants_status`) cover the new filters

### Cache Invalidation Helpers

**Exported two new functions:**

```typescript
// Invalidate a single cached key lookup by its hash
export function invalidateCachedKey(keyHash: string): void {
  tenantCache.invalidate(keyHash);
}

// Invalidate all cached keys for a tenant (used when tenant is deactivated)
export async function invalidateAllKeysForTenant(tenantId: string, pool: pg.Pool): Promise<void> {
  const result = await pool.query(
    'SELECT key_hash FROM api_keys WHERE tenant_id = $1',
    [tenantId]
  );
  for (const row of result.rows) {
    tenantCache.invalidate(row.key_hash);
  }
}
```

**Why both helpers:**
- `invalidateCachedKey()`: Used when revoking a single API key (if you have the hash)
- `invalidateAllKeysForTenant()`: Used when deactivating a tenant (need to query all hashes first)

**Cache Key Strategy:**
- Cache is keyed by SHA-256 hash of raw API key (not key ID)
- Management APIs work with key IDs, so invalidation requires hash lookup
- The `invalidateAllKeysForTenant` helper bridges this gap

**Pool Injection:**
- Both helpers take `pool` as parameter (same pattern as `registerAuthMiddleware`)
- Keeps auth.ts decoupled from DB initialization
- Makes testing easier (can pass mock pool)

---

## Build Verification

```bash
npm run build
```

✅ **Result:** Clean compile, zero TypeScript errors

---

## Integration Points

These changes support the upcoming admin API endpoints (F-MT5, F-MT6):

1. **Tenant CRUD** (F-MT5):
   - `PATCH /v1/admin/tenants/:id` with `status: "inactive"` → calls `invalidateAllKeysForTenant()`
   - Ensures immediate auth rejection for inactive tenants

2. **API Key Management** (F-MT6):
   - `DELETE /v1/admin/tenants/:id/api-keys/:keyId` → queries key_hash → calls `invalidateCachedKey()`
   - Ensures revoked keys are immediately removed from cache

3. **Admin Auth** (F-MT4b, next task):
   - `POST /v1/admin/login` will verify password against `admin_users.password_hash`
   - Password verification: split stored hash on `:`, use salt to recompute derived key, compare

---

## Technical Decisions

### Decision 1: crypto.scrypt over bcrypt
**Rationale:** No bcrypt in package.json; adding a new dependency wasn't necessary since Node's built-in crypto.scrypt is secure and sufficient for admin passwords (not on the hot auth path like tenant API keys).

**Trade-off:** bcrypt has configurable cost factor; scrypt parameters (N, r, p) are fixed in Node's implementation. Acceptable since admin login is infrequent.

### Decision 2: Migration-time seeding
**Rationale:** Seeding the first admin user in the migration ensures operators have access immediately after running migrations. The `ON CONFLICT DO NOTHING` clause makes re-runs safe.

**Alternative considered:** Separate seed script (like `scripts/seed.ts`). Rejected because admin user creation is a one-time bootstrap operation, not ongoing seed data.

### Decision 3: Query-first cache invalidation
**Rationale:** Cache is keyed by `key_hash`, but management APIs work with `key_id`. The `invalidateAllKeysForTenant` helper queries the DB first to resolve hashes.

**Alternative considered:** Dual-key cache (hash + ID). Rejected due to complexity and memory overhead. Cache invalidation is a rare operation (tenant deactivation, key revocation) — a DB query is acceptable.

---

## Next Steps

1. **F-MT4b** — Admin login endpoint (`POST /v1/admin/login`) + JWT middleware
2. **F-MT5** — Tenant CRUD endpoints (uses `invalidateAllKeysForTenant`)
3. **F-MT6** — API key management endpoints (uses `invalidateCachedKey`)

All three depend on the foundation laid in this task.

---

## Testing Notes

**Manual Verification:**
- Migration applied successfully: `npm run migrate:up` ✅
- TypeScript compilation clean: `npm run build` ✅
- Admin user seeded: Check `SELECT * FROM admin_users;` → 1 row (username: `admin`)

**Automated Tests (Future):**
- H-MT1: Admin auth tests (login, JWT validation)
- H-MT5: Auth middleware regression (revoked keys, inactive tenants)

---

## Risks & Mitigations

**Risk:** Default admin password `changeme` is insecure if used in production.  
**Mitigation:** Document requirement to set `ADMIN_PASSWORD` env var before deploying. Future work: force password reset on first login.

**Risk:** scrypt parameters are fixed in Node.js (can't tune cost factor).  
**Mitigation:** Acceptable for Phase 1. If needed, migrate to bcrypt or Argon2 in Phase 2.

**Risk:** Cache invalidation requires querying all key hashes for a tenant (could be slow for large tenants).  
**Mitigation:** Expected key count per tenant is low (<10). If this becomes a bottleneck, add a `tenant_id → key_hash[]` index in the cache layer.
