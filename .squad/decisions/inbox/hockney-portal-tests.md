# Hockney: Portal UI Unit Tests — Coverage Summary

**Date:** 2025  
**Author:** Hockney (QA)  
**Task:** Write Vitest + React Testing Library unit tests for untested portal UI components and pages.

---

## Test Files Created

| File | Tests | Target |
|------|-------|--------|
| `portal/src/lib/__tests__/auth.test.ts` | 9 | `src/lib/auth.ts` |
| `portal/src/lib/__tests__/models.test.ts` | 3 | `src/lib/models.ts` |
| `portal/src/context/__tests__/AuthContext.test.tsx` | 7 | `src/context/AuthContext.tsx` |
| `portal/src/components/__tests__/AppLayout.test.tsx` | 7 | `src/components/AppLayout.tsx` |
| `portal/src/components/__tests__/TenantSwitcher.test.tsx` | 7 | `src/components/TenantSwitcher.tsx` |
| `portal/src/components/__tests__/ModelListEditor.test.tsx` | 13 | `src/components/ModelListEditor.tsx` |
| `portal/src/components/__tests__/AgentEditor.test.tsx` | 10 | `src/components/AgentEditor.tsx` |
| `portal/src/components/__tests__/AgentSandbox.test.tsx` | 9 | `src/components/AgentSandbox.tsx` |
| `portal/src/pages/__tests__/LandingPage.test.tsx` | 6 | `src/pages/LandingPage.tsx` |
| `portal/src/pages/__tests__/DashboardHome.test.tsx` | 6 | `src/pages/DashboardHome.tsx` |
| `portal/src/pages/__tests__/SignupPage.test.tsx` | 9 | `src/pages/SignupPage.tsx` |
| `portal/src/pages/__tests__/SandboxPage.test.tsx` | 6 | `src/pages/SandboxPage.tsx` |
| **TOTAL NEW** | **92** | |

**Previous total:** 30 tests  
**New total:** 122 tests (all passing)

---

## Coverage Gains (estimated, by file)

### Components
- **AppLayout** — 0% → ~85%: nav rendering, owner-only links, logout handler, branding, TenantSwitcher integration
- **TenantSwitcher** — 0% → ~90%: null tenant, single tenant static display, multi-tenant select, switchTenant call, switching indicator state
- **ModelListEditor** — 0% → ~95%: toggle custom list, add via button/Enter, remove, duplicate prevention, reset, empty state, disabled Add button
- **AgentEditor** — 0% → ~70%: create/edit modes, name validation, API create/update calls, error handling, cancel, conversation memory toggle, resolved config panel, add skill
- **AgentSandbox** — 0% → ~75%: render, empty state, send via button/Enter, user+assistant message display, loading indicator, error state, custom model list

### Pages
- **LandingPage** — 0% → ~95%: hero text, navigation links, feature cards, footer year
- **DashboardHome** — 0% → ~90%: loading state, welcome message with tenant name, provider configured/unconfigured states, error state, quick links
- **SignupPage** — 0% → ~85%: normal signup form, API key reveal, invite mode (loading, invalid, valid, submit, navigation)
- **SandboxPage** — 0% → ~80%: loading, empty state with link, agent list, default selection, agent switching, page title

### Lib & Context
- **auth.ts** — 0% → ~100%: all exported functions covered (getToken, setToken, clearToken, isAuthenticated, getStoredTenants, setStoredTenants)
- **models.ts** — 0% → ~100%: COMMON_MODELS constant structure and key values
- **AuthContext.tsx** — 0% → ~80%: AuthProvider loading lifecycle, user resolution, failed api.me, logout, setLoginData, currentRole derivation, useAuth outside provider error

---

## Notable Patterns Used

1. **`vi.stubGlobal('localStorage', localStorageMock)`** — jsdom's localStorage doesn't expose `.clear()`/`.removeItem()`. A custom in-memory stub is required for auth.ts tests.
2. **Re-apply mock implementations after `vi.resetAllMocks()`** — Always call `vi.mocked(getToken).mockReturnValue('tok')` in `beforeEach` after the reset, otherwise the implementation is cleared.
3. **`getAllByText()` for duplicate text** — Landing and SignupPage repeat text in multiple elements; use `getAllByText` with length assertion.
4. **`getByRole('switch')`** for AgentEditor's conversation toggle — it's a `<button role="switch">` not a checkbox.
5. **Mock child components** (`AgentSandbox`, `ModelListEditor`) in parent tests to isolate scope and avoid cascading mock requirements.
6. **`MemoryRouter` wrapping** for all page/layout components that use react-router hooks.
