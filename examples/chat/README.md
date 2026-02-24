# Loom Chat — Getting-Started Example

A single-file, zero-dependency chat UI that demonstrates calling the [Loom gateway](../../README.md) from a plain browser page.

## What it demonstrates

- Posting to the Loom `/v1/chat/completions` endpoint (OpenAI-compatible)
- Streaming responses via `fetch` + `ReadableStream` + SSE parsing
- Multi-turn conversation history (full message array sent each request)
- `localStorage`-persisted configuration (gateway URL, API key, model)
- Clean error handling: missing key, unreachable gateway, HTTP errors
- Works with any model the gateway supports — OpenAI (`gpt-4o`), Azure OpenAI, Ollama (`llama3.2`), etc.

## How to use

1. Start the Loom gateway (`npm start` from the project root).
2. Open `examples/chat/index.html` directly in your browser — no server needed.
3. Expand the **Configuration** panel, enter your API key and (optionally) adjust the gateway URL and model name, then click **Save & Apply**.
4. Type a message and press **Enter** (or click the send button) to start chatting.

Configuration is saved to `localStorage` and will persist across page reloads.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Complete single-page app — HTML, CSS, and JS inline |

→ [Main project README](../../README.md)
