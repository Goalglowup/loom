/**
 * Portal routes integration tests
 *
 * Tests portal auth and agent routes via fastify.inject().
 * Mocks pg.Pool to match real query patterns in src/routes/portal.ts.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { createSigner } from 'fast-jwt';
import { registerPortalRoutes } from '../src/routes/portal.js';

const scryptAsync = promisify(scrypt);

const TEST_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
// Must match the default used in src/routes/portal.ts and src/middleware/portalAuth.ts
const PORTAL_JWT_SECRET = 'unsafe-portal-secret-change-in-production';
const signPortalToken = createSigner({ key: PORTAL_JWT_SECRET, expiresIn: 86400000 });

// Pre-hashed password for 'Password1!' (computed once in beforeAll)
let PASSWORD_HASH: string;
const TEST_PASSWORD = 'Password1!';
const TEST_USER_ID = 'user-uuid-0001';
const TEST_USER_EMAIL = 'existing@example.com';
const TEST_TENANT_ID = 'tenant-uuid-0001';
const TEST_TENANT_NAME = 'Existing Tenant';
const TEST_AGENT_ID = 'agent-uuid-0001';
const TEST_AGENT_NAME = 'Default';

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

beforeAll(async () => {
  PASSWORD_HASH = await hashPassword(TEST_PASSWORD);
});

// ── Mock pool builder ───────────────────────────────────────────────────────

/**
 * Build a mock pg.Pool using SQL pattern matching.
 * Accepts an overrides map (SQL keyword → custom handler) for per-test customisation.
 */
function buildMockPool(
  overrides: Record<string, (params: unknown[]) => { rows: unknown[] }> = {},
) {
  const queryFn = vi.fn().mockImplementation((sql: string, params: unknown[] = []) => {
    const s = sql.toLowerCase().trim();

    // Check overrides first
    for (const [key, handler] of Object.entries(overrides)) {
      if (s.includes(key.toLowerCase())) {
        return Promise.resolve(handler(params));
      }
    }

    // BEGIN / COMMIT / ROLLBACK
    if (s === 'begin' || s === 'commit' || s === 'rollback') {
      return Promise.resolve({ rows: [] });
    }

    // Signup: check email exists
    if (s.includes('select id from users where email')) {
      return Promise.resolve({ rows: [] }); // no duplicate by default
    }

    // Login: look up user by email + password_hash
    if (s.includes('select id, email, password_hash from users where email')) {
      const email = params[0] as string;
      if (email === TEST_USER_EMAIL.toLowerCase()) {
        return Promise.resolve({
          rows: [{ id: TEST_USER_ID, email: TEST_USER_EMAIL, password_hash: PASSWORD_HASH }],
        });
      }
      return Promise.resolve({ rows: [] });
    }

    // Login: memberships for user
    if (s.includes('from tenant_memberships tm') && s.includes("t.status = 'active'") && s.includes('order by tm.joined_at')) {
      return Promise.resolve({
        rows: [{
          tenant_id: TEST_TENANT_ID,
          tenant_name: TEST_TENANT_NAME,
          role: 'owner',
          tenant_status: 'active',
        }],
      });
    }

    // Login: update last_login
    if (s.includes('update users set last_login')) {
      return Promise.resolve({ rows: [] });
    }

    // Signup: insert tenant
    if (s.includes('insert into tenants') && s.includes('name')) {
      const name = params[0] as string;
      return Promise.resolve({ rows: [{ id: 'new-tenant-id', name }] });
    }

    // Signup: insert user
    if (s.includes('insert into users')) {
      const email = params[0] as string;
      return Promise.resolve({ rows: [{ id: 'new-user-id', email }] });
    }

    // Signup / me: insert tenant_memberships
    if (s.includes('insert into tenant_memberships')) {
      return Promise.resolve({ rows: [] });
    }

    // Signup / create agent: insert into agents
    if (s.includes('insert into agents') && !s.includes('returning')) {
      return Promise.resolve({ rows: [] });
    }

    // GET /me — user+tenant join query
    if (
      s.includes('select u.id, u.email, tm.role') &&
      s.includes('join tenants t on t.id = tm.tenant_id') ||
      (s.includes('u.email') && s.includes('tm.role') && s.includes('t.id as tenant_id'))
    ) {
      return Promise.resolve({
        rows: [{
          id: TEST_USER_ID,
          email: TEST_USER_EMAIL,
          role: 'owner',
          tenant_id: TEST_TENANT_ID,
          tenant_name: TEST_TENANT_NAME,
          provider_config: null,
          available_models: null,
        }],
      });
    }

    // GET /me — all tenants for the user
    if (s.includes('select tm.tenant_id, t.name as tenant_name, tm.role') && s.includes('where tm.user_id = $1')) {
      return Promise.resolve({
        rows: [{ tenant_id: TEST_TENANT_ID, tenant_name: TEST_TENANT_NAME, role: 'owner' }],
      });
    }

    // GET /me — agents for the tenant
    if (s.includes('select id, name from agents where tenant_id')) {
      return Promise.resolve({
        rows: [{ id: TEST_AGENT_ID, name: TEST_AGENT_NAME }],
      });
    }

    // GET /me — subtenants
    if (s.includes('select id, name, status from tenants where parent_id')) {
      return Promise.resolve({ rows: [] });
    }

    // GET /agents — full agent list
    if (
      s.includes('select id, name, provider_config') &&
      s.includes('from agents where tenant_id')
    ) {
      return Promise.resolve({
        rows: [{
          id: TEST_AGENT_ID,
          name: TEST_AGENT_NAME,
          provider_config: null,
          system_prompt: null,
          skills: null,
          mcp_endpoints: null,
          merge_policies: { system_prompt: 'prepend', skills: 'merge', mcp_endpoints: 'merge' },
          available_models: null,
          conversations_enabled: false,
          conversation_token_limit: null,
          conversation_summary_model: null,
          created_at: new Date().toISOString(),
          updated_at: null,
        }],
      });
    }

    // POST /agents — insert with RETURNING
    if (s.includes('insert into agents') && s.includes('returning')) {
      return Promise.resolve({
        rows: [{
          id: 'new-agent-id',
          name: params[1] as string ?? 'My Agent',
          provider_config: null,
          system_prompt: null,
          skills: null,
          mcp_endpoints: null,
          merge_policies: { system_prompt: 'prepend', skills: 'merge', mcp_endpoints: 'merge' },
          created_at: new Date().toISOString(),
          updated_at: null,
        }],
      });
    }

    // GET /agents/:id — agent with membership join
    if (s.includes('from agents a') && s.includes('join tenant_memberships tm on tm.tenant_id = a.tenant_id')) {
      const agentId = params[0] as string;
      if (agentId === TEST_AGENT_ID) {
        return Promise.resolve({
          rows: [{
            id: TEST_AGENT_ID,
            name: TEST_AGENT_NAME,
            provider_config: null,
            system_prompt: null,
            skills: null,
            mcp_endpoints: null,
            merge_policies: { system_prompt: 'prepend', skills: 'merge', mcp_endpoints: 'merge' },
            available_models: null,
            conversations_enabled: false,
            conversation_token_limit: null,
            conversation_summary_model: null,
            created_at: new Date().toISOString(),
            updated_at: null,
          }],
        });
      }
      return Promise.resolve({ rows: [] }); // not found
    }

    // Fallback
    return Promise.resolve({ rows: [] });
  });

  return { query: queryFn } as unknown as import('pg').Pool;
}

