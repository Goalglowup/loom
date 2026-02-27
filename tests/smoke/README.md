# Loom Smoke Tests

Browser smoke tests covering major portal and admin flows.

## Prerequisites

- Loom stack running (`docker-compose up`)
- Playwright browsers installed: `npx playwright install chromium`

## Running

```bash
npm run test:smoke          # run all smoke tests (headless)
HEADLESS=false npm run test:smoke  # run with browser visible
```

## Generating documentation screenshots

```bash
npm run docs:build          # runs tests in DOCS_MODE + generates docs/ui-reference.md
```

Or separately:
```bash
DOCS_MODE=true npm run test:smoke   # capture screenshots to docs/screenshots/
npm run docs:generate               # assemble into docs/ui-reference.md
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOOM_BASE_URL` | `http://localhost:3000` | App URL |
| `ADMIN_USERNAME` | `admin` | Admin login |
| `ADMIN_PASSWORD` | `changeme` | Admin password |
| `HEADLESS` | `true` | Set to `false` to see the browser |
| `DOCS_MODE` | `false` | Set to `true` to capture screenshots for docs |

## Test files

| File | What it covers |
|------|----------------|
| `helpers.ts` | Shared utilities: browser/page lifecycle, `waitFor*`, login/signup helpers, screenshot helper, unique data generators |
| `admin.smoke.ts` | Admin login · traces list · analytics charts + summary cards · tenant management panel · tenant selector dropdown |
| `portal-auth.smoke.ts` | Signup · login · logout · authenticated redirect · invalid credentials error |
| `portal-app.smoke.ts` | Traces page · analytics page · API keys CRUD · settings / provider config form · members page |
| `portal-agents.smoke.ts` | Agents page · create agent · agent in list · subtenants page · create subtenant · subtenant in list |
| `portal-invite.smoke.ts` | Create invite link · new user accepts invite · invited user appears in members list · revoke invite |
| `portal-tenant.smoke.ts` | Multi-tenant user setup · TenantSwitcher visible · switch tenant → active org changes |

## Notes

- Tests are **destructive** — they create real tenants, users, API keys, and invites. Run against a dev/test environment only.
- Tests run **serially** (no parallelism) to avoid race conditions from shared browser state.
- Each test suite creates unique users via timestamped email addresses to avoid conflicts across runs.
- Playwright auto-waits for elements to be ready — explicit waits are only added for non-standard conditions.
