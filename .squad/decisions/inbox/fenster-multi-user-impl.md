# Fenster Implementation Decisions — Multi-User Multi-Tenant

**Author:** Fenster (Backend Dev)  
**Date:** 2026-02-26  
**Related spec:** `.squad/decisions/inbox/keaton-multi-user-tenant-arch.md`

---

## Decision 1: `inviteToken` branch silently ignores `tenantName`

**Context:** The spec says "When inviteToken is present, tenantName is ignored." The body type was widened to make `tenantName` optional (`tenantName?: string`).

**Decision:** No error is returned if `tenantName` is supplied alongside `inviteToken`. It is simply unused. This is the least-friction path for frontend clients that might always send all fields.

---

## Decision 2: Existing user joining via invite does NOT re-hash password

**Context:** When an existing user joins a second tenant via invite (email already exists in `users`), the invite flow skips password hashing entirely. The supplied password is not used at all.

**Decision:** The existing user's credentials are untouched. This is correct: the user already has an account. The signup-via-invite path for existing users is essentially "add membership to my existing account." The password field in that case is superfluous — the frontend should ideally show a login form instead of a signup form for existing emails, but that's a McManus concern.

---

## Decision 3: Login returns 403 (not 401) for zero active memberships

**Context:** A user could theoretically exist in `users` with no active tenant memberships (e.g., all their tenants were deleted). The spec doesn't specify this edge case explicitly.

**Decision:** Return 403 with `{ error: 'No active tenant memberships' }` rather than 401. Authentication succeeded; the user simply has no accessible tenants. This is an authorization failure, not an authentication failure.

---

## Decision 4: `PORTAL_BASE_URL` declared inside `registerPortalRoutes`

**Context:** The spec calls for `PORTAL_BASE_URL` from env, defaulting to `http://localhost:3000`.

**Decision:** Read `process.env.PORTAL_BASE_URL` inside the function body rather than at module scope. This ensures the value is captured after any `.env` file loading that happens before routes are registered, and allows test overrides without module re-imports.

---

## Decision 5: Soft-revoke only for invites

**Context:** Spec says `DELETE /v1/portal/invites/:id` sets `revoked_at = now()`.

**Decision:** Implemented exactly as spec. Hard-delete was not used because preserving revoked invites maintains an audit trail (who created, when revoked). The `isActive` computed field in `GET /v1/portal/invites` correctly reflects revoked status.

---

## Decision 6: `GET /v1/portal/invites/:token/info` — 404 for unknown token, `isValid: false` for expired/revoked

**Context:** Spec says "Always returns `isValid: false` (not 404) for expired/revoked/exhausted tokens — prevents token enumeration."

**Decision:** Implemented exactly per spec. Unknown token → 404. Known token but invalid (expired/revoked/exhausted/tenant inactive) → 200 with `isValid: false`. The 404 response for unknown tokens does technically leak that the token doesn't exist, but this is unavoidable without a Bloom filter or similar structure; the 32-byte random entropy makes brute-force infeasible regardless.

---

## Decision 7: No `SELECT ... FOR UPDATE` on last-owner checks

**Context:** Spec notes a risk of race condition on last-owner count check.

**Decision:** Deferred to Phase 2 per spec. The missing FOR UPDATE means two concurrent requests could both read "2 owners" and both proceed to demote, leaving zero owners. Acceptable for initial release; can be fixed with `SELECT COUNT(*) ... FOR UPDATE` inside a transaction.

---

## Decision 8: Migration preserves `tenant_users.id` as `users.id`

**Context:** Need to avoid FK violations if any other tables reference `tenant_users.id`. Spec notes "audit reveals no other tables reference `tenant_users`."

**Decision:** Confirmed by grep: no other tables have FK references to `tenant_users`. The IDs are preserved verbatim in the migration INSERT, ensuring any existing JWTs (which embed `userId` = the old `tenant_users.id`) remain valid immediately after migration without requiring token refresh.
