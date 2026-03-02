# Arachne Rebrand — Backend & Frontend String Changes

**Date:** 2026  
**Author:** Fenster (Backend Dev)  
**Requested by:** Michael Brown

## Summary

Rebranded all user-facing product name references from "Loom" to "Arachne" across the codebase. Variable/function names (e.g., `loomConfig`) were intentionally left untouched per scope limits.

## Files Changed

### Package / Config
- **`package.json`** — `"name": "loom"` → `"name": "arachne"`

### Backend (`src/`)
- **`src/index.ts`** — `X-Loom-Conversation-ID` response header → `X-Arachne-Conversation-ID`
- **`src/conversations.ts`** — File-level comment: "Loom gateway" → "Arachne gateway"
- **`src/agent.ts`** — File-level comment: "Loom gateway" → "Arachne gateway"

### Portal UI (`portal/src/`)
- **`portal/src/components/AppLayout.tsx`** — Nav brand "⧖ Loom" → "⧖ Arachne"
- **`portal/src/pages/LoginPage.tsx`** — Logo link "⧖ Loom" → "⧖ Arachne"
- **`portal/src/pages/SignupPage.tsx`** — All three logo instances "⧖ Loom" → "⧖ Arachne"
- **`portal/src/pages/LandingPage.tsx`** — Nav brand, hero h1, footer copyright
- **`portal/src/pages/TracesPage.tsx`** — Empty-state copy "through Loom" → "through Arachne"
- **`portal/src/pages/ApiKeysPage.tsx`** — Description text "Loom gateway" → "Arachne gateway"

### Dashboard UI (`dashboard/src/`)
- **`dashboard/src/components/Layout.tsx`** — Logo heading "Loom" → "Arachne"
- **`dashboard/src/components/ApiKeyPrompt.tsx`** — Prompt text "Loom API key" → "Arachne API key"
- **`dashboard/README.md`** — Title and description

### Tests
- **`portal/src/components/__tests__/AppLayout.test.tsx`** — Test description and assertion updated to "Arachne"
- **`portal/src/pages/__tests__/LandingPage.test.tsx`** — Test description and assertion updated to "Arachne"

### Docs
- **`README.md`** — Title, all product-name references, `## Loom CLI` section heading, `X-Loom-Conversation-ID` in API docs, CLI command name (`loom` → `arachne`)
- **`RUNNING_LOCALLY.md`** — Document title

## What Was NOT Changed (Intentional)
- Variable/function names: `loomConfig`, `loomSettings`, etc. — deferred to later refactor
- `docker-compose.yml` POSTGRES_DB/USER (`loom`) — DB infrastructure names; changing would require data migration
- `.squad/` agent names — cast names, out of scope
- Git repo directory name
- Migration SQL table names (no `loom_` prefix tables found; no `loom.ai/v0` strings found in migrations)
