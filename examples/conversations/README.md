# Loom Conversations Demo

A standalone HTML demo showing how to use Loom's conversation memory feature.

## What is Conversation Memory?

Loom can persist conversation history server-side, allowing the AI to remember context across sessions. This is different from the basic chat example, which keeps history only in the browser.

## Key Concepts

### `conversation_id`
- A unique identifier for a conversation thread
- Leave blank on first message — the gateway will generate one and return it
- Include on subsequent messages to continue the conversation
- The AI automatically receives full history from the server

### `partition_id`
- Optional scope for organizing conversations
- Typically a user ID, team ID, or other grouping
- Keeps conversations logically separate (e.g., per-user memory)
- Example: `user-123`, `team-acme`, `session-abc`

## Usage

1. **Open directly in your browser:**
   ```bash
   open examples/conversations/index.html
   ```

2. **Configure your gateway:**
   - Gateway URL (default: `http://localhost:3000`)
   - API Key (create one in the Loom portal)
   - Model (e.g., `gpt-4o`, `deepseek-r1:14b`)

3. **Start chatting:**
   - Send your first message — a new conversation will be created
   - The conversation ID appears in the status bar below the config
   - Continue chatting — the AI remembers previous messages
   - Reload the page — conversation persists!

4. **Try different features:**
   - **New Conversation** button clears the ID and starts fresh
   - Set a **Partition ID** to scope conversations (e.g., `user-alice`)
   - Manually enter a **Conversation ID** to resume a specific thread

## How It Works

Unlike the basic chat example which sends the full message history with every request:

1. Client sends only the current message + `conversation_id`
2. Gateway loads previous messages from the database
3. Gateway injects history before forwarding to the AI
4. Response includes the `conversation_id` (in body and header)
5. Client stores the ID for the next message

This approach:
- Reduces request payload size
- Keeps server as source of truth
- Enables cross-device/cross-session memory
- Works seamlessly with conversation summarization (when threads get long, Loom auto-creates summaries to stay within token limits)

## Enabling Conversations for Your Agent

In the Loom portal, set these properties on your agent:

- **Conversations Enabled:** `true`
- **Conversation Token Limit:** `4000` (or your preferred context window)
- **Conversation Summary Model:** `gpt-4o-mini` (or any fast model for summarization)

## Technical Details

**Request format:**
```json
{
  "model": "gpt-4o",
  "messages": [{"role": "user", "content": "Hello!"}],
  "stream": true,
  "conversation_id": "optional-uuid-or-omit-for-new",
  "partition_id": "optional-scope"
}
```

**Response includes:**
- Header: `X-Loom-Conversation-ID: <uuid>`
- Body: `conversation_id` field (after streaming completes)

The header is available immediately (before reading the stream), so you can display it to the user right away.

## See Also

- [Basic Chat Example](../chat/index.html) — Simple stateless chat (no memory)
- [Portal Sandbox](http://localhost:3000/portal) — Test conversations in the web UI
- [Conversation API Docs](../../docs/conversations.md) — Full API reference
