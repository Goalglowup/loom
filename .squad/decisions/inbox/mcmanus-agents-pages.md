# Decision: SubtenantsPage and AgentsPage Implementation

**Date:** 2025-xx-xx  
**Author:** McManus (Frontend Dev)  
**Status:** Implemented

## Summary

Built two new portal pages (SubtenantsPage, AgentsPage) and an AgentEditor component, wired into routing and sidebar navigation.

## Decisions Made

### 1. Inline editor panel instead of modal or separate route

**Decision:** AgentEditor renders as an inline panel on the AgentsPage (above the table) rather than a slide-out drawer, modal, or `/app/agents/:id/edit` route.

**Rationale:** Simpler state management with no URL routing complexity. Keeps the full agents list visible for context. Matches the existing MembersPage inline form pattern. A slide-out drawer would require additional layout work and no animation primitives exist in the current component library.

### 2. EditorState discriminated union

**Decision:** Used `type EditorState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; agent: Agent }` to manage editor open/close state.

**Rationale:** Type-safe, no nullability ambiguity, exhaustive mode switching. Avoids `selectedAgent | null` + `isEditorOpen` boolean dance.

### 3. Subtenants nav is owner-gated; Agents is not

**Decision:** 🏢 Subtenants nav link only shows for `currentRole === 'owner'`. 🤖 Agents is visible to all authenticated users.

**Rationale:** Creating subtenants is an administrative act (like managing members). Agents are tenant-scoped configurations that any member may need to view/manage depending on use case. This mirrors how API Keys are visible to all roles.

### 4. Resolved config loaded lazily on expand

**Decision:** `getResolvedAgentConfig` is called only when the user expands "View inherited config", and cached in component state for the session.

**Rationale:** Avoids extra API call on every edit form open. The resolved view is informational/debugging, not required for saving.

### 5. API interfaces added to existing api.ts (not a separate file)

**Decision:** All new interfaces (`Subtenant`, `Agent`, etc.) added to the bottom of `portal/src/lib/api.ts`.

**Rationale:** Maintains single source of truth for API types. Consistent with existing pattern where `Member`, `Invite`, `User`, etc. all live in `api.ts`.
