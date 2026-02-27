# Loom Smoke Tests

End-to-end smoke tests using [Selenium WebDriver](https://www.selenium.dev/documentation/webdriver/) (TypeScript) and [Vitest](https://vitest.dev/). These tests exercise all major user-facing flows in the admin dashboard and tenant portal.

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 18 |
| Chrome | any recent stable |
| ChromeDriver | shipped as npm dev dep — matches Chrome automatically |
| Loom stack | running locally |

## Start the stack

```bash
docker-compose up -d
```

The stack should be reachable at `http://localhost:3000` (default).

## Run the smoke tests

```bash
npm run test:smoke
```

To watch tests run in a visible browser window:

```bash
HEADLESS=false npm run test:smoke
```

To run a single test file:

```bash
npx vitest run --config vitest.smoke.config.ts tests/smoke/admin.smoke.ts
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOOM_BASE_URL` | `http://localhost:3000` | Base URL of the running Loom instance |
| `ADMIN_USERNAME` | `admin` | Admin dashboard username |
| `ADMIN_PASSWORD` | `changeme` | Admin dashboard password |
| `HEADLESS` | `true` | Set `false` to open a visible browser |

## Test files

| File | What it covers |
|------|----------------|
| `helpers.ts` | Shared utilities: driver factory, `waitFor*`, login/signup helpers, unique data generators |
| `admin.smoke.ts` | Admin login · traces list · analytics charts + summary cards · tenant management panel · tenant selector dropdown |
| `portal-auth.smoke.ts` | Signup · login · logout · authenticated redirect · invalid credentials error |
| `portal-app.smoke.ts` | Traces page · analytics page · API keys CRUD · settings / provider config form · members page |
| `portal-invite.smoke.ts` | Create invite link · new user accepts invite · invited user appears in members list · revoke invite |
| `portal-tenant.smoke.ts` | Multi-tenant user setup · TenantSwitcher visible · switch tenant → active org changes |

## Notes

- Tests are **destructive** — they create real tenants, users, API keys, and invites. Run against a dev/test environment only.
- Tests run **serially** (no parallelism) to avoid race conditions from shared browser state.
- Each test suite creates unique users via timestamped email addresses (`smoke-xxx+<timestamp>@test.loom.local`) to avoid conflicts across runs.
- Selenium selectors use resilient strategies: `data-testid` attributes first, then CSS classes, then text content. Adding `data-testid` attributes to UI components will make tests more stable.

## Recommended `data-testid` attributes

Adding these to the UI will improve selector reliability:

| Component | Attribute |
|-----------|-----------|
| Tenant switcher dropdown | `data-testid="tenant-switcher"` |
| Tenant option in switcher | `data-testid="tenant-option"` |
| Chart wrapper | `data-testid="chart"` |
| Provider select in settings | `data-testid="provider-select"` |
| API key create button | `data-testid="create-api-key"` |
| Member invite create button | `data-testid="create-invite"` |
