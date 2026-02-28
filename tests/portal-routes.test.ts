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

// ── Mock service builders ─────────────────────────────────────────────────

import { PortalService } from '../src/application/services/PortalService.js';
import { ConversationManagementService } from '../src/application/services/ConversationManagementService.js';

function buildMockConvSvc(): ConversationManagementService {
  return {
    getOrCreatePartition: vi.fn().mockResolvedValue({ id: 'part-uuid' }),
    getOrCreateConversation: vi.fn().mockResolvedValue({ id: 'conv-uuid', isNew: true }),
    loadContext: vi.fn().mockResolvedValue({ messages: [], tokenEstimate: 0, latestSnapshotId: null, latestSnapshotSummary: undefined }),
    buildInjectionMessages: vi.fn().mockReturnValue([]),
    storeMessages: vi.fn().mockResolvedValue(undefined),
    createSnapshot: vi.fn().mockResolvedValue('snap-uuid'),
  } as unknown as ConversationManagementService;
}

function buildMockPortalSvc(overrides: Partial<Record<string, any>> = {}): PortalService {
  const defaultAgentRow = {
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
  };

  const svc = {
    signup: vi.fn().mockImplementation((email: string, _pwd: string, tenantName: string) =>
      Promise.resolve({ token: 'test-token', userId: 'new-user-id', email, tenantId: 'new-tenant-id', tenantName })
    ),
    signupWithInvite: vi.fn().mockResolvedValue({
      token: 'test-token', userId: TEST_USER_ID, email: TEST_USER_EMAIL,
      tenantId: TEST_TENANT_ID, tenantName: TEST_TENANT_NAME,
    }),
    login: vi.fn().mockImplementation(async (email: string, password: string) => {
      if (email.toLowerCase() !== TEST_USER_EMAIL.toLowerCase()) return null;
      const [salt, key] = PASSWORD_HASH.split(':');
      const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
      const { timingSafeEqual } = await import('node:crypto');
      const valid = timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
      if (!valid) return null;
      return {
        token: signPortalToken({ sub: TEST_USER_ID, tenantId: TEST_TENANT_ID, role: 'owner' }),
        userId: TEST_USER_ID,
        email: TEST_USER_EMAIL,
        tenantId: TEST_TENANT_ID,
        tenantName: TEST_TENANT_NAME,
        tenants: [{ id: TEST_TENANT_ID, name: TEST_TENANT_NAME, role: 'owner' }],
      };
    }),
    getMe: vi.fn().mockResolvedValue({
      row: {
        id: TEST_USER_ID, email: TEST_USER_EMAIL, role: 'owner',
        tenant_id: TEST_TENANT_ID, tenant_name: TEST_TENANT_NAME,
        provider_config: null, available_models: null,
      },
      tenants: [{ tenant_id: TEST_TENANT_ID, tenant_name: TEST_TENANT_NAME, role: 'owner' }],
      agents: [{ id: TEST_AGENT_ID, name: TEST_AGENT_NAME }],
      subtenants: [],
    }),
    updateProviderSettings: vi.fn().mockResolvedValue(undefined),
    listApiKeys: vi.fn().mockResolvedValue([]),
    createApiKey: vi.fn().mockResolvedValue({ id: 'key-id', key: 'loom_sk_xxx', keyPrefix: 'loom_sk_xxx'.slice(0, 12), name: 'key', status: 'active', created_at: new Date().toISOString() }),
    revokeApiKey: vi.fn().mockResolvedValue('keyhash'),
    listTraces: vi.fn().mockResolvedValue([]),
    switchTenant: vi.fn().mockResolvedValue({ token: 'new-token', userId: TEST_USER_ID, email: TEST_USER_EMAIL, tenantId: TEST_TENANT_ID, tenantName: TEST_TENANT_NAME }),
    getInviteInfo: vi.fn().mockResolvedValue(null),
    createInvite: vi.fn().mockResolvedValue({ id: 'invite-id', token: 'invite-token', expires_at: null, max_uses: 10, current_uses: 0, created_at: new Date().toISOString() }),
    listInvites: vi.fn().mockResolvedValue([]),
    revokeInvite: vi.fn().mockResolvedValue(true),
    listMembers: vi.fn().mockResolvedValue([]),
    updateMemberRole: vi.fn().mockResolvedValue({ user_id: TEST_USER_ID, role: 'member', joined_at: new Date().toISOString(), email: TEST_USER_EMAIL }),
    removeMember: vi.fn().mockResolvedValue(undefined),
    listUserTenants: vi.fn().mockResolvedValue([{ id: TEST_TENANT_ID, name: TEST_TENANT_NAME, role: 'owner' }]),
    leaveTenant: vi.fn().mockResolvedValue(undefined),
    listSubtenants: vi.fn().mockResolvedValue([]),
    createSubtenant: vi.fn().mockResolvedValue({ id: 'sub-id', name: 'Sub', status: 'active', created_at: new Date().toISOString(), updated_at: null }),
    listAgents: vi.fn().mockResolvedValue([defaultAgentRow]),
    createAgent: vi.fn().mockImplementation((_tenantId: string, data: any) =>
      Promise.resolve({
        id: 'new-agent-id', name: data.name ?? 'My Agent',
        provider_config: null, system_prompt: null, skills: null,
        mcp_endpoints: null, merge_policies: { system_prompt: 'prepend', skills: 'merge', mcp_endpoints: 'merge' },
        available_models: null, conversations_enabled: false,
        conversation_token_limit: null, conversation_summary_model: null,
        created_at: new Date().toISOString(), updated_at: null,
      })
    ),
    getAgent: vi.fn().mockImplementation((agentId: string, _userId: string) => {
      if (agentId === TEST_AGENT_ID) return Promise.resolve({ ...defaultAgentRow });
      return Promise.resolve(null);
    }),
    updateAgent: vi.fn().mockResolvedValue({ ...defaultAgentRow }),
    deleteAgent: vi.fn().mockResolvedValue(true),
    getAgentResolved: vi.fn().mockImplementation((agentId: string, _userId: string) => {
      if (agentId === TEST_AGENT_ID) return Promise.resolve({
        agent: { ...defaultAgentRow, tenant_id: TEST_TENANT_ID },
        tenantChain: [{ id: TEST_TENANT_ID, name: TEST_TENANT_NAME, provider_config: null, system_prompt: null, skills: null, mcp_endpoints: null }],
      });
      return Promise.resolve(null);
    }),
    getAgentForChat: vi.fn().mockResolvedValue(null),
    listPartitions: vi.fn().mockResolvedValue([]),
    createPartition: vi.fn().mockResolvedValue({ id: 'part-uuid', external_id: 'ext-id', parent_id: null, created_at: new Date().toISOString() }),
    updatePartition: vi.fn().mockResolvedValue(true),
    deletePartition: vi.fn().mockResolvedValue(true),
    listConversations: vi.fn().mockResolvedValue([]),
    getConversation: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as PortalService;
  return svc;
}

async function buildApp(
  svc: PortalService = buildMockPortalSvc(),
  conversationSvc: ConversationManagementService = buildMockConvSvc(),
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerPortalRoutes(app, svc, conversationSvc);
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
    app = await buildApp();
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
    const localApp = await buildApp(
      buildMockPortalSvc({ signup: vi.fn().mockRejectedValue(Object.assign(new Error('Email already registered'), { status: 409 })) }),
    );

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
    app = await buildApp();
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
    app = await buildApp();
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
    const localApp = await buildApp(
      buildMockPortalSvc({ getMe: vi.fn().mockResolvedValue(null) }),
    );

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
    app = await buildApp();
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
    const localApp = await buildApp(
      buildMockPortalSvc({ listAgents: vi.fn().mockResolvedValue([]) }),
    );

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
    app = await buildApp();
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
    app = await buildApp();
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
