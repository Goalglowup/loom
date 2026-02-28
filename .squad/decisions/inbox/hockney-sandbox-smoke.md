# Decision: Sandbox Smoke Test Approach

**Author:** Hockney  
**Date:** 2025  
**Context:** Adding portal-sandbox.smoke.ts for the new SandboxPage and AgentSandbox component.

## Decisions Made

### 1. Assistant response detection uses `.bg-gray-800.text-gray-100` not `.animate-pulse` hidden wait

The "thinking…" loading indicator and assistant message bubbles both use `.bg-gray-800`, but the loading indicator uses `text-gray-400` while assistant messages use `text-gray-100`. Waiting for `.bg-gray-800.text-gray-100` to become visible is more robust than waiting for `.animate-pulse` to disappear (which can race if the element hasn't appeared yet).

### 2. Analytics after-traffic assertion uses dual check (count === 0 OR first card is not `—`)

The analytics aggregation pipeline may introduce a short delay before data reflects in the dashboard. The test uses a 2-second wait then checks `.card-value--empty` count. If some cards remain empty (edge case), it falls back to asserting the first card value is not `—`. This avoids flakiness without skipping the assertion entirely.

### 3. Model set to `mistral:7b` for sandbox chat test

Using `mistral:7b` as it's the model specified in the task. Tests requiring a live LLM response depend on the Ollama provider being configured in the test environment.

### 4. Agent selected by `button:has-text(agentName)` not `p:has-text(agentName)`

SandboxPage renders the agent list as `<button>` elements containing a `<p>` for the name. Playwright's `:has-text()` on the `button` element works correctly since it matches text within descendants.
