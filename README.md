# Loom

**Loom** is an AI gateway and control plane that proxies requests to LLM providers (OpenAI, Azure, etc.) with deep observability, tenant isolation, intelligent agent routing, and persistent conversation memory.

## What Loom Does

- **Provider-agnostic gateway** — OpenAI-compatible API that routes to multiple LLM providers (OpenAI, Azure OpenAI) with per-tenant configuration
- **Multi-tenant isolation** — Separate API keys, agent configurations, and trace storage per tenant; strict data isolation
- **Agent management** — Define agents with custom system prompts, tools/skills (MCP-compatible), and merge policies for injecting agent context into requests
- **Conversation memory** — Persistent multi-turn conversations with automatic summarization when token limits are exceeded; context injection across exchanges
- **Structured trace recording** — Encrypted request/response audit trail partitioned by month; queryable per tenant, agent, or model
- **Analytics & observability** — Token counts, latency metrics (p95/p99), error rates, cost estimation, gateway overhead tracking, and time-series bucketing
- **Portal UI** — Tenant-facing dashboard for managing agents, API keys, conversations, and analytics
- **Admin console** — Global admin interface for tenant CRUD, user management, provider configuration, and system-wide analytics

## Key Capabilities

### OpenAI-Compatible Proxy
- Drop-in replacement for OpenAI API client libraries
- Supports streaming and non-streaming responses
- Automatic provider routing based on tenant config

**Supported Providers:**
- OpenAI (GPT-4o, GPT-4o mini, GPT-3.5-turbo, etc.)
- Azure OpenAI (with configurable base URL, deployment, API version)

### Multi-Tenant Architecture
- Separate namespaced data per tenant (conversations, traces, agents, API keys)
- Parent-child subtenant hierarchy with inherited agent defaults and analytics rollup
- Per-tenant provider configuration (API keys, base URLs, deployments)

### Agent Management
- Named agents per tenant with configurable:
  - **System prompts** — Custom instructions injected into all requests
  - **Skills/tools** — MCP-compatible tool definitions (with one round-trip MCP call support)
  - **Merge policies** — Control how agent context merges with user requests (prepend/append/overwrite/ignore)
- Agent binding to API keys for strict request isolation

### Conversation Memory
- Persistent multi-turn conversations with optional partitioning (e.g., by user, session, or document)
- Automatic message storage with encryption at rest
- Token-aware summarization: conversations exceeding token limits are automatically summarized via LLM
- Context injection: latest snapshot + unsummarized messages prepended to each request
- Fire-and-forget message storage (non-blocking)

### Trace Recording & Observability
- **What gets recorded:** Request body, response body, model, provider, latency, token counts, status code, gateway overhead, TTFB
- **Encryption:** All trace bodies encrypted per-tenant with AES-256-GCM
- **Partitioning:** Automatic monthly partitioning for efficient retention and compliance
- **Queryable:** Filter by tenant, agent, model, time window; cursor-based pagination

### Analytics
Tracks and reports on:
- **Request volume** — Total requests over time and per model
- **Token consumption** — Prompt, completion, and total tokens
- **Cost estimation** — Per-request and aggregated cost based on model-specific rates
- **Latency** — Average, p95, p99; includes gateway overhead and time-to-first-byte
- **Error rates** — Status >= 400 across time windows
- **Timeseries metrics** — Configurable bucket granularity (default 60 min)
- **Subtenant rollup** — Aggregate metrics across parent and child tenants

### Portal (Tenant UI)
Accessible at `http://localhost:3000` (SPA served by gateway).

Tenant users can:
- Manage API keys
- View and configure agents
- Browse conversation history and snapshots
- View analytics and cost breakdown
- Access traces (with content decryption for authorized users)

### Admin Console
Routes: `/v1/admin/*` (requires JWT authentication)

Admin operations:
- Create/list/update/delete tenants and users
- Manage provider configurations per tenant
- View system-wide analytics and trace audit trail
- Create/revoke tenant API keys

## Architecture

For the full architecture reference — component diagrams, data flows, multi-tenancy model, encryption design, and more — see **[docs/architecture.md](docs/architecture.md)**.

**Stack:** Fastify, undici, PostgreSQL, MikroORM, AES-256-GCM encryption, JWT + API key auth

**Key Components:**
- `src/index.ts` — Server startup, route registration
- `src/agent.ts` — System prompt/skills injection, MCP round-trip handling
- `src/conversations.ts` — Conversation lifecycle, message storage, snapshot creation
- `src/tracing.ts` — Trace recording with batching and async flushing
- `src/analytics.ts` — Time-series metrics and aggregation queries
- `src/providers/` — Provider implementations (OpenAI, Azure, registry)
- `src/routes/` — API routes (admin, portal, dashboard)

## API Compatibility

Loom proxies OpenAI's `/v1/chat/completions` endpoint with extensions:

**Request Extensions:**
- `conversation_id` (optional) — External conversation identifier for memory injection
- `partition_id` (optional) — External partition identifier for hierarchical conversation storage

**Response Extensions:**
- `conversation_id` — Echo of request conversation ID
- `partition_id` — Echo of request partition ID (if provided)
- `X-Loom-Conversation-ID` header — Resolved conversation UUID

## Getting Started

See [Running Locally](RUNNING_LOCALLY.md) to set up a development environment.

## Database Schema

### Core Tables

