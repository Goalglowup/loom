import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/core';
import { UserRepository } from '../src/domain/repositories/UserRepository.js';
import { TenantRepository } from '../src/domain/repositories/TenantRepository.js';
import { AdminUserRepository } from '../src/domain/repositories/AdminUserRepository.js';
import { AgentRepository } from '../src/domain/repositories/AgentRepository.js';
import { ApiKeyRepository } from '../src/domain/repositories/ApiKeyRepository.js';
import { ConversationRepository } from '../src/domain/repositories/ConversationRepository.js';
import { TraceRepository } from '../src/domain/repositories/TraceRepository.js';
import { User } from '../src/domain/entities/User.js';
import { Tenant } from '../src/domain/entities/Tenant.js';
import { AdminUser } from '../src/domain/entities/AdminUser.js';
import { Agent } from '../src/domain/entities/Agent.js';
import { ApiKey } from '../src/domain/entities/ApiKey.js';
import { Conversation } from '../src/domain/entities/Conversation.js';
import { Trace } from '../src/domain/entities/Trace.js';

// ── Mock EM factory ──────────────────────────────────────────────────────────

function buildMockEm(overrides: Partial<Record<string, any>> = {}): EntityManager {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
    count: vi.fn(),
    persist: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    getReference: vi.fn((cls: any, id: string) =>
      Object.assign(Object.create(cls.prototype), { id }),
    ),
    ...overrides,
  } as unknown as EntityManager;
}

// ── Entity fixture helpers ───────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return Object.assign(Object.create(User.prototype) as User, {
    id: 'user-1',
    email: 'alice@example.com',
    passwordHash: 'hash',
    createdAt: new Date(),
    lastLogin: null,
    memberships: [],
    ...overrides,
  });
}

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return Object.assign(Object.create(Tenant.prototype) as Tenant, {
    id: 'tenant-1',
    name: 'Test Tenant',
    parentId: null,
    providerConfig: null,
    systemPrompt: null,
    skills: null,
    mcpEndpoints: null,
    status: 'active',
    availableModels: null,
    updatedAt: null,
    createdAt: new Date(),
    agents: [],
    members: [],
    invites: [],
    ...overrides,
  });
}

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return Object.assign(Object.create(Agent.prototype) as Agent, {
    id: 'agent-1',
    name: 'Test Agent',
    tenant: makeTenant(),
    apiKeys: [],
    ...overrides,
  });
}

function makeApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  const rawKey = 'loom_testrawapikey';
  return Object.assign(Object.create(ApiKey.prototype) as ApiKey, {
    id: 'apikey-1',
    name: 'Test Key',
    keyHash: createHash('sha256').update(rawKey).digest('hex'),
    keyPrefix: 'loom_te',
    status: 'active',
    createdAt: new Date(),
    agent: makeAgent(),
    tenant: makeTenant(),
    ...overrides,
  });
}

function makeAdminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return Object.assign(Object.create(AdminUser.prototype) as AdminUser, {
    id: 'admin-1',
    username: 'admin',
    passwordHash: 'hash',
    createdAt: new Date(),
    lastLogin: null,
    ...overrides,
  });
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return Object.assign(Object.create(Conversation.prototype) as Conversation, {
    id: 'conv-1',
    externalId: 'ext-1',
    createdAt: new Date(),
    lastActiveAt: new Date(),
    tenant: makeTenant(),
    agent: null,
    partition: null,
    messages: [],
    snapshots: [],
    ...overrides,
  });
}

function makeTrace(overrides: Partial<Trace> = {}): Trace {
  return Object.assign(Object.create(Trace.prototype) as Trace, {
    id: 'trace-1',
    tenant: makeTenant(),
    agent: null,
    requestId: 'req-1',
    model: 'gpt-4',
    provider: 'openai',
    endpoint: '/v1/chat/completions',
    requestBody: {},
    responseBody: null,
    latencyMs: 100,
    ttfbMs: null,
    gatewayOverheadMs: null,
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
    estimatedCostUsd: null,
    createdAt: new Date(),
    ...overrides,
  });
}

// ── UserRepository ───────────────────────────────────────────────────────────

describe('UserRepository', () => {
  let em: EntityManager;
  let repo: UserRepository;

  beforeEach(() => {
    em = buildMockEm();
    repo = new UserRepository(em);
  });

  describe('findById', () => {
    it('calls em.findOne with User entity and id filter', async () => {
      const user = makeUser();
      vi.mocked(em.findOne).mockResolvedValue(user);

      const result = await repo.findById('user-1');

      expect(em.findOne).toHaveBeenCalledWith(User, { id: 'user-1' });
      expect(result).toBe(user);
    });

    it('returns null when user not found', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null);

      const result = await repo.findById('missing');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('lowercases the email before querying', async () => {
      const user = makeUser();
      vi.mocked(em.findOne).mockResolvedValue(user);

      await repo.findByEmail('Alice@Example.COM');

      expect(em.findOne).toHaveBeenCalledWith(User, { email: 'alice@example.com' });
    });

    it('returns null when email not found', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null);

      const result = await repo.findByEmail('nobody@example.com');

      expect(result).toBeNull();
    });
  });
});

