# Decision Record: Agent-Scoped Portal Page Updates

**Date:** 2025-07-14  
**Author:** McManus (Frontend)  
**Status:** Implemented

## Changes

### ApiKeysPage — Agent selector
- API keys now require an agent. Agent dropdown added as first field in create form.
- Agents fetched on page load via `GET /v1/portal/agents` (already in `api.ts`).
- If no agents exist, the create form shows "Create an agent first before generating API keys" and the create button is disabled.
- `createApiKey` API call updated: body now `{ name: string; agentId: string }`.
- "Agent" column added to keys table; resolves name from `agentName` field on the key (if returned by API) or client-side join via `agents` state.
- `ApiKeyEntry` interface updated with optional `agentId?` and `agentName?` fields.

### AnalyticsPage — Rollup scope selector
- New "Scope" dropdown above analytics view. Options: "All — roll up subtenants + agents" (default, `rollup=true`) vs "This org only" (no param).
- All three fetch functions (`summary`, `timeseries`, `models`) append `?rollup=true` when rollup is selected.
- SharedAnalyticsPage receives a `key` prop that changes on scope toggle, forcing a clean remount and re-fetch. This avoids patching the shared component's internal stable-ref pattern.

### SettingsPage — Renamed to Org Defaults
- Title changed from "Provider settings" → "Org Defaults".
- Subtitle updated to: "Default settings inherited by agents. Agents can override these or leave them blank to use these values."
- Note added below form: "These settings are inherited by all agents in this org unless the agent defines its own."
- Form logic unchanged.

## Trade-offs
- The `key` remount approach for AnalyticsPage is slightly heavier than patching SharedAnalyticsPage internals, but keeps the shared component stable and avoids cross-team coordination.
- Agent name in keys table resolves client-side if `agentName` is absent from the API response — acceptable given the agents list is already fetched.
