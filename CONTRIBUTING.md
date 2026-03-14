# Contributing to Arachne

## Branching Strategy

This project follows gitflow:

| Branch | Purpose |
|--------|---------|
| `main` | Production releases. Protected — requires PR + CI pass. |
| `develop` | Integration branch. Feature branches merge here. |
| `release/*` | Release prep. Cut from `develop`, merge to `main` + back to `develop`. |
| `hotfix/*` | Urgent fixes. Cut from `main`, merge to `main` + back to `develop`. |
| `feat/*` | New features. Branch from `develop`, PR into `develop`. |
| `fix/*` | Bug fixes. Branch from `develop`, PR into `develop`. |

### Workflow

```
feat/my-feature ──PR──▶ develop ──release/0.2.0──▶ main
                                                      │
                                          hotfix/fix-crash ──▶ main + develop
```

## Changesets

This project uses [Changesets](https://github.com/changesets/changesets) for version management.

### When to add a changeset

Add a changeset when your PR includes changes that should appear in a release:
- New features, bug fixes, breaking changes
- Changes to `@arachne/chat` or `@arachne/cli`

Don't add a changeset for:
- CI/CD changes, docs-only changes, test-only changes, refactors with no user impact

### How to add a changeset

```bash
npx changeset
```

Select the affected packages, choose a semver bump type, and describe the change. Commit the generated `.changeset/*.md` file with your PR.

### Release flow

1. PRs with changesets merge to `develop`, then promote to `main`
2. On `main` push, the release workflow runs:
   - If pending changesets exist: opens a "Version Packages" PR that bumps versions and updates CHANGELOGs
   - When that PR merges: publishes packages to npm and creates GitHub Releases

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Build everything
npm run build && npm run build:all

# Build @arachne/chat
npm run build -w packages/chat
```

## Packages

| Package | Path | npm |
|---------|------|-----|
| Gateway | `src/` | — (Docker image) |
| Portal | `portal/` | — (Docker image) |
| Dashboard | `dashboard/` | — (bundled with gateway) |
| `@arachne/cli` | `cli/` | [@arachne/cli](https://www.npmjs.com/package/@arachne/cli) |
| `@arachne/chat` | `packages/chat/` | [@arachne/chat](https://www.npmjs.com/package/@arachne/chat) |