// ── TenantRepository ─────────────────────────────────────────────────────────

describe('TenantRepository', () => {
  let em: EntityManager;
  let repo: TenantRepository;

  beforeEach(() => {
    em = buildMockEm();
    repo = new TenantRepository(em);
  });

  describe('findById', () => {
    it('calls em.findOne with Tenant entity and id filter', async () => {
      const tenant = makeTenant();
      vi.mocked(em.findOne).mockResolvedValue(tenant);

      const result = await repo.findById('tenant-1');

      expect(em.findOne).toHaveBeenCalledWith(Tenant, { id: 'tenant-1' });
      expect(result).toBe(tenant);
    });

    it('returns null when not found', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null);
      expect(await repo.findById('x')).toBeNull();
    });
  });

  describe('findByIdWithAgents', () => {
    it('populates agents relation', async () => {
      const tenant = makeTenant();
      vi.mocked(em.findOne).mockResolvedValue(tenant);

      await repo.findByIdWithAgents('tenant-1');

      expect(em.findOne).toHaveBeenCalledWith(
        Tenant,
        { id: 'tenant-1' },
        { populate: ['agents'] },
      );
    });
  });

  describe('findAll', () => {
    it('returns all tenants', async () => {
      const tenants = [makeTenant(), makeTenant({ id: 'tenant-2', name: 'Other' })];
      vi.mocked(em.find).mockResolvedValue(tenants);

      const result = await repo.findAll();

      expect(em.find).toHaveBeenCalledWith(Tenant, {});
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no tenants exist', async () => {
      vi.mocked(em.find).mockResolvedValue([]);
      expect(await repo.findAll()).toEqual([]);
    });
  });
});

// ── AdminUserRepository ──────────────────────────────────────────────────────

describe('AdminUserRepository', () => {
  let em: EntityManager;
  let repo: AdminUserRepository;

  beforeEach(() => {
    em = buildMockEm();
    repo = new AdminUserRepository(em);
  });

  describe('findByUsername', () => {
    it('queries by username', async () => {
      const admin = makeAdminUser();
      vi.mocked(em.findOne).mockResolvedValue(admin);

      const result = await repo.findByUsername('admin');

      expect(em.findOne).toHaveBeenCalledWith(AdminUser, { username: 'admin' });
      expect(result).toBe(admin);
    });

    it('returns null when username not found', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null);
      expect(await repo.findByUsername('nobody')).toBeNull();
    });
  });

  describe('findById', () => {
    it('queries by id', async () => {
      const admin = makeAdminUser();
      vi.mocked(em.findOne).mockResolvedValue(admin);

      await repo.findById('admin-1');

      expect(em.findOne).toHaveBeenCalledWith(AdminUser, { id: 'admin-1' });
    });
  });
});

// ── AgentRepository ──────────────────────────────────────────────────────────

describe('AgentRepository', () => {
  let em: EntityManager;
  let repo: AgentRepository;

  beforeEach(() => {
    em = buildMockEm();
    repo = new AgentRepository(em);
  });

  describe('findById', () => {
    it('populates tenant relation', async () => {
      const agent = makeAgent();
      vi.mocked(em.findOne).mockResolvedValue(agent);

      await repo.findById('agent-1');

      expect(em.findOne).toHaveBeenCalledWith(
        Agent,
        { id: 'agent-1' },
        { populate: ['tenant'] },
      );
    });

    it('returns null when not found', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null);
      expect(await repo.findById('x')).toBeNull();
    });
  });

  describe('findByTenantId', () => {
    it('queries agents by tenant reference', async () => {
      const agents = [makeAgent()];
      vi.mocked(em.find).mockResolvedValue(agents);

      const result = await repo.findByTenantId('tenant-1');

      expect(em.find).toHaveBeenCalledWith(Agent, { tenant: 'tenant-1' });
      expect(result).toBe(agents);
    });

    it('returns empty array when tenant has no agents', async () => {
      vi.mocked(em.find).mockResolvedValue([]);
      expect(await repo.findByTenantId('tenant-1')).toEqual([]);
    });
  });
});

// ── ApiKeyRepository ─────────────────────────────────────────────────────────

describe('ApiKeyRepository', () => {
  let em: EntityManager;
  let repo: ApiKeyRepository;

  beforeEach(() => {
    em = buildMockEm();
    repo = new ApiKeyRepository(em);
  });

  describe('findByKeyHash', () => {
    it('hashes the raw key and queries with active status', async () => {
      const rawKey = 'loom_testrawapikey';
      const expectedHash = createHash('sha256').update(rawKey).digest('hex');
      const apiKey = makeApiKey();
      vi.mocked(em.findOne).mockResolvedValue(apiKey);

      await repo.findByKeyHash(rawKey);

      expect(em.findOne).toHaveBeenCalledWith(
        ApiKey,
        { keyHash: expectedHash, status: 'active' },
        { populate: ['agent', 'tenant'] },
      );
    });

    it('returns null when key not found or inactive', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null);
      expect(await repo.findByKeyHash('bad-key')).toBeNull();
    });
  });

  describe('findById', () => {
    it('populates agent and tenant relations', async () => {
      const apiKey = makeApiKey();
      vi.mocked(em.findOne).mockResolvedValue(apiKey);

      await repo.findById('apikey-1');

      expect(em.findOne).toHaveBeenCalledWith(
        ApiKey,
        { id: 'apikey-1' },
        { populate: ['agent', 'tenant'] },
      );
    });
  });

  describe('findByTenantId', () => {
    it('queries keys by tenant and populates agent', async () => {
      const keys = [makeApiKey()];
      vi.mocked(em.find).mockResolvedValue(keys);

      const result = await repo.findByTenantId('tenant-1');

      expect(em.find).toHaveBeenCalledWith(
        ApiKey,
        { tenant: 'tenant-1' },
        { populate: ['agent'] },
      );
      expect(result).toBe(keys);
    });
  });
});

