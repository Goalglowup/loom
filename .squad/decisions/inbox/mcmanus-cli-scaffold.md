# Decision: CLI Package Scaffold — @arachne/cli

**From:** McManus (Frontend/CLI)
**Date:** now
**Status:** implemented

## What Was Done

Scaffolded the `cli/` package as a standalone Node.js CLI under the `@arachne/cli` package name.

## Files Created

| File | Purpose |
|------|---------|
| `cli/package.json` | Package manifest; ESM, `arachne` bin, Commander/node-fetch/form-data deps |
| `cli/tsconfig.json` | TypeScript config extending root; `src/` → `dist/` |
| `cli/src/index.ts` | Commander entry point; `arachne` binary shell |
| `cli/src/commands/login.ts` | `arachne login [url]` stub |
| `cli/src/commands/weave.ts` | `arachne weave <spec>` stub |
| `cli/src/commands/push.ts` | `arachne push <bundle>` stub |
| `cli/src/commands/deploy.ts` | `arachne deploy <artifact>` stub |
| `cli/src/config.ts` | Config read/write at `~/.arachne/config.json`; env var fallback |

## Root `package.json` Change

Added `"workspaces": ["cli"]` — root had no workspaces field previously.

## Notes for Team

- Commands are stubs only; individual todos (`cli-login-cmd`, `cli-weave-cmd`, `cli-push-cmd`, `cli-deploy-cmd`) will implement them
- Config module is ready to import immediately in command implementations
- Needs `npm install` inside `cli/` before building
