/**
 * H3: Authentication Tests (issue #13)
 *
 * Validates API key authentication middleware behaviour:
 * - Valid key → request passes through with tenant context attached
 * - Invalid / missing key → 401 response
 * - Key formats: Authorization: Bearer <token> and x-api-key header
 * - LRU cache: repeated requests for the same key should hit cache, not re-validate
 *
 * The tests below define the *contract* that Fenster's auth middleware (F3) must satisfy.
 * They run against an inline test gateway that implements the expected auth interface,
 * so the suite is always-on (no external services required).
 *
 * // TODO: verify against Fenster's implementation once src/auth.ts (F3) lands.
 *         Import and swap the inline middleware for the real one; all assertions below
 *         must continue to pass without modification.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ── Inline reference implementation of the expected auth contract ────────────
//
// This mirrors the interface that Fenster's F3 auth middleware must expose.
// Replace with the real import once src/auth.ts ships:
//
//   import { validateApiKey, type TenantContext } from '../src/auth.js';
//
// TODO: verify against Fenster's implementation

export interface TenantContext {
  tenantId: string;
  keyId: string;
}

interface CachedTenant {
  context: TenantContext;
  expiresAt: Date | null;
}

type KeyStore = Map<string, { context: TenantContext; expiresAt: Date | null }>;

/** Minimal LRU cache (bounded Map using insertion-order eviction). */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private lookupCount = new Map<K, number>();

  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    const val = this.cache.get(key);
    if (val !== undefined) {
      // track hit count for test assertions
      this.lookupCount.set(key, (this.lookupCount.get(key) ?? 0) + 1);
      // refresh insertion order (move to end)
      this.cache.delete(key);
      this.cache.set(key, val);
    }
    return val;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.maxSize) {
      // evict oldest
      this.cache.delete(this.cache.keys().next().value!);
    }
    this.cache.set(key, value);
    this.lookupCount.set(key, 0);
  }

  invalidate(key: K): void {
    this.cache.delete(key);
  }

  hits(key: K): number {
    return this.lookupCount.get(key) ?? 0;
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Build an auth-protected Fastify gateway for contract testing.
 *
 * Simulates the behaviour expected from Fenster's auth middleware:
 *  - Reads API key from `Authorization: Bearer <key>` or `x-api-key` header
 *  - Returns 401 for missing or invalid keys
 *  - Attaches TenantContext to the request before the route handler runs
 *  - Caches key lookups in an LRU cache
 *
 * // TODO: verify against Fenster's implementation
 */
function buildAuthGateway(
  port: number,
  keyStore: KeyStore,
  lruCache: LRUCache<string, CachedTenant>
): FastifyInstance {
  const app = Fastify({ logger: false });

  // Attach tenant context type to Fastify request
  app.decorateRequest('tenant', null);

  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Extract API key from Authorization: Bearer <token> or x-api-key header
    let apiKey: string | undefined;

    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.slice(7).trim();
    }

    const xApiKey = request.headers['x-api-key'];
    if (!apiKey && typeof xApiKey === 'string') {
      apiKey = xApiKey.trim();
    }

    if (!apiKey) {
      return reply.code(401).send({ error: { message: 'Missing API key', type: 'auth_error' } });
    }

    // Check LRU cache first
    let cached = lruCache.get(apiKey);

    // Evict expired keys from cache
    if (cached && cached.expiresAt && cached.expiresAt.getTime() < Date.now()) {
      lruCache.invalidate(apiKey);
      return reply.code(401).send({ error: { message: 'API key has expired', type: 'auth_error', code: 'expired_api_key' } });
    }

    if (!cached) {
      // Fall back to key store (simulates DB lookup in real impl)
      const stored = keyStore.get(apiKey);
      if (!stored) {
        return reply.code(401).send({ error: { message: 'Invalid API key', type: 'auth_error' } });
      }
      // Check expiry on initial load (mirrors TenantService.loadByApiKey behavior)
      if (stored.expiresAt && stored.expiresAt.getTime() < Date.now()) {
        return reply.code(401).send({ error: { message: 'API key has expired', type: 'auth_error', code: 'expired_api_key' } });
      }
      cached = stored;
      lruCache.set(apiKey, cached);
    }

    // Attach tenant context to request
    (request as any).tenant = cached.context;
  });

  // Echo endpoint — returns the tenant context attached by auth middleware
  app.post('/v1/chat/completions', async (request: FastifyRequest) => {
    return { tenant: (request as any).tenant };
  });

  return app;
}

// ── fixtures ─────────────────────────────────────────────────────────────────