**tenants**
- `id` (uuid) — Primary key
- `name` (varchar) — Display name
- `status` (varchar) — 'active' or 'inactive'
- `parent_id` (uuid) — Optional parent tenant (for subtenant hierarchy)
- `provider_config` (jsonb) — Provider-specific credentials and settings
- `system_prompt`, `skills`, `mcp_endpoints` (text/jsonb) — Inheritable agent defaults
- `created_at`, `updated_at` (timestamptz)

**api_keys**
- `id` (uuid) — Primary key
- `tenant_id` (uuid) — Foreign key to tenants
- `agent_id` (uuid) — Foreign key to agents (each key bound to one agent)
- `name` (varchar) — Display name
- `key_prefix` (varchar) — First 12 chars of key (for UI display)
- `key_hash` (varchar) — SHA-256 hash of full key (for lookup)
- `status` (varchar) — 'active' or 'revoked'
- `created_at`, `revoked_at` (timestamptz)

**agents**
- `id` (uuid) — Primary key
- `tenant_id` (uuid) — Foreign key to tenants
- `name` (varchar) — Agent display name
- `system_prompt` (text) — Custom system instructions
- `skills` (jsonb) — Tool/function definitions (OpenAI format)
- `mcp_endpoints` (jsonb) — MCP server URLs for tool execution
- `merge_policies` (jsonb) — How to merge agent context (system_prompt, skills, mcp_endpoints strategies)
- `provider_config` (jsonb) — Optional agent-specific provider override
- `conversations_enabled` (boolean) — Whether this agent uses conversation memory
- `conversation_token_limit` (integer) — Token budget before auto-summarization
- `conversation_summary_model` (varchar) — Which model to use for summarization
- `created_at`, `updated_at` (timestamptz)

**traces**
- `id` (uuid) — Primary key
- `tenant_id` (uuid) — Foreign key to tenants
- `agent_id` (uuid) — Foreign key to agents (nullable)
- `request_id` (uuid) — Request trace UUID
- `model` (varchar) — Model name (e.g., 'gpt-4o')
- `provider` (varchar) — Provider name (e.g., 'openai')
- `endpoint` (varchar) — API endpoint path
- `request_body` (jsonb) — Encrypted request (ciphertext in hex)
- `request_iv` (varchar) — Encryption IV
- `response_body` (jsonb) — Encrypted response (nullable, ciphertext in hex)
- `response_iv` (varchar) — Encryption IV (nullable)
- `latency_ms` (integer) — Round-trip latency
- `prompt_tokens`, `completion_tokens`, `total_tokens` (integer) — Token counts
- `status_code` (integer) — HTTP status
- `ttfb_ms` (integer) — Time to first byte
- `gateway_overhead_ms` (integer) — Pre/post-LLM overhead
- `encryption_key_version` (integer) — Key version for decryption
- `created_at` (timestamptz) — Partitioned by month

*Traces are automatically partitioned by month (`traces_YYYY_MM` child tables) for efficient querying and retention.*

**conversations**
- `id` (uuid) — Primary key
- `tenant_id` (uuid) — Foreign key to tenants
- `agent_id` (uuid) — Foreign key to agents (nullable)
- `partition_id` (uuid) — Foreign key to partitions (nullable)
- `external_id` (varchar) — External conversation identifier (from request)
- `created_at`, `last_active_at` (timestamptz)

**conversation_messages**
- `id` (uuid) — Primary key
- `conversation_id` (uuid) — Foreign key to conversations
- `role` (varchar) — 'user', 'assistant', 'system', etc.
- `content_encrypted` (text) — Encrypted message content
- `content_iv` (varchar) — Encryption IV
- `token_estimate` (integer) — Approximate token count
- `trace_id` (uuid) — Optional reference to trace
- `snapshot_id` (uuid) — Optional reference to snapshot (for archival tracking)
- `created_at` (timestamptz)

**conversation_snapshots**
- `id` (uuid) — Primary key
- `conversation_id` (uuid) — Foreign key to conversations
- `summary_encrypted` (text) — Encrypted LLM summary
- `summary_iv` (varchar) — Encryption IV
- `messages_archived` (integer) — Count of messages included in summary
- `created_at` (timestamptz)

**partitions**
- `id` (uuid) — Primary key
- `tenant_id` (uuid) — Foreign key to tenants
- `parent_id` (uuid) — Optional parent partition (for hierarchy)
- `external_id` (varchar) — External partition identifier
- `title_encrypted`, `title_iv` (text/varchar) — Optional encrypted partition title
- `created_at` (timestamptz)

**admin_users**
- `id` (uuid) — Primary key
- `username` (varchar) — Login username
- `password_hash` (varchar) — Scrypt hash (salt:derivedKey)
- `created_at`, `last_login` (timestamptz)

**tenant_memberships**
- `id` (uuid) — Primary key
- `tenant_id` (uuid) — Foreign key to tenants
- `user_id` (uuid) — Foreign key to users
- `role` (varchar) — 'admin', 'member', etc.
- `created_at` (timestamptz)

**users**
- `id` (uuid) — Primary key
- `email` (varchar) — Unique email address
- `password_hash` (varchar) — Scrypt hash
- `created_at` (timestamptz)

**invites**
- `id` (uuid) — Primary key
- `tenant_id` (uuid) — Foreign key to tenants
- `token` (varchar) — Unique invite token
- `max_uses`, `use_count` (integer) — Invite limits
- `expires_at`, `revoked_at` (timestamptz)
