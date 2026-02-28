# AgentSandbox Memory Mode UI Design

**Context:** Added conversation memory toggle to AgentSandbox for agents with `conversations_enabled: true`.

## Design Choices

### Toggle Placement
- Memory toggle positioned between agent name and model selector in header
- Keeps controls logically grouped: memory (left) → model (center) → close (right)
- Only shown when `agent.conversations_enabled` is true to avoid clutter

### State Indicators
- **Inactive**: Gray button "💾 Memory" — subtle, low-emphasis
- **Active**: Indigo button "💾 Memory ON" — clear visual feedback
- **Conversation ID**: Small monospace text `💬 abc12345...` in sub-header when active
  - First 8 chars of UUID provide enough uniqueness for user recognition
  - Border-top separator keeps it visually distinct from main header

### "New Conversation" Action
- Small "↺ New" button appears next to toggle when conversation is active
- Ghost style (text-only) to minimize visual weight
- Resets both conversation ID and message history for clean slate

### Memory Toggle Behavior
- When toggling off: clears conversation ID immediately (no orphaned state)
- When toggling on: starts fresh, backend creates new conversation on first message
- Conversation ID captured from first response and reused for subsequent messages

### Error Handling
- No special error handling for conversation failures — general error banner covers it
- If conversation_id missing from response, next message starts new conversation

## Trade-offs
- **Compact over descriptive**: Used icons and short labels to fit in existing header
- **No confirmation on "New"**: Instant reset keeps flow simple, users can always start over
- **UUID display**: Could link to full conversation view, but deferred to avoid scope creep
