# Arachne v2 — Tool Transport Specification

**Version:** 0.1
**Date:** 2026-04-13
**Status:** Draft
**Supersedes:** `agent_tools.md` (sandboxing approach), `arachne_tool_package_spec.md` (runtime section)

---

## 1. Summary

Arachne v2 tools use three transport models depending on where the tool runs:

| Transport | When to use | Examples |
|-----------|-------------|---------|
| **stdio** | Local tools on the user's machine | file editor, shell, search, memory |
| **HTTP (StreamableHttp)** | Remote tools on the network | calendar API, email, web fetch |
| **Platform** | In-process utilities with no serialization overhead | token counting, schema validation |

This replaces the Arachne v1 approach (HTTP-only MCP calls) and the specced-but-unbuilt Azure Container Apps Dynamic Sessions sandbox.

All three transports speak the **MCP protocol** at the application layer. Transport is an infrastructure concern; the agent sees the same `tools/call` interface regardless.

---

## 2. Transport Details

### 2.1 stdio (Local Tools)

The Arachne runtime spawns a subprocess for each tool server. Communication is via stdin/stdout using JSON-RPC 2.0. No ports, no auth headers, no service discovery.

```
Arachne runtime process
  └── spawns: arachne-tool-file-editor
        stdin  ← {"jsonrpc":"2.0","method":"tools/call","params":{"name":"read_file","arguments":{"path":"..."}}}
        stdout → {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"..."}]}}
```

**Subprocess lifecycle:** tied to the workspace session. When the session ends, the subprocess is terminated. No daemon processes.

**Security model (current):** subprocess isolation only — the tool process runs as the same user. Equivalent to the user running the command themselves.

**Security model (roadmap):** WASM sandbox (see Section 4).

**Use for:** any tool that operates on local resources — file system, local databases, shell commands, local memory search.

---

### 2.2 HTTP / StreamableHttp (Remote Tools)

Standard HTTP transport: `POST` to a URL with a JSON-RPC 2.0 body. The tool server is a network service. Response may be streamed (SSE) or returned as a single JSON response.

```
Arachne runtime
  └── POST https://tools.example.com/mcp
        Body: {"jsonrpc":"2.0","method":"tools/call","params":{...}}
        Response: {"jsonrpc":"2.0","result":{...}}
```

**Auth:** Bearer token in `Authorization` header, resolved from the agent's credential store per principal.

**Use for:** tools that are inherently remote — calendar (M365/Google), email, Slack, external web APIs, payment processors. Also correct for cloud-hosted tool packages where the tool server is a managed microservice.

---

### 2.3 Platform (In-Process)

Direct function call within the Arachne runtime process. No subprocess, no network, no JSON serialization. Implements the same `McpClientTrait` interface as the other transports so the agent dispatch layer treats them identically.

```rust
// Platform tool — zero overhead
impl McpClientTrait for TokenCounterTool {
    async fn call_tool(&self, ctx: &ToolCallContext, name: &str, args: Option<JsonObject>, _: CancellationToken) -> Result<CallToolResult> {
        match name {
            "count_tokens" => self.count(args),
            _ => Err(Error::ToolNotFound(name.into())),
        }
    }
}
```

**Use for:** utilities where network/subprocess overhead is unacceptable — token counting, schema validation, format conversion, memory index queries.

---

## 3. Tool Package Format

`.tool.orb` is the portable artifact format. A package is a gzip-compressed tar with a `manifest.json` at root.

```
my-tool-package-1.0.0.tool.orb
├── manifest.json
├── dist/
│   └── server.js      ← bundled MCP stdio server (Node.js or Deno)
└── assets/            ← optional static files
```

**Manifest:**

```json
{
  "kind": "arachne.tool-package",
  "schema_version": "2.0",
  "package": {
    "id": "acme.web-tools",
    "version": "1.0.0",
    "runtime": "node",
    "entrypoint": "./dist/server.js"
  },
  "transport": "stdio",
  "tools": [
    {
      "id": "web.read",
      "name": "Read Web Page",
      "description": "Fetches and sanitizes webpage content.",
      "handler": "webRead",
      "input_schema": {
        "type": "object",
        "properties": {
          "url": { "type": "string", "format": "uri" }
        },
        "required": ["url"]
      },
      "output_schema": {
        "type": "object",
        "properties": {
          "content": { "type": "string" }
        }
      },
      "annotations": {
        "read_only_hint": true
      },
      "permissions": {
        "network": ["fetch"]
      }
    }
  ]
}
```