// ── App builder ─────────────────────────────────────────────────────────────

async function buildApp(pool: import('pg').Pool): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerPortalRoutes(app, pool);
  await app.ready();
  return app;
}

/** Sign a JWT as if the user is already logged in. */
function authToken(userId = TEST_USER_ID, tenantId = TEST_TENANT_ID, role = 'owner'): string {
  return signPortalToken({ sub: userId, tenantId, role }) as string;
}

// ── POST /v1/portal/auth/signup ─────────────────────────────────────────────

describe('POST /v1/portal/auth/signup', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    app = await buildApp(buildMockPool());
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ENCRYPTION_MASTER_KEY;
  });

  it('creates a new user and tenant, returns 201 with token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/auth/signup',
      payload: {
        email: 'newuser@example.com',
        password: 'Password1!',
        tenantName: 'My New Tenant',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ token: string; user: { email: string }; tenant: { name: string } }>();
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe('string');
    expect(body.user.email).toBe('newuser@example.com');
    expect(body.tenant.name).toBe('My New Tenant');
  });

  it('returns 409 when email is already registered', async () => {
    // Override email check to return existing user
    const pool = buildMockPool({
      'select id from users where email': () => ({ rows: [{ id: 'existing-id' }] }),
    });
    const localApp = await buildApp(pool);

    const res = await localApp.inject({
      method: 'POST',
      url: '/v1/portal/auth/signup',
      payload: { email: 'existing@example.com', password: 'Password1!', tenantName: 'Tenant' },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json<{ error: string }>();
    expect(body.error).toContain('Email already registered');

    await localApp.close();
  });

  it('returns 400 when email is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/auth/signup',
      payload: { password: 'Password1!', tenantName: 'Tenant' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when password is too short', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/auth/signup',
      payload: { email: 'test@example.com', password: 'abc', tenantName: 'Tenant' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toContain('Password must be at least 8 characters');
  });

  it('returns 400 when tenantName is missing for regular signup', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/auth/signup',
      payload: { email: 'test@example.com', password: 'Password1!' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toContain('tenantName is required');
  });
});

// ── POST /v1/portal/auth/login ──────────────────────────────────────────────

describe('POST /v1/portal/auth/login', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    app = await buildApp(buildMockPool());
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ENCRYPTION_MASTER_KEY;
  });

  it('returns 200 with token and tenant info on valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/auth/login',
      payload: { email: TEST_USER_EMAIL, password: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      token: string;
      user: { id: string; email: string };
      tenant: { id: string; name: string };
      tenants: unknown[];
    }>();
    expect(body.token).toBeDefined();
    expect(body.user.email).toBe(TEST_USER_EMAIL);
    expect(body.tenant.id).toBe(TEST_TENANT_ID);
    expect(body.tenant.name).toBe(TEST_TENANT_NAME);
    expect(Array.isArray(body.tenants)).toBe(true);
  });

  it('returns 401 when user does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/auth/login',
      payload: { email: 'nobody@example.com', password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe('Invalid credentials');
  });

  it('returns 401 when password is wrong', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/auth/login',
      payload: { email: TEST_USER_EMAIL, password: 'WrongPassword99' },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe('Invalid credentials');
  });

  it('returns 400 when email or password is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/auth/login',
      payload: { email: TEST_USER_EMAIL },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── GET /v1/portal/me ───────────────────────────────────────────────────────

describe('GET /v1/portal/me', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    app = await buildApp(buildMockPool());
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ENCRYPTION_MASTER_KEY;
  });

  it('returns user, tenant, agents, and subtenants for authenticated user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/portal/me',
      headers: { authorization: `Bearer ${authToken()}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      user: { id: string; email: string; role: string };
      tenant: { id: string; name: string };
      agents: unknown[];
      tenants: unknown[];
    }>();
    expect(body.user.id).toBe(TEST_USER_ID);
    expect(body.user.email).toBe(TEST_USER_EMAIL);
    expect(body.tenant.id).toBe(TEST_TENANT_ID);
    expect(Array.isArray(body.agents)).toBe(true);
    expect(Array.isArray(body.tenants)).toBe(true);
  });

  it('returns 401 when no authorization header is provided', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/portal/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when token is invalid', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/portal/me',
      headers: { authorization: 'Bearer notarealtoken' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when user/tenant record not found', async () => {
    const pool = buildMockPool({
      // Override the me query to return nothing
      'select u.id, u.email': () => ({ rows: [] }),
    });
    const localApp = await buildApp(pool);

    const res = await localApp.inject({
      method: 'GET',
      url: '/v1/portal/me',
      headers: { authorization: `Bearer ${authToken()}` },
    });

    expect(res.statusCode).toBe(404);
    await localApp.close();
  });
});

// ── GET /v1/portal/agents ───────────────────────────────────────────────────

describe('GET /v1/portal/agents', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    app = await buildApp(buildMockPool());
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ENCRYPTION_MASTER_KEY;
  });

  it('returns agents list for authenticated user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/portal/agents',
      headers: { authorization: `Bearer ${authToken()}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ agents: Array<{ id: string; name: string }> }>();
    expect(Array.isArray(body.agents)).toBe(true);
    expect(body.agents.length).toBeGreaterThan(0);
    expect(body.agents[0].id).toBe(TEST_AGENT_ID);
    expect(body.agents[0].name).toBe(TEST_AGENT_NAME);
  });

  it('returns 401 without auth token', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/portal/agents' });
    expect(res.statusCode).toBe(401);
  });

  it('returns empty agents array when tenant has no agents', async () => {
    const pool = buildMockPool({
      'from agents where tenant_id': () => ({ rows: [] }),
    });
    const localApp = await buildApp(pool);

    const res = await localApp.inject({
      method: 'GET',
      url: '/v1/portal/agents',
      headers: { authorization: `Bearer ${authToken()}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ agents: unknown[] }>();
    expect(body.agents).toEqual([]);
    await localApp.close();
  });
});

// ── POST /v1/portal/agents ──────────────────────────────────────────────────

describe('POST /v1/portal/agents', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    app = await buildApp(buildMockPool());
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ENCRYPTION_MASTER_KEY;
  });

  it('creates agent and returns 201 with agent object', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/agents',
      headers: { authorization: `Bearer ${authToken()}` },
      payload: { name: 'Customer Support Bot' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ agent: { id: string; name: string } }>();
    expect(body.agent).toBeDefined();
    expect(body.agent.id).toBe('new-agent-id');
  });

  it('returns 400 when name is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/agents',
      headers: { authorization: `Bearer ${authToken()}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toContain('name is required');
  });

  it('returns 401 without auth token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/agents',
      payload: { name: 'Bot' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── GET /v1/portal/agents/:id ───────────────────────────────────────────────

describe('GET /v1/portal/agents/:id', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    app = await buildApp(buildMockPool());
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ENCRYPTION_MASTER_KEY;
  });

  it('returns agent when found', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/portal/agents/${TEST_AGENT_ID}`,
      headers: { authorization: `Bearer ${authToken()}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ agent: { id: string; name: string } }>();
    expect(body.agent.id).toBe(TEST_AGENT_ID);
    expect(body.agent.name).toBe(TEST_AGENT_NAME);
  });

  it('returns 404 when agent does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/portal/agents/nonexistent-agent-id',
      headers: { authorization: `Bearer ${authToken()}` },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json<{ error: string }>();
    expect(body.error).toContain('Agent not found');
  });

  it('returns 401 without auth token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/portal/agents/${TEST_AGENT_ID}`,
    });
    expect(res.statusCode).toBe(401);
  });
});