const VALID_KEY = 'sk-loom-valid-key-abc123';
const VALID_KEY_2 = 'sk-loom-valid-key-def456';
const INVALID_KEY = 'sk-loom-bogus-key-xyz';
const EXPIRED_KEY = 'sk-loom-expired-key-ghi789';
const FUTURE_EXPIRY_KEY = 'sk-loom-future-expiry-jkl012';

const keyStore: KeyStore = new Map([
  [VALID_KEY, { context: { tenantId: 'tenant-001', keyId: 'key-001' }, expiresAt: null }],
  [VALID_KEY_2, { context: { tenantId: 'tenant-002', keyId: 'key-002' }, expiresAt: null }],
  [EXPIRED_KEY, { context: { tenantId: 'tenant-003', keyId: 'key-003' }, expiresAt: new Date(Date.now() - 60_000) }],
  [FUTURE_EXPIRY_KEY, { context: { tenantId: 'tenant-004', keyId: 'key-004' }, expiresAt: new Date(Date.now() + 86_400_000) }],
]);

// ── tests ─────────────────────────────────────────────────────────────────────

describe('auth — valid key passes through with tenant context', () => {
  let app: FastifyInstance;
  let lru: LRUCache<string, CachedTenant>;

  beforeAll(async () => {
    lru = new LRUCache(100);
    app = buildAuthGateway(3021, keyStore, lru);
    await app.listen({ port: 3021, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('Bearer token: valid key should return 200 and attach tenant context', async () => {
    const res = await fetch('http://127.0.0.1:3021/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VALID_KEY}`,
      },
      body: JSON.stringify({ model: 'gpt-4', messages: [] }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tenant).toMatchObject({ tenantId: 'tenant-001', keyId: 'key-001' });
  });

  it('x-api-key header: valid key should return 200 and attach tenant context', async () => {
    const res = await fetch('http://127.0.0.1:3021/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': VALID_KEY_2,
      },
      body: JSON.stringify({ model: 'gpt-4', messages: [] }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tenant).toMatchObject({ tenantId: 'tenant-002', keyId: 'key-002' });
  });

  it('tenant context should include tenantId and keyId fields', async () => {
    const res = await fetch('http://127.0.0.1:3021/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': VALID_KEY },
      body: JSON.stringify({}),
    });

    const data = await res.json();
    expect(data.tenant).toHaveProperty('tenantId');
    expect(data.tenant).toHaveProperty('keyId');
    expect(typeof data.tenant.tenantId).toBe('string');
    expect(typeof data.tenant.keyId).toBe('string');
  });
});

describe('auth — invalid or missing key returns 401', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const lru = new LRUCache<string, CachedTenant>(100);
    app = buildAuthGateway(3022, keyStore, lru);
    await app.listen({ port: 3022, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('missing Authorization and x-api-key → 401', async () => {
    const res = await fetch('http://127.0.0.1:3022/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4', messages: [] }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it('invalid Bearer token → 401', async () => {
    const res = await fetch('http://127.0.0.1:3022/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INVALID_KEY}`,
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error.type).toBe('auth_error');
  });

  it('invalid x-api-key → 401', async () => {
    const res = await fetch('http://127.0.0.1:3022/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': INVALID_KEY,
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });

  it('empty Bearer token value → 401', async () => {
    const res = await fetch('http://127.0.0.1:3022/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });

  it('malformed Authorization header (not Bearer scheme) → 401', async () => {
    const res = await fetch('http://127.0.0.1:3022/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${VALID_KEY}`,
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });
});

describe('auth — LRU cache behaviour', () => {
  let app: FastifyInstance;
  let lru: LRUCache<string, CachedTenant>;

  beforeAll(async () => {
    lru = new LRUCache(100);
    app = buildAuthGateway(3023, keyStore, lru);
    await app.listen({ port: 3023, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('first request for a key should populate the cache', async () => {
    expect(lru.size()).toBe(0);

    await fetch('http://127.0.0.1:3023/v1/chat/completions', {
      method: 'POST',
      headers: { 'x-api-key': VALID_KEY },
      body: JSON.stringify({}),
    });

    expect(lru.size()).toBe(1);
  });

  it('second request for the same key should hit cache (not re-validate from store)', async () => {
    // First request populates cache
    await fetch('http://127.0.0.1:3023/v1/chat/completions', {
      method: 'POST',
      headers: { 'x-api-key': VALID_KEY },
      body: JSON.stringify({}),
    });

    const hitsAfterFirst = lru.hits(VALID_KEY);

    // Second request
    await fetch('http://127.0.0.1:3023/v1/chat/completions', {
      method: 'POST',
      headers: { 'x-api-key': VALID_KEY },
      body: JSON.stringify({}),
    });

    // Cache hit count should have increased
    expect(lru.hits(VALID_KEY)).toBeGreaterThan(hitsAfterFirst);
  });

  it('cache evicts oldest entry when max size is reached', () => {
    const tinyCache = new LRUCache<string, CachedTenant>(2);
    const ctx = (id: string): CachedTenant => ({ context: { tenantId: id, keyId: id }, expiresAt: null });

    tinyCache.set('key-a', ctx('a'));
    tinyCache.set('key-b', ctx('b'));
    expect(tinyCache.size()).toBe(2);

    // Adding a third entry should evict the oldest (key-a)
    tinyCache.set('key-c', ctx('c'));
    expect(tinyCache.size()).toBe(2);
    expect(tinyCache.get('key-a')).toBeUndefined();
    expect(tinyCache.get('key-c')).toBeDefined();
  });

  it('accessing a key should refresh its LRU position (most-recently-used stays)', () => {
    const tinyCache = new LRUCache<string, CachedTenant>(2);
    const ctx = (id: string): CachedTenant => ({ context: { tenantId: id, keyId: id }, expiresAt: null });

    tinyCache.set('key-a', ctx('a'));
    tinyCache.set('key-b', ctx('b'));

    // Access key-a to make it most recent
    tinyCache.get('key-a');

    // Adding key-c should now evict key-b (oldest since key-a was refreshed)
    tinyCache.set('key-c', ctx('c'));

    expect(tinyCache.get('key-a')).toBeDefined();
    expect(tinyCache.get('key-b')).toBeUndefined();
    expect(tinyCache.get('key-c')).toBeDefined();
  });
});

describe('auth — multi-tenant isolation', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const lru = new LRUCache<string, CachedTenant>(100);
    app = buildAuthGateway(3024, keyStore, lru);
    await app.listen({ port: 3024, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('different API keys should yield different tenant contexts', async () => {
    const [res1, res2] = await Promise.all([
      fetch('http://127.0.0.1:3024/v1/chat/completions', {
        method: 'POST',
        headers: { 'x-api-key': VALID_KEY },
        body: JSON.stringify({}),
      }),
      fetch('http://127.0.0.1:3024/v1/chat/completions', {
        method: 'POST',
        headers: { 'x-api-key': VALID_KEY_2 },
        body: JSON.stringify({}),
      }),
    ]);

    const [data1, data2] = await Promise.all([res1.json(), res2.json()]);

    expect(data1.tenant.tenantId).not.toBe(data2.tenant.tenantId);
    expect(data1.tenant.keyId).not.toBe(data2.tenant.keyId);
  });
});

describe('auth — API key expiry', () => {
  let app: FastifyInstance;
  let lru: LRUCache<string, CachedTenant>;

  beforeAll(async () => {
    lru = new LRUCache(100);
    app = buildAuthGateway(3025, keyStore, lru);
    await app.listen({ port: 3025, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('expired key should return 401 with expired_api_key code', async () => {
    const res = await fetch('http://127.0.0.1:3025/v1/chat/completions', {
      method: 'POST',
      headers: { 'x-api-key': EXPIRED_KEY },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error.code).toBe('expired_api_key');
    expect(data.error.message).toContain('expired');
  });

  it('key with future expiresAt should pass through normally', async () => {
    const res = await fetch('http://127.0.0.1:3025/v1/chat/completions', {
      method: 'POST',
      headers: { 'x-api-key': FUTURE_EXPIRY_KEY },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tenant.tenantId).toBe('tenant-004');
  });

  it('key with null expiresAt (never expires) should pass through', async () => {
    const res = await fetch('http://127.0.0.1:3025/v1/chat/completions', {
      method: 'POST',
      headers: { 'x-api-key': VALID_KEY },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tenant.tenantId).toBe('tenant-001');
  });

  it('expired key in cache should be evicted and return 401', async () => {
    // Pre-populate cache with an expired entry
    const expiredCached: CachedTenant = {
      context: { tenantId: 'tenant-cached-expired', keyId: 'key-cached-expired' },
      expiresAt: new Date(Date.now() - 1000),
    };
    lru.set('sk-cached-expired', expiredCached);
    expect(lru.size()).toBeGreaterThan(0);

    const res = await fetch('http://127.0.0.1:3025/v1/chat/completions', {
      method: 'POST',
      headers: { 'x-api-key': 'sk-cached-expired' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error.code).toBe('expired_api_key');
  });
});
