# Multi-User Multi-Tenant Architecture

**Author:** Keaton (Lead)  
**Date:** 2026-02-26  
**Status:** Proposed — awaiting Michael Brown approval  
**Requested by:** Michael Brown  
**Scope:** Multiple users per org/tenant via invite links; users can belong to multiple tenants

---

## 1. Problem Statement

Current model: `tenant_users` table enforces 1:1 user↔tenant (email is `UNIQUE`). A user signs up, creates a tenant, and can never belong to another. Org owners cannot invite collaborators.

**Required:**
1. Org owner creates invite links → other users sign up or join under that invite
2. A single user (email) can belong to multiple tenants
3. Users can switch between their tenants in the portal UI

---

## 2. Schema Changes

### 2.1 New `users` Table (Auth Identity)

Separates authentication identity from tenant membership. Email is the unique auth key.

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login    TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users (email);
```

### 2.2 New `tenant_memberships` Junction Table

Replaces the 1:1 `tenant_users` table. One user can have multiple memberships.

```sql
CREATE TABLE tenant_memberships (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role       VARCHAR(50) NOT NULL DEFAULT 'member',
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

CREATE INDEX idx_tenant_memberships_user_id   ON tenant_memberships (user_id);
CREATE INDEX idx_tenant_memberships_tenant_id ON tenant_memberships (tenant_id);
```

**Roles:** `owner` | `member`
- **owner:** manage invites, manage members, manage settings, manage API keys, view traces/analytics
- **member:** view traces/analytics (read-only)

This maps cleanly to the existing `ownerRequired` vs `authRequired` preHandler pattern in portal routes.

### 2.3 New `invites` Table

```sql
CREATE TABLE invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token       VARCHAR(64) NOT NULL UNIQUE,
  created_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_uses    INTEGER,          -- NULL = unlimited
  use_count   INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,      -- NULL = active; set = revoked
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invites_token     ON invites (token);
CREATE INDEX idx_invites_tenant_id ON invites (tenant_id);
```

**Invite token format:** 32 bytes, base64url-encoded (43 chars). Generated via `crypto.randomBytes(32).toString('base64url')`.

**Invite link URL:** `{PORTAL_BASE_URL}/signup?invite={token}`

**Invite validity check:**
```sql
SELECT i.*, t.name AS tenant_name
FROM invites i
JOIN tenants t ON i.tenant_id = t.id
WHERE i.token = $1
  AND i.revoked_at IS NULL
  AND i.expires_at > now()
  AND (i.max_uses IS NULL OR i.use_count < i.max_uses)
  AND t.status = 'active'
```

### 2.4 Drop `tenant_users` Table

The old `tenant_users` table is fully replaced by `users` + `tenant_memberships`. Data migrated before drop (see §6).

---

## 3. JWT Strategy

### Decision: Keep `tenantId` in JWT, Switch via New Token

**Current JWT payload:** `{ sub: userId, tenantId: string, role: string }`  
**New JWT payload:** `{ sub: userId, tenantId: string, role: string }` — **identical structure**

**Rationale:** Every existing portal route reads `request.portalUser.tenantId` from the JWT. Keeping `tenantId` in the JWT means zero changes to middleware (`portalAuth.ts`) and zero changes to any existing route handler. The multi-tenant capability is additive.

**How switching works:**
1. Login returns `tenants[]` alongside the JWT (JWT issued for the first/default tenant)
2. Frontend stores the tenants list in memory/state
3. User clicks a different tenant in the switcher
4. Frontend calls `POST /v1/portal/auth/switch-tenant { tenantId }` 
5. Backend validates membership, issues a new JWT with the new `tenantId`
6. Frontend replaces the stored token and refreshes data

**Login query changes:**
```sql
-- Step 1: Authenticate user (get from users table)
SELECT u.id, u.email, u.password_hash
FROM users u
WHERE u.email = $1;

-- Step 2: Get all tenant memberships
SELECT tm.tenant_id, tm.role, t.name AS tenant_name, t.status
FROM tenant_memberships tm
JOIN tenants t ON tm.tenant_id = t.id
WHERE tm.user_id = $1
  AND t.status = 'active'
ORDER BY tm.joined_at ASC;
```

JWT is signed for the first active membership (or a `defaultTenantId` if we add that later).

---

## 4. API Endpoints

### 4.1 Modified Existing Endpoints

#### `POST /v1/portal/auth/signup`

**Body (without invite):** `{ tenantName, email, password }` — existing behavior, creates tenant + user + membership(role=owner) + API key.

**Body (with invite):** `{ email, password, inviteToken }` — new flow:
1. Validate invite token (active, not expired, uses remaining, tenant active)
2. Check if user with email already exists:
   - **Exists:** Check they don't already have membership in this tenant → add membership
   - **New:** Create user → add membership
3. Increment `invites.use_count`
4. Membership role = `member` (invited users start as members)
5. Sign JWT for the invite's tenant
6. Return `{ token, user, tenant }` (no apiKey — invited members don't need gateway keys)

**Note:** When `inviteToken` is present, `tenantName` is ignored (tenant already exists).

#### `POST /v1/portal/auth/login`

**Response changes:**
```typescript
{
  token: string;          // JWT for default tenant
  user: { id, email };
  tenant: { id, name };   // Current/default tenant
  tenants: Array<{        // NEW: all memberships
    id: string;
    name: string;
    role: string;
  }>;
}
```

**Behavior:** If user has multiple memberships, JWT is issued for the first active one. Frontend receives the full list for the tenant switcher.

#### `GET /v1/portal/me`

**Response changes:**
```typescript
{
  user: { id, email, role };
  tenant: { id, name, providerConfig };
  tenants: Array<{        // NEW: all memberships
    id: string;
    name: string;
    role: string;
  }>;
}
```

### 4.2 New Auth Endpoint

#### `POST /v1/portal/auth/switch-tenant`

**Auth:** Required (Bearer token)  
**Body:** `{ tenantId: string }`  
**Behavior:**
1. Extract `userId` from current JWT
2. Validate membership: `SELECT role FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2`
3. Validate tenant is active
4. Sign new JWT with `{ sub: userId, tenantId, role }`
5. Return same shape as login: `{ token, user, tenant, tenants }`

**Errors:**
- 400: Missing tenantId
- 403: No membership in requested tenant
- 403: Tenant inactive

### 4.3 New Invite Endpoints

#### `POST /v1/portal/invites`

**Auth:** Owner required  
**Body:**
```typescript
{
  maxUses?: number;         // null/omitted = unlimited
  expiresInHours?: number;  // default: 168 (7 days)
}
```
**Response (201):**
```typescript
{
  id: string;
  token: string;
  inviteUrl: string;        // Full URL: {PORTAL_BASE_URL}/signup?invite={token}
  maxUses: number | null;
  useCount: number;
  expiresAt: string;        // ISO 8601
  createdAt: string;
}
```
**Implementation:** Token = `crypto.randomBytes(32).toString('base64url')`. `PORTAL_BASE_URL` from env (default: `http://localhost:3000`).

#### `GET /v1/portal/invites`

**Auth:** Owner required  
**Response:**
```typescript
{
  invites: Array<{
    id: string;
    token: string;
    inviteUrl: string;
    maxUses: number | null;
    useCount: number;
    expiresAt: string;
    revokedAt: string | null;
    createdAt: string;
    createdBy: { id: string; email: string };
    isActive: boolean;       // computed: not revoked, not expired, uses remaining
  }>;
}
```

#### `DELETE /v1/portal/invites/:id`

**Auth:** Owner required  
**Behavior:** Sets `revoked_at = now()`. Soft revoke only.  
**Response:** 204

#### `GET /v1/portal/invites/:token/info` (Public — No Auth)

**Purpose:** Signup page with invite token calls this to show "Join {tenantName}" UI.  
**Response:**
```typescript
{
  tenantName: string;
  expiresAt: string;
  isValid: boolean;          // not expired, not revoked, uses remaining
}
```
**Errors:** 404 if token doesn't exist. Always returns `isValid: false` (not 404) for expired/revoked/exhausted tokens — prevents token enumeration.

### 4.4 New Member Management Endpoints

#### `GET /v1/portal/members`

**Auth:** Required (any role can view member list)  
**Response:**
```typescript
{
  members: Array<{
    id: string;             // user id
    email: string;
    role: string;
    joinedAt: string;
    lastLogin: string | null;
  }>;
}
```

#### `PATCH /v1/portal/members/:userId`

**Auth:** Owner required  
**Body:** `{ role: 'owner' | 'member' }`  
**Constraints:**
- Cannot demote self if you're the last owner (ensures at least one owner)
- Query: `SELECT COUNT(*) FROM tenant_memberships WHERE tenant_id = $1 AND role = 'owner'`
**Response:** `{ id, email, role, joinedAt }`

#### `DELETE /v1/portal/members/:userId`

**Auth:** Owner required  
**Constraints:**
- Cannot remove self (use "Leave tenant" instead, §4.5)
- Cannot remove if target is last owner
**Behavior:** Deletes `tenant_memberships` row. Does NOT delete the `users` row (user still exists, may belong to other tenants).  
**Response:** 204

### 4.5 New Tenant List / Leave Endpoint

#### `GET /v1/portal/tenants`

**Auth:** Required  
**Response:**
```typescript
{
  tenants: Array<{
    id: string;
    name: string;
    role: string;           // user's role in this tenant
    joinedAt: string;
  }>;
}
```

#### `POST /v1/portal/tenants/:tenantId/leave`

**Auth:** Required  
**Constraints:**
- Cannot leave if you're the last owner (must transfer ownership first)
- Cannot leave current active tenant (switch first)
**Behavior:** Deletes membership row.  
**Response:** 204

---

## 5. Frontend Changes

### 5.1 Tenant Switcher (AppLayout Sidebar)

**Location:** Below "⧖ Loom" branding in sidebar, replace static tenant name.

**Component: `TenantSwitcher`**
- Dropdown showing current tenant name
- List of all tenants from `tenants[]` (returned by login/me)
- Click triggers `POST /v1/portal/auth/switch-tenant`
- On success: replace token in localStorage, refresh app data
- Visual indicator for current tenant (checkmark)
- If only 1 tenant: show name as static text (no dropdown)

### 5.2 Modified Signup Flow

**Route:** `/signup?invite={token}`

**Behavior when `invite` query param present:**
1. Call `GET /v1/portal/invites/:token/info` on mount
2. If valid: show "Join {tenantName}" form (email + password only, no org name field)
3. If invalid/expired: show error message with link to regular signup
4. Submit calls `POST /v1/portal/auth/signup` with `{ email, password, inviteToken }`
5. On success: skip API key reveal (invited members don't get one), navigate to `/app`

**Behavior when no invite param:** Existing signup flow unchanged.

### 5.3 Members & Invites Page

**Route:** `/app/members` (new nav item in sidebar, between API Keys and Settings or standalone)

**Sections:**

**A. Members List (visible to all roles)**
- Table: Email, Role (badge), Joined, Last Login
- Owner actions per member: Change Role dropdown, Remove button
- Self row highlighted, no self-remove (show "Leave" button in separate area)

**B. Invite Management (owner only)**
- "Create Invite Link" button → modal:
  - Optional: max uses (number input, blank = unlimited)
  - Optional: expiry (dropdown: 1 day, 7 days, 30 days — default 7 days)
  - On create: show invite URL with copy button
- Active invites list: token (truncated), uses (X/Y or X/∞), expires, created by, Revoke button
- Revoked/expired invites shown grayed out

### 5.4 Nav Updates

Add to `AppLayout` sidebar nav:
```tsx
<NavLink to="/app/members" className={navLinkClass}>
  👥 <span>Members</span>
</NavLink>
```

### 5.5 Portal API Client Updates (`portal/src/lib/api.ts`)

New methods:
```typescript
export const api = {
  // ... existing methods ...

  // Auth
  switchTenant: (token: string, body: { tenantId: string }) =>
    request<LoginResponse>('POST', '/v1/portal/auth/switch-tenant', body, token),

  // Invites
  getInviteInfo: (token: string) =>
    request<InviteInfo>('GET', `/v1/portal/invites/${token}/info`),
  listInvites: (token: string) =>
    request<{ invites: Invite[] }>('GET', '/v1/portal/invites', undefined, token),
  createInvite: (token: string, body: { maxUses?: number; expiresInHours?: number }) =>
    request<Invite>('POST', '/v1/portal/invites', body, token),
  revokeInvite: (token: string, id: string) =>
    request<void>('DELETE', `/v1/portal/invites/${id}`, undefined, token),

  // Members
  listMembers: (token: string) =>
    request<{ members: Member[] }>('GET', '/v1/portal/members', undefined, token),
  updateMemberRole: (token: string, userId: string, body: { role: string }) =>
    request<Member>('PATCH', `/v1/portal/members/${userId}`, body, token),
  removeMember: (token: string, userId: string) =>
    request<void>('DELETE', `/v1/portal/members/${userId}`, undefined, token),

  // Tenants
  listTenants: (token: string) =>
    request<{ tenants: TenantMembership[] }>('GET', '/v1/portal/tenants', undefined, token),
  leaveTenant: (token: string, tenantId: string) =>
    request<void>('POST', `/v1/portal/tenants/${tenantId}/leave`, undefined, token),
};
```

---

## 6. Migration Strategy

### Migration: `1000000000011_multi_tenant_users.cjs`

Single migration with transactional steps:

```javascript
exports.up = (pgm) => {
  // Step 1: Create users table
  pgm.createTable('users', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email:         { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    created_at:    { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_login:    { type: 'timestamptz' },
  });
  pgm.createIndex('users', 'email');

  // Step 2: Migrate auth identity data from tenant_users → users
  // Uses existing tenant_users.id as users.id to preserve referential integrity
  pgm.sql(`
    INSERT INTO users (id, email, password_hash, created_at, last_login)
    SELECT id, email, password_hash, created_at, last_login
    FROM tenant_users
  `);

  // Step 3: Create tenant_memberships junction table
  pgm.createTable('tenant_memberships', {
    id:        { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id:   { type: 'uuid', notNull: true, references: '"users"', onDelete: 'CASCADE' },
    tenant_id: { type: 'uuid', notNull: true, references: '"tenants"', onDelete: 'CASCADE' },
    role:      { type: 'varchar(50)', notNull: true, default: "'member'" },
    joined_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('tenant_memberships', 'uq_tenant_memberships_user_tenant', {
    unique: ['user_id', 'tenant_id'],
  });
  pgm.createIndex('tenant_memberships', 'user_id');
  pgm.createIndex('tenant_memberships', 'tenant_id');

  // Step 4: Migrate tenant relationships (all existing users are owners)
  pgm.sql(`
    INSERT INTO tenant_memberships (user_id, tenant_id, role, joined_at)
    SELECT id, tenant_id, role, created_at
    FROM tenant_users
  `);

  // Step 5: Create invites table
  pgm.createTable('invites', {
    id:         { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:  { type: 'uuid', notNull: true, references: '"tenants"', onDelete: 'CASCADE' },
    token:      { type: 'varchar(64)', notNull: true, unique: true },
    created_by: { type: 'uuid', notNull: true, references: '"users"', onDelete: 'CASCADE' },
    max_uses:   { type: 'integer' },
    use_count:  { type: 'integer', notNull: true, default: 0 },
    expires_at: { type: 'timestamptz', notNull: true },
    revoked_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('invites', 'token');
  pgm.createIndex('invites', 'tenant_id');

  // Step 6: Drop old table
  pgm.dropTable('tenant_users');
};

exports.down = (pgm) => {
  // Recreate tenant_users from users + tenant_memberships
  pgm.createTable('tenant_users', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:     { type: 'uuid', notNull: true, references: '"tenants"', onDelete: 'CASCADE' },
    email:         { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    role:          { type: 'varchar(50)', notNull: true, default: "'owner'" },
    created_at:    { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_login:    { type: 'timestamptz' },
  });
  pgm.createIndex('tenant_users', 'tenant_id');
  pgm.createIndex('tenant_users', 'email');

  // Best-effort data restoration (takes first membership per user)
  pgm.sql(`
    INSERT INTO tenant_users (id, tenant_id, email, password_hash, role, created_at, last_login)
    SELECT DISTINCT ON (u.id) u.id, tm.tenant_id, u.email, u.password_hash, tm.role, u.created_at, u.last_login
    FROM users u
    JOIN tenant_memberships tm ON tm.user_id = u.id
    ORDER BY u.id, tm.joined_at ASC
  `);

  pgm.dropTable('invites');
  pgm.dropTable('tenant_memberships');
  pgm.dropTable('users');
};
```

### Existing Data Defaults

| Old Row | New State |
|---------|-----------|
| Each `tenant_users` row | → `users` row (same id, email, password_hash) |
| Each `tenant_users` row | → `tenant_memberships` row (user_id=id, tenant_id, role preserved) |
| All existing users | Remain `owner` of their current tenant |
| No invites exist | `invites` table starts empty |

### Data Integrity Notes

- `tenant_users.id` is reused as `users.id` — any other FKs pointing to `tenant_users.id` will need updating. Audit reveals: no other tables reference `tenant_users`.
- Email uniqueness preserved (moves from `tenant_users.email UNIQUE` to `users.email UNIQUE`).
- Tenant cascade deletes preserved via `tenant_memberships.tenant_id ON DELETE CASCADE`.

---

## 7. Backend Code Changes

### 7.1 Portal Auth Middleware (`src/middleware/portalAuth.ts`)

**No changes needed.** JWT payload structure is identical. Middleware continues to extract `{ userId, tenantId, role }` from the token.

### 7.2 Portal Routes (`src/routes/portal.ts`)

**Modified functions:**

1. **`signup`** — Add `inviteToken` optional body field. Branch logic:
   - Without invite: existing flow but INSERT into `users` + `tenant_memberships` instead of `tenant_users`
   - With invite: validate invite → create/find user → insert membership → increment use_count → sign JWT

2. **`login`** — Query `users` table for auth, then `tenant_memberships` for all active tenants. Return `tenants[]` in response. JWT for first membership.

3. **`/me`** — Query `users` JOIN `tenant_memberships` for current, plus separate query for all memberships. Return `tenants[]`.

**New route registrations:**
- `POST /v1/portal/auth/switch-tenant`
- `GET /v1/portal/invites/:token/info` (no auth)
- `POST /v1/portal/invites` (owner)
- `GET /v1/portal/invites` (owner)
- `DELETE /v1/portal/invites/:id` (owner)
- `GET /v1/portal/members` (auth)
- `PATCH /v1/portal/members/:userId` (owner)
- `DELETE /v1/portal/members/:userId` (owner)
- `GET /v1/portal/tenants` (auth)
- `POST /v1/portal/tenants/:tenantId/leave` (auth)

### 7.3 Auth Skip List

Add `/v1/portal/invites/` prefix to the public route skip list (for the `GET .../info` endpoint). The invite info endpoint must be accessible without authentication so the signup page can display tenant name.

---

## 8. Work Breakdown

### Backend (Fenster) — 7 Tasks

| ID | Task | Dependencies | Wave |
|----|------|-------------|------|
| F-MU1 | Migration 1000000000011 (users, tenant_memberships, invites tables + data migration) | None | A |
| F-MU2 | Update signup endpoint (inviteToken branch, users/memberships tables) | F-MU1 | B |
| F-MU3 | Update login endpoint (multi-tenant response, users table query) | F-MU1 | B |
| F-MU4 | Switch-tenant endpoint + update /me endpoint | F-MU1 | B |
| F-MU5 | Invite CRUD endpoints (create, list, revoke, public info) | F-MU1 | B |
| F-MU6 | Member management endpoints (list, update role, remove) | F-MU1 | B |
| F-MU7 | Tenant list + leave endpoint | F-MU1 | B |

### Frontend (McManus) — 6 Tasks

| ID | Task | Dependencies | Wave |
|----|------|-------------|------|
| M-MU1 | API client updates (new methods, new types) | F-MU2–F-MU7 | C |
| M-MU2 | Tenant switcher component in AppLayout sidebar | M-MU1, F-MU4 | C |
| M-MU3 | Members & invites page (`/app/members`) | M-MU1, F-MU5, F-MU6 | C |
| M-MU4 | Modified signup flow (invite token from URL) | M-MU1, F-MU2, F-MU5 | C |
| M-MU5 | Nav updates (Members link, role-based visibility) | M-MU3 | D |
| M-MU6 | App state management for tenant switching (token refresh, data reload) | M-MU2 | D |

### Testing (Hockney) — 5 Tasks

| ID | Task | Dependencies | Wave |
|----|------|-------------|------|
| H-MU1 | Migration validation tests (data integrity after migration) | F-MU1 | B |
| H-MU2 | Multi-tenant auth tests (login with multiple memberships, switch-tenant) | F-MU3, F-MU4 | C |
| H-MU3 | Invite flow tests (create, accept, revoke, expiry, max uses) | F-MU5 | C |
| H-MU4 | Member management tests (role changes, removal constraints, last-owner guard) | F-MU6 | C |
| H-MU5 | Signup-via-invite tests (new user, existing user joining second tenant) | F-MU2 | C |

### Execution Waves

**Wave A** (Foundation): F-MU1 — Schema migration. All other work blocked on this.

**Wave B** (Backend): F-MU2 through F-MU7 + H-MU1 — All backend endpoints + migration validation. Can run in parallel.

**Wave C** (Integration): M-MU1 through M-MU4 + H-MU2 through H-MU5 — Frontend + integration tests. Can run in parallel.

**Wave D** (Polish): M-MU5, M-MU6 — Nav updates + state management polish.

**Critical path:** F-MU1 → F-MU3 + F-MU4 → M-MU2 + M-MU6

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migration data loss on rollback | Users with multiple memberships lose all but first on `down` | Document as known limitation; take DB backup before migration |
| JWT tenantId stale after removal | User removed from tenant but JWT still valid | JWT has 24h expiry; membership check on sensitive operations (invite create, member manage) |
| Invite token brute force | Attacker guesses tokens | 32-byte random = 256-bit entropy; rate limiting on info endpoint (TODO) |
| Last-owner removal race condition | Two owners demote each other simultaneously | Use `SELECT ... FOR UPDATE` on owner count check |
| Existing code references `tenant_users` | Build breaks | Grep + update all references (portal routes, middleware only reference it) |

---

## 10. Environment Variables

**New:**
- `PORTAL_BASE_URL` — Base URL for invite links (default: `http://localhost:3000`). Used to construct `inviteUrl` in API responses.

**Existing (unchanged):**
- `PORTAL_JWT_SECRET` — Signs portal JWT tokens (unchanged payload structure)
- `ENCRYPTION_MASTER_KEY` — Not involved in this feature

---

## 11. Deferred to Phase 2

- Email notifications for invites (currently just a link)
- Invite role customization (invites always create `member`)
- Tenant creation limits per user
- Transfer tenant ownership
- User profile management (change email, change password)
- Rate limiting on invite endpoints
- Audit logging for membership changes
