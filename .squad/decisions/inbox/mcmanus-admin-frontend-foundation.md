# Admin Frontend Foundation — M-MT1

**Author:** McManus (Frontend)  
**Date:** 2026-02-25  
**Status:** Complete  
**Task:** M-MT1 — Build admin API utility and login component for JWT-based admin auth

---

## Implementation Summary

Built the foundation for the admin section of the dashboard following Keaton's revised multi-tenant design (JWT-based admin auth, not the original localStorage API key approach).

### Artifacts Created

1. **`dashboard/src/utils/adminApi.ts`** — Admin API utility module
2. **`dashboard/src/components/AdminLogin.tsx`** — Admin login form component
3. **`dashboard/src/components/AdminLogin.css`** — Styling for login form

---

## Technical Decisions

### 1. JWT Storage Strategy

**Decision:** Store admin JWT in `localStorage.loom_admin_token` (not sessionStorage).

**Rationale:**
- Persists across page reloads and browser restarts (better UX for 8-hour token lifetime)
- Matches existing tenant API key pattern (`localStorage.loom_api_key`)
- Admin sessions are rare (operator-only), so convenience outweighs security marginal gain from sessionStorage
- Keaton's design specifies 8h token expiry — localStorage aligns with this longer-lived session model

**Alternative Considered:** sessionStorage (rejected: forces re-login on every new tab/window, poor UX for multi-tab admin workflows)

### 2. Auth Redirect Pattern

**Decision:** `adminFetch()` auto-redirects to `/dashboard/admin` on 401 or missing token.

**Rationale:**
- Simplifies consuming components — no manual auth checks needed
- Login endpoint bypassed via `!path.endsWith('/login')` check
- `clearAdminToken()` ensures no stale token reused after logout
- Matches tenant API pattern where `ApiKeyPrompt` is shown when key missing

**Implementation:**
```typescript
if (!token && !path.endsWith('/login')) {
  clearAdminToken();
  window.location.href = '/dashboard/admin';
  throw new Error('Admin token missing');
}
```

### 3. Styling Consistency

**Decision:** AdminLogin CSS follows ApiKeyPrompt.css patterns exactly (overlay, card, input, button classes).

**Rationale:**
- Visual consistency with existing tenant API key prompt
- Proven responsive design (mobile-tested in Wave 2)
- Reuses color tokens (#6366f1 primary, #dc2626 error, #6b7280 text)
- Users experience unified design language across auth flows

**Differences from ApiKeyPrompt:**
- Two input fields (username + password) instead of one
- Error state display (red border + background message)
- Loading state disables inputs during fetch

### 4. Type Exports

**Decision:** Export `AdminTenant`, `AdminApiKey`, `AdminProviderConfig` interfaces from `adminApi.ts`.

**Rationale:**
- Co-locate types with API module for single import source
- Matches backend schema from Keaton's design (Section 2 DB Schema)
- `hasApiKey: boolean` instead of raw key — aligns with security design (encrypted provider config)
- Nullable `revoked_at` on `AdminApiKey` supports soft delete pattern

**Types:**
```typescript
export interface AdminTenant {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface AdminApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  status: 'active' | 'revoked';
  created_at: string;
  revoked_at: string | null;
}

export interface AdminProviderConfig {
  provider: 'openai' | 'azure' | 'ollama';
  baseUrl?: string;
  hasApiKey: boolean;
}
```

---

## Component Design

### AdminLogin Form Flow

1. User enters username + password
2. Submit disabled until both fields non-empty
3. On submit:
   - Set `loading` state (disables inputs + button, shows "Logging in...")
   - POST to `/v1/admin/login` with credentials
   - If 200: store `data.token` in localStorage, call `onLogin()` callback
   - If 4xx/5xx: show "Invalid credentials" error inline
   - If network error: show "Login failed" error
4. Form is accessible (aria-label on inputs, role="dialog" on overlay)

### Error Handling

- **Invalid credentials:** Red error box below password field ("Invalid credentials")
- **Network failure:** Generic error ("Login failed. Please try again.")
- **Missing token on protected route:** Auto-redirect to login (via `adminFetch`)
- **Expired token (401 response):** Clear localStorage, redirect to login

---

## Integration Points

### With Backend (Fenster's F-MT4b)

- **Login endpoint:** `POST /v1/admin/login` expects `{ username, password }`, returns `{ token, expiresIn }`
- **Auth header:** All admin routes require `Authorization: Bearer <JWT>`
- **Token expiry:** 8h per Keaton's design — no frontend expiry check (rely on backend 401)

### With Future Frontend Work (M-MT2+)

- **M-MT2:** Admin page shell will use `getAdminToken()` to gate UI (show login form if null)
- **M-MT3–M-MT6:** Tenant list, detail, provider config, API key components will all use `adminFetch()`
- **Route registration:** Admin page will mount at `/dashboard/admin` (client-side React Router)

---

## Build Status

✅ **Clean compile** — `npm run build` in dashboard/ succeeded with no TypeScript errors. All new files integrated successfully with existing Vite + React 19 setup.

**Build output:**
- 694 modules transformed
- dist/assets/index-*.js = 578.57 kB (recharts still dominates bundle size)
- No new warnings introduced

---

## Testing Notes

**Manual testing required (no Vitest tests for this task):**
- Verify login form renders
- Test valid credentials → JWT stored → `onLogin` callback fired
- Test invalid credentials → error message displayed
- Test network error → fallback error shown
- Verify 401 redirect on protected route

**Backend dependency:** F-MT4b must be complete for end-to-end testing.

---

## Alternatives Considered

### 1. Session-based auth instead of JWT
**Rejected:** Keaton's design explicitly calls for JWT (admin_users table + HS256). No server-side session store in Phase 1.

### 2. API key for admin (original design)
**Rejected:** Keaton revised design (Q1 answer) changed from `ADMIN_API_KEY` env var to per-user admin auth for auditability.

### 3. Inline error vs toast notification
**Rejected toast:** Inline error (red box below password) is more accessible and doesn't require additional UI library. Matches form validation UX patterns.

---

## Risks

**Low risk.** Standard JWT + localStorage pattern. No crypto logic on frontend (backend signs/verifies). Form handling is simple React state.

**One gotcha:** If `ADMIN_JWT_SECRET` not set on backend, login will fail at runtime (not compile time). Fenster's F-MT4b should validate env var on startup.

---

## Learnings

1. **Mirroring existing patterns speeds development:** Following `api.ts` + `ApiKeyPrompt` patterns made this task straightforward — no design decisions needed.
2. **localStorage persistence matters for long-lived tokens:** 8h JWT in sessionStorage would frustrate admin users opening multiple tabs.
3. **Auto-redirect on 401 simplifies components:** Consuming code doesn't need try/catch for auth failures — `adminFetch` handles it centrally.

---

## Next Wave

**M-MT2** will add:
- Admin page shell (`/dashboard/admin` route)
- Nav link in Layout component
- Auth gate (show AdminLogin if no token, show admin UI if authenticated)

**Blocked by:** F-MT4b (admin login endpoint must exist for end-to-end validation)
