# Changesets

This project uses [Changesets](https://github.com/changesets/changesets) for version management.

## Adding a changeset

When you make a change that should be released, run:

```bash
npx changeset
```

This will prompt you to:
1. Select which packages changed (`@arachne/chat`, `@arachne/cli`, or `arachne`)
2. Choose a semver bump type (major, minor, patch)
3. Write a summary of the change

The changeset file is committed with your PR. When merged to main, the release workflow picks it up.