The `entrypoint` is a stdio MCP server. Arachne spawns it as a subprocess and communicates via stdin/stdout. This is the same pattern Goose uses for builtin extensions — it works with any language that can read stdin and write stdout.

---

## 4. WASM Sandbox (Roadmap)

The stdio subprocess model gives process isolation but no capability restrictions — the tool process inherits the user's permissions. WASM is the upgrade path.

**Target:** `.tool.orb` packages can contain a `.wasm` component (WASI preview 2) instead of a JS bundle. The Arachne runtime executes it via Wasmtime with explicit capability grants.

```json
{
  "package": {
    "runtime": "wasm",
    "entrypoint": "./dist/tool.wasm"
  },
  "permissions": {
    "fs": [{ "path": "{workspace_dir}", "mode": "read-write" }],
    "network": ["fetch"],
    "env": []
  }
}
```

**Capability grants (WASI):**

| Permission key | What it grants |
|----------------|----------------|
| `fs.path` | Access to specific directories only |
| `network.fetch` | Outbound HTTP only |
| `network.listen` | Inbound socket (rarely needed) |
| `env` | Specific environment variables |

No grant = no access. A file editor with `fs: [{path: "{workspace_dir}"}]` cannot read `/etc/passwd`. A web fetcher with `network: ["fetch"]` cannot open a socket listener.

**Migration path:** `runtime: "node"` → stdio subprocess (current). `runtime: "wasm"` → Wasmtime sandbox (roadmap). Same manifest format, same MCP protocol, same `.tool.orb` container. Tools can ship both — runtime negotiation at install time.

---

## 5. Permission & Inspection Pipeline

Inherited from the Goose model, adapted for Arachne's multi-tenant context.

Every tool call passes through the inspection pipeline before dispatch:

```
Tool call request
  → PermissionInspector     (AlwaysAllow / AskBefore / NeverAllow per tool, per user)
  → AdversaryInspector      (prompt injection detection)
  → EgressInspector         (data exfiltration prevention)
  → SecurityInspector       (dangerous command detection)
  → RepetitionInspector     (tool call loop detection)

Result: approved | needs_approval | denied

  approved        → dispatch immediately
  needs_approval  → yield ActionRequired to UI, await confirmation
  denied          → return DECLINED_RESPONSE to agent
```

**Confirmation types (user can choose):**
- `AlwaysAllow` — remember globally for this tool
- `AllowOnce` — this call only
- `DenyOnce` — this call only
- `AlwaysDeny` — remember globally for this tool

**Tool annotations that affect inspection:**
- `read_only_hint: true` — PermissionInspector auto-approves without asking user
- `annotations.destructive: true` — SecurityInspector escalates to `needs_approval` regardless of saved preference

---

## 6. Extension Config (Arachne v2 Agent YAML)

```yaml
tools:
  - type: stdio
    package: arachne.developer@1.0.0     # resolves from local registry
    available_tools: []                  # empty = all tools

  - type: stdio
    package: acme.web-tools@2.1.0

  - type: http
    name: google-calendar
    uri: https://calendar-mcp.synapticweave.com
    auth:
      type: bearer
      credential: principal://google_oauth  # per-principal OAuth token

  - type: platform
    name: token-counter                   # built-in, zero config
```

---

## 7. Arachne v1 → v2 Migration

| v1 Behavior | v2 Behavior |
|-------------|-------------|
| Skills injected as OpenAI `tools` array | Same — tool format is still OpenAI-compatible at the LLM boundary |
| MCP endpoints: HTTP only | stdio (local), HTTP (remote), platform (in-process) |
| One round-trip max | Full agentic loop (N turns until done) |
| No permission system | 5-inspector pipeline, user confirmation flow |
| Azure Container Apps sandbox (specced) | stdio subprocess → WASM component (roadmap) |
| No built-in tools | Developer, memory, and core tools ship with the runtime |

---

## 8. Open Questions

1. **Credential store:** Per-principal OAuth tokens for HTTP tools — where do they live? Encrypted in local SQLite for Forge/Flow; in Arachne Cloud for remote deployments.

2. **WASM toolchain:** Wasmtime (Rust) is the natural fit given the Rust runtime. Confirm compatibility with the `goose-sdk` tool dispatch layer before committing.

3. **Large result handling:** Goose summarizes tool results > 50KB before feeding back to the LLM. Threshold and summarization model need to be configurable per agent.

4. **Cross-platform stdio:** Windows stdin/stdout behavior differs from Unix. Need to validate subprocess lifecycle management on Windows (relevant for Flow on Windows).
