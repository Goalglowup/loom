import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import pg from 'pg';

export interface TenantProviderConfig {
  provider: 'openai' | 'azure' | 'ollama';
  apiKey: string;
  baseUrl?: string;       // OpenAI base URL or Azure endpoint
  deployment?: string;    // Azure deployment name
  apiVersion?: string;    // Azure API version (e.g. 2024-02-01)
}

export interface MergePolicy {
  system_prompt?: 'prepend' | 'append' | 'overwrite' | 'ignore';
  skills?: 'merge' | 'overwrite' | 'ignore';
}

export interface AgentConfig {
  conversations_enabled?: boolean;
  conversation_token_limit?: number;
  conversation_summary_model?: string | null;
}

export interface TenantContext {
  tenantId: string;
  name: string;
  /** Resolved provider config: agent → tenant → parent chain → ENV fallback. */
  providerConfig?: TenantProviderConfig;
  /** ID of the agent bound to the API key used for this request. */
  agentId?: string;
  /** Raw agent system prompt (before any merge). */
  agentSystemPrompt?: string;
  /** Raw agent skills (OpenAI tool objects). */
  agentSkills?: any[];
  /** Raw agent MCP endpoint definitions. */
  agentMcpEndpoints?: any[];
  /** Merge policies controlling how agent config is applied to requests. */
  mergePolicies: MergePolicy;
  /** Chain-resolved system prompt (agent → tenant → parent…). */
  resolvedSystemPrompt?: string;
  /** Chain-resolved skills union (agent skills take precedence on name conflict). */
  resolvedSkills?: any[];
  /** Chain-resolved MCP endpoints union. */
  resolvedMcpEndpoints?: any[];
  /** Agent-level configuration (conversations, token limits, etc.). */
  agentConfig?: AgentConfig;
}

// Augment Fastify request type with tenant context
declare module 'fastify' {
  interface FastifyRequest {
    tenant?: TenantContext;
  }
}

// Simple LRU cache backed by an insertion-ordered Map.
// On access, entries are moved to the tail; on overflow, the head is evicted.
class LRUCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Evict least recently used (first/oldest entry)
      this.map.delete(this.map.keys().next().value as K);
    }
    this.map.set(key, value);
  }

  invalidate(key: K): void {
    this.map.delete(key);
  }
}

// Shared cache — 1 000 tenants; adjust if tenant count grows significantly
const tenantCache = new LRUCache<string, TenantContext>(1000);

function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

async function lookupTenant(keyHash: string, pool: pg.Pool): Promise<TenantContext | null> {
  // Step 1: Fetch api_key → agent → immediate tenant in one query.
  const keyResult = await pool.query<{
    tenant_id: string;
    tenant_name: string;
    tenant_parent_id: string | null;
    agent_id: string | null;
    agent_provider_config: TenantProviderConfig | null;
    agent_system_prompt: string | null;
    agent_skills: any[] | null;
    agent_mcp_endpoints: any[] | null;
    merge_policies: MergePolicy | null;
    tenant_provider_config: TenantProviderConfig | null;
    tenant_system_prompt: string | null;
    tenant_skills: any[] | null;
    tenant_mcp_endpoints: any[] | null;
    agent_conversations_enabled: boolean | null;
    agent_conversation_token_limit: number | null;
    agent_conversation_summary_model: string | null;
  }>(
    `SELECT ak.tenant_id,
            t.name        AS tenant_name,
            t.parent_id   AS tenant_parent_id,
            ak.agent_id,
            a.provider_config AS agent_provider_config,
            a.system_prompt   AS agent_system_prompt,
            a.skills          AS agent_skills,
            a.mcp_endpoints   AS agent_mcp_endpoints,
            a.merge_policies,
            t.provider_config AS tenant_provider_config,
            t.system_prompt   AS tenant_system_prompt,
            t.skills          AS tenant_skills,
            t.mcp_endpoints   AS tenant_mcp_endpoints,
            a.conversations_enabled        AS agent_conversations_enabled,
            a.conversation_token_limit     AS agent_conversation_token_limit,
            a.conversation_summary_model   AS agent_conversation_summary_model
     FROM   api_keys ak
     LEFT JOIN agents  a ON a.id = ak.agent_id
     JOIN  tenants  t ON t.id = ak.tenant_id
     WHERE  ak.key_hash = $1
       AND  ak.status = 'active'
       AND  t.status = 'active'
     LIMIT  1`,
    [keyHash],
  );

  if (keyResult.rows.length === 0) return null;
  const row = keyResult.rows[0];

  // Step 2: Walk the parent chain via recursive CTE (max 10 hops).
  let chainRows: Array<{
    provider_config: TenantProviderConfig | null;
    system_prompt: string | null;
    skills: any[] | null;
    mcp_endpoints: any[] | null;
  }> = [];

  if (row.tenant_parent_id) {
    const chainResult = await pool.query(
      `WITH RECURSIVE tenant_chain AS (
         SELECT id, parent_id, provider_config, system_prompt, skills, mcp_endpoints, 0 AS level
         FROM   tenants WHERE id = $1
         UNION ALL
         SELECT t.id, t.parent_id, t.provider_config, t.system_prompt, t.skills, t.mcp_endpoints, tc.level + 1
         FROM   tenants t
         JOIN   tenant_chain tc ON t.id = tc.parent_id
         WHERE  tc.level < 10
       )
       SELECT provider_config, system_prompt, skills, mcp_endpoints
       FROM   tenant_chain
       ORDER BY level`,
      [row.tenant_parent_id],
    );
    chainRows = chainResult.rows;
  }

  // Step 3: Build the ordered chain: agent → immediate tenant → parent chain.
  type ChainEntry = {
    provider_config: TenantProviderConfig | null;
    system_prompt: string | null;
    skills: any[] | null;
    mcp_endpoints: any[] | null;
  };
  const chain: ChainEntry[] = [
    {
      provider_config: row.agent_provider_config,
      system_prompt: row.agent_system_prompt,
      skills: row.agent_skills,
      mcp_endpoints: row.agent_mcp_endpoints,
    },
    {
      provider_config: row.tenant_provider_config,
      system_prompt: row.tenant_system_prompt,
      skills: row.tenant_skills,
      mcp_endpoints: row.tenant_mcp_endpoints,
    },
    ...chainRows,
  ];

  // provider_config: first non-null wins
  const resolvedProviderConfig =
    chain.find((c) => c.provider_config != null)?.provider_config ?? undefined;

  // system_prompt: first non-null wins
  const resolvedSystemPrompt =
    chain.find((c) => c.system_prompt != null)?.system_prompt ?? undefined;

  // skills: union — entries earlier in chain take precedence on name conflict
  const resolvedSkills = resolveArrayChain(
    chain.map((c) => c.skills).filter(Boolean) as any[][],
    (item) => item?.function?.name ?? item?.name,
  );

  // mcp_endpoints: union — entries earlier in chain take precedence on name conflict
  const resolvedMcpEndpoints = resolveArrayChain(
    chain.map((c) => c.mcp_endpoints).filter(Boolean) as any[][],
    (item) => item?.name,
  );

  const mergePolicies: MergePolicy = row.merge_policies ?? {
    system_prompt: 'prepend',
    skills: 'merge',
  };

  return {
    tenantId: row.tenant_id,
    name: row.tenant_name,
    agentId: row.agent_id ?? undefined,
    providerConfig: resolvedProviderConfig,
    agentSystemPrompt: row.agent_system_prompt ?? undefined,
    agentSkills: row.agent_skills ?? undefined,
    agentMcpEndpoints: row.agent_mcp_endpoints ?? undefined,
    mergePolicies,
    resolvedSystemPrompt,
    resolvedSkills: resolvedSkills.length ? resolvedSkills : undefined,
    resolvedMcpEndpoints: resolvedMcpEndpoints.length ? resolvedMcpEndpoints : undefined,
    agentConfig: {
      conversations_enabled: row.agent_conversations_enabled ?? false,
      conversation_token_limit: row.agent_conversation_token_limit ?? 4000,
      conversation_summary_model: row.agent_conversation_summary_model ?? null,
    },
  };
}

