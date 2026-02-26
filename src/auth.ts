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

export interface TenantContext {
  tenantId: string;
  name: string;
  providerConfig?: TenantProviderConfig;
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
  const result = await pool.query<{
    tenant_id: string;
    tenant_name: string;
    provider_config: TenantProviderConfig | null;
  }>(
    `SELECT t.id          AS tenant_id,
            t.name        AS tenant_name,
            t.provider_config
     FROM   api_keys ak
     JOIN   tenants  t  ON ak.tenant_id = t.id
     WHERE  ak.key_hash = $1
       AND  ak.status = 'active'
       AND  t.status = 'active'
     LIMIT  1`,
    [keyHash],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    tenantId: row.tenant_id,
    name: row.tenant_name,
    providerConfig: row.provider_config ?? undefined,
  };
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