// ── ConversationRepository ───────────────────────────────────────────────────

describe('ConversationRepository', () => {
  let em: EntityManager;
  let repo: ConversationRepository;

  beforeEach(() => {
    em = buildMockEm();
    repo = new ConversationRepository(em);
  });

  describe('findWithMessages', () => {
    it('populates messages relation', async () => {
      const conv = makeConversation();
      vi.mocked(em.findOne).mockResolvedValue(conv);

      await repo.findWithMessages('conv-1');

      expect(em.findOne).toHaveBeenCalledWith(
        Conversation,
        { id: 'conv-1' },
        { populate: ['messages'] },
      );
    });
  });

  describe('findWithLatestSnapshot', () => {
    it('populates snapshots and messages', async () => {
      const conv = makeConversation();
      vi.mocked(em.findOne).mockResolvedValue(conv);

      await repo.findWithLatestSnapshot('conv-1');

      expect(em.findOne).toHaveBeenCalledWith(
        Conversation,
        { id: 'conv-1' },
        { populate: ['snapshots', 'messages'] },
      );
    });
  });

  describe('findOrCreate', () => {
    const params = {
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      partitionId: null,
      externalId: 'ext-1',
    };

    it('returns existing conversation when found', async () => {
      const existing = makeConversation();
      vi.mocked(em.findOne).mockResolvedValue(existing);

      const result = await repo.findOrCreate(params);

      expect(result).toBe(existing);
      expect(em.persist).not.toHaveBeenCalled();
    });

    it('creates and persists a new conversation when not found', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null);

      const result = await repo.findOrCreate(params);

      expect(em.persist).toHaveBeenCalledWith(result);
      expect(result.externalId).toBe('ext-1');
      expect(result.id).toBeDefined();
    });

    it('queries with null partition when partitionId is null', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null);

      await repo.findOrCreate({ ...params, partitionId: null });

      expect(em.findOne).toHaveBeenCalledWith(
        Conversation,
        expect.objectContaining({ partition: null }),
      );
    });

    it('queries with partition reference when partitionId provided', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null);

      await repo.findOrCreate({ ...params, partitionId: 'part-1' });

      expect(em.findOne).toHaveBeenCalledWith(
        Conversation,
        expect.objectContaining({ partition: 'part-1' }),
      );
    });

    it('sets agent to null when agentId is null', async () => {
      vi.mocked(em.findOne).mockResolvedValue(null);

      const result = await repo.findOrCreate({ ...params, agentId: null });

      expect(result.agent).toBeNull();
    });
  });
});

// ── TraceRepository ───────────────────────────────────────────────────────────

describe('TraceRepository', () => {
  let em: EntityManager;
  let repo: TraceRepository;

  beforeEach(() => {
    em = buildMockEm();
    repo = new TraceRepository(em);
  });

  describe('findByTenantId', () => {
    it('queries traces ordered by createdAt DESC with defaults', async () => {
      const traces = [makeTrace()];
      vi.mocked(em.find).mockResolvedValue(traces);

      const result = await repo.findByTenantId('tenant-1');

      expect(em.find).toHaveBeenCalledWith(
        Trace,
        { tenant: 'tenant-1' },
        { orderBy: { createdAt: 'DESC' }, limit: 50, offset: 0 },
      );
      expect(result).toBe(traces);
    });

    it('applies custom limit and offset', async () => {
      vi.mocked(em.find).mockResolvedValue([]);

      await repo.findByTenantId('tenant-1', { limit: 10, offset: 20 });

      expect(em.find).toHaveBeenCalledWith(
        Trace,
        { tenant: 'tenant-1' },
        { orderBy: { createdAt: 'DESC' }, limit: 10, offset: 20 },
      );
    });
  });

  describe('countByTenantId', () => {
    it('calls em.count with tenant filter', async () => {
      vi.mocked(em.count).mockResolvedValue(42);

      const result = await repo.countByTenantId('tenant-1');

      expect(em.count).toHaveBeenCalledWith(Trace, { tenant: 'tenant-1' });
      expect(result).toBe(42);
    });

    it('returns 0 when no traces exist', async () => {
      vi.mocked(em.count).mockResolvedValue(0);
      expect(await repo.countByTenantId('tenant-1')).toBe(0);
    });
  });
});