/** Union arrays from multiple sources; items earlier in the list win on name conflict. */
function resolveArrayChain(arrays: any[][], nameOf: (item: any) => string | undefined): any[] {
  const seen = new Set<string>();
  const result: any[] = [];
  for (const arr of arrays) {
    for (const item of arr) {
      const name = nameOf(item);
      if (name && !seen.has(name)) {
        seen.add(name);
        result.push(item);
      } else if (!name) {
        result.push(item); // unnamed items are always included
      }
    }
  }
  return result;
}

/**
 * Register tenant auth middleware on the Fastify instance.
 *
 * - Validates the incoming API key (Authorization: Bearer <key> or x-api-key header)
 * - Checks an LRU cache before hitting the database to stay well under the 20ms overhead budget
 * - Attaches the resolved TenantContext to request.tenant for downstream handlers
 * - Skips auth for /health and /dashboard/* routes
 */
export function registerAuthMiddleware(fastify: FastifyInstance, pool: pg.Pool): void {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Public routes — no auth required
    // Skip tenant API key auth for /v1/admin routes (they use JWT auth)
    if (request.url === '/health' || request.url === '/favicon.ico' || request.url.startsWith('/dashboard') || request.url.startsWith('/v1/admin') || request.url.startsWith('/v1/portal') || !request.url.startsWith('/v1/')) {
      return;
    }

    // Accept key from Authorization: Bearer <key> or x-api-key header
    const authHeader = request.headers['authorization'];
    const xApiKey = request.headers['x-api-key'];

    let rawKey: string | undefined;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      rawKey = authHeader.slice(7).trim();
    } else if (typeof xApiKey === 'string') {
      rawKey = xApiKey.trim();
    }

    if (!rawKey) {
      return reply.code(401).send({
        error: {
          message: 'Missing API key. Provide it via "Authorization: Bearer <key>" or "x-api-key" header.',
          type: 'invalid_request_error',
          code: 'missing_api_key',
        },
      });
    }

    const keyHash = hashApiKey(rawKey);

    // LRU cache hit — no DB query needed
    let tenant = tenantCache.get(keyHash);

    if (!tenant) {
      const found = await lookupTenant(keyHash, pool);
      if (found) {
        tenantCache.set(keyHash, found);
        tenant = found;
      }
    }

    if (!tenant) {
      return reply.code(401).send({
        error: {
          message: 'Invalid API key.',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      });
    }

    request.tenant = tenant;
  });
}

/**
 * Invalidate a single cached key lookup by its hash.
 * Use when an API key is revoked or its associated tenant is deactivated.
 */
export function invalidateCachedKey(keyHash: string): void {
  tenantCache.invalidate(keyHash);
}

/**
 * Invalidate all cached keys for a tenant.
 * Use when a tenant is deactivated to ensure all their keys are removed from cache.
 */
export async function invalidateAllKeysForTenant(tenantId: string, pool: pg.Pool): Promise<void> {
  const result = await pool.query<{ key_hash: string }>(
    'SELECT key_hash FROM api_keys WHERE tenant_id = $1',
    [tenantId]
  );
  for (const row of result.rows) {
    tenantCache.invalidate(row.key_hash);
  }
}
