# Frontend: Multi-User Multi-Tenant Implementation Decisions

**Author:** McManus (Frontend Dev)  
**Date:** 2026-02-26  
**Status:** Implemented  
**Refs:** keaton-multi-user-tenant-arch.md

---

## Decision 1: AuthContext as Single Source of Auth Truth

**Context:** Previously, each page component individually called `api.me()` on mount to get user/tenant state. Tenant switching requires replacing the token and refreshing state app-wide.

**Decision:** Created `portal/src/context/AuthContext.tsx` wrapping the entire app. All components use `useAuth()` hook. AuthContext owns: `token`, `user`, `tenant`, `tenants[]`, `loading`.

**Rationale:** Tenant switching needs to propagate instantly to all components (nav, tenant switcher, page content). A context is the minimal correct solution.

**Trade-off:** `AppLayout` previously did its own `api.me()` — this is now removed in favour of the shared context. `DashboardHome` still does its own fetch (not changed, as it fetches richer data).

---

## Decision 2: `currentRole` Derivation Strategy

**Context:** Role lives in the JWT (backend) but also in the `tenants[]` list returned from login/me.

**Decision:** `currentRole` is derived on the frontend as:
```ts
tenants.find(t => t.id === tenant?.id)?.role ?? user?.role ?? null
```
Falls back to `user.role` for backward compatibility with existing sessions that may not have `tenants[]` populated yet.

**Rationale:** Avoids JWT parsing on the frontend. Backend always returns role in both locations.

---

## Decision 3: Members Nav Link — Hide vs. Gate

**Choice:** Hide the Members nav link entirely for non-owners (not just show it disabled/greyed).

**Rationale:** Members without the link visible won't try to navigate there. The page itself still shows a permission error if navigated directly (e.g., via URL). Consistent with how API Keys work (shown to all, but only owners can create).

**Alternative considered:** Show the link to all users — rejected as it creates confusion for read-only members.

---

## Decision 4: Invite Signup → Redirect to `/app/traces`

**Per spec:** On successful invite-based signup, navigate to `/app/traces` (not API key reveal, since members don't get keys).

**Implementation note:** API `signup` response `apiKey` made optional (`apiKey?`). Invite path branches before the key reveal state is set.

---

## Decision 5: Tenant Switcher — No Page Reload

**Decision:** `switchTenant()` calls `POST /v1/portal/auth/switch-tenant`, replaces token in localStorage, then calls `api.me()` with the new token to refresh all context state in-place. No `window.location.reload()`.

**Rationale:** In-place state update is smoother UX. Any component subscribed to context will re-render automatically. If a page has local state that depends on tenant (e.g., traces list), it will need to respond to tenant changes — pages that call `api.me()` or use the token from context/localStorage will naturally re-fetch on next action.

**Known limitation:** Pages that fetched data on mount (e.g., TracesPage) will show stale data until the user navigates or refreshes. This is acceptable for Phase 1 per Keaton's spec.

---

## Decision 6: Revoked Invites — Collapsed `<details>`

**Decision:** Revoked/expired invites shown in a collapsed `<details>` element below the active invites table.

**Rationale:** Keeps the page clean. Owners rarely need to see historical revoked invites. No new dependencies needed (native HTML element).
