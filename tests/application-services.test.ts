import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { EntityManager } from '@mikro-orm/core';
import { UserManagementService } from '../src/application/services/UserManagementService.js';
import { TenantManagementService } from '../src/application/services/TenantManagementService.js';
import { TenantService } from '../src/application/services/TenantService.js';
import { Tenant } from '../src/domain/entities/Tenant.js';
import { Agent } from '../src/domain/entities/Agent.js';
import { User } from '../src/domain/entities/User.js';
import { TenantMembership } from '../src/domain/entities/TenantMembership.js';
import { ApiKey } from '../src/domain/entities/ApiKey.js';
import { Invite } from '../src/domain/entities/Invite.js';

vi.mock('../src/providers/registry.js', () => ({
  evictProvider: vi.fn(),
}));

function buildMockEm(overrides: Partial<Record<string, any>> = {}): EntityManager {
  return {
    findOne: vi.fn(),
    findOneOrFail: vi.fn(),
    find: vi.fn(),
    persist: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    removeAndFlush: vi.fn().mockResolvedValue(undefined),
    persistAndFlush: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as EntityManager;
}

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  const t = new Tenant();
  t.id = 'tenant-1';
  t.name = 'Test Tenant';
  t.parentId = null;
  t.providerConfig = null;
  t.systemPrompt = null;
  t.skills = null;
  t.mcpEndpoints = null;
  t.status = 'active';
  t.availableModels = null;
  t.updatedAt = null;
  t.createdAt = new Date();
  t.agents = [];
  t.members = [];
  t.invites = [];
  Object.assign(t, overrides);
  return t;
}

function makeAgent(tenant: Tenant, overrides: Partial<Agent> = {}): Agent {
  const a = new Agent();
  a.id = 'agent-1';
  a.tenant = tenant;
  a.name = 'Test Agent';
  a.providerConfig = null;
  a.systemPrompt = null;
  a.skills = null;
  a.mcpEndpoints = null;
  a.mergePolicies = { system_prompt: 'prepend', skills: 'merge' };
  a.availableModels = null;
  a.conversationsEnabled = false;
  a.conversationTokenLimit = 4000;
  a.conversationSummaryModel = null;
  a.createdAt = new Date();
  a.updatedAt = null;
  a.apiKeys = [];
  Object.assign(a, overrides);
  return a;
}

function makeUser(overrides: Partial<User> = {}): User {
  const u = new User();
  u.id = 'user-1';
  u.email = 'test@example.com';
  u.passwordHash = 'hash';
  u.createdAt = new Date();
  u.lastLogin = null;
  Object.assign(u, overrides);
  return u;
}

// ─── UserManagementService ────────────────────────────────────────────────────

describe('UserManagementService', () => {
  describe('createUser', () => {
    it('creates user+tenant+membership and returns AuthResult with token', async () => {
      const em = buildMockEm();
      const svc = new UserManagementService(em);
      const result = await svc.createUser({
        email: 'Alice@Example.com',
        password: 'password123',
      });
      expect(result.token).toBeTruthy();
      expect(result.email).toBe('alice@example.com');
      expect(result.userId).toBeTruthy();
      expect(result.tenantId).toBeTruthy();
      // persist called 2 times: user, tenant (cascade handles membership and agent)
      expect((em.persist as any).mock.calls.length).toBe(2);
      expect((em.flush as any)).toHaveBeenCalled();
    });

    it('throws when email is missing', async () => {
      const em = buildMockEm();
      const svc = new UserManagementService(em);
      await expect(svc.createUser({ email: '', password: 'password123' })).rejects.toThrow();
    });

    it('throws when password is too short (< 8 chars)', async () => {
      const em = buildMockEm();
      const svc = new UserManagementService(em);
      await expect(svc.createUser({ email: 'a@b.com', password: 'short' })).rejects.toThrow();
    });

    it('lowercases the email', async () => {
      const em = buildMockEm();
      const svc = new UserManagementService(em);
      const result = await svc.createUser({ email: 'UPPER@CASE.COM', password: 'password123' });
      expect(result.email).toBe('upper@case.com');
    });

    it('uses tenantName from DTO when provided', async () => {
      const em = buildMockEm();
      const svc = new UserManagementService(em);
      const result = await svc.createUser({
        email: 'user@example.com',
        password: 'password123',
        tenantName: 'My Custom Org',
      });
      expect(result.tenantName).toBe('My Custom Org');
    });

    it('generates a default tenant name when tenantName is omitted', async () => {
      const em = buildMockEm();
      const svc = new UserManagementService(em);
      const result = await svc.createUser({ email: 'user@example.com', password: 'password123' });
      expect(result.tenantName).toContain('user');
    });

    it('throws 409 if email already exists', async () => {
      const existingUser = makeUser({ email: 'existing@example.com' });
      const em = buildMockEm({ findOne: vi.fn().mockResolvedValue(existingUser) });
      const svc = new UserManagementService(em);
      await expect(svc.createUser({ email: 'existing@example.com', password: 'password123' }))
        .rejects.toThrow('Email already registered');
    });

    it('trims tenant name whitespace', async () => {
      const em = buildMockEm();
      const svc = new UserManagementService(em);
      const result = await svc.createUser({
        email: 'user@example.com',
        password: 'password123',
        tenantName: '  Acme Corp  ',
      });
      expect(result.tenantName).toBe('Acme Corp');
    });

    it('creates a default agent during signup', async () => {
      const em = buildMockEm();
      const svc = new UserManagementService(em);
      await svc.createUser({ email: 'user@example.com', password: 'password123' });
      const persistCalls = (em.persist as any).mock.calls;
      expect(persistCalls.length).toBe(2);
      const tenant = persistCalls[1][0] as Tenant;
      expect(tenant).toBeInstanceOf(Tenant);
      expect(tenant.agents).toHaveLength(1);
      expect(tenant.agents[0].name).toBe('Default');
    });
  });

  describe('login', () => {
    let storedUser: User;

    beforeAll(async () => {
      // Create a real user to capture a valid passwordHash
      const setupEm = buildMockEm();
      const setupSvc = new UserManagementService(setupEm);
      await setupSvc.createUser({ email: 'login@example.com', password: 'mypassword1' });
      // First persist call is the user
      storedUser = (setupEm.persist as any).mock.calls[0][0] as User;
    });

    it('returns AuthResult on valid credentials', async () => {
      const em = buildMockEm({
        findOne: vi.fn().mockResolvedValueOnce(storedUser),
        find: vi.fn().mockResolvedValueOnce([
          {
            tenant: { id: 'tenant-1', name: 'Login Tenant', status: 'active' },
            role: 'owner',
          },
        ]),
      });
      const svc = new UserManagementService(em);
      const result = await svc.login({ email: 'login@example.com', password: 'mypassword1' });
      expect(result.token).toBeTruthy();
      expect(result.email).toBe('login@example.com');
    });

    it('throws "Invalid credentials" when user not found', async () => {
      const em = buildMockEm({ findOne: vi.fn().mockResolvedValue(null) });
      const svc = new UserManagementService(em);
      await expect(svc.login({ email: 'nobody@example.com', password: 'anything' })).rejects.toThrow('Invalid credentials');
    });

    it('throws "Invalid credentials" when password is wrong', async () => {
      const em = buildMockEm({ findOne: vi.fn().mockResolvedValue(storedUser) });
      const svc = new UserManagementService(em);
      await expect(svc.login({ email: 'login@example.com', password: 'wrongpassword' })).rejects.toThrow('Invalid credentials');
    });

    it('updates lastLogin on successful login', async () => {
      const em = buildMockEm({
        findOne: vi.fn().mockResolvedValueOnce(storedUser),
        find: vi.fn().mockResolvedValueOnce([
          {
            tenant: { id: 'tenant-1', name: 'Login Tenant', status: 'active' },
            role: 'owner',
          },
        ]),
      });
      const svc = new UserManagementService(em);
      await svc.login({ email: 'login@example.com', password: 'mypassword1' });
      expect(storedUser.lastLogin).toBeInstanceOf(Date);
    });

    it('returns tenants array with all active memberships', async () => {
      const em = buildMockEm({
        findOne: vi.fn().mockResolvedValueOnce(storedUser),
        find: vi.fn().mockResolvedValueOnce([
          {
            tenant: { id: 'tenant-1', name: 'Tenant One', status: 'active' },
            role: 'owner',
          },
          {
            tenant: { id: 'tenant-2', name: 'Tenant Two', status: 'active' },
            role: 'member',
          },
        ]),
      });
      const svc = new UserManagementService(em);
      const result = await svc.login({ email: 'login@example.com', password: 'mypassword1' });
      expect(result.tenants).toHaveLength(2);
      expect(result.tenants![0]).toMatchObject({ id: 'tenant-1', name: 'Tenant One', role: 'owner' });
      expect(result.tenants![1]).toMatchObject({ id: 'tenant-2', name: 'Tenant Two', role: 'member' });
    });

    it('throws 403 if user has no active tenant memberships', async () => {
      const em = buildMockEm({
        findOne: vi.fn().mockResolvedValueOnce(storedUser),
        find: vi.fn().mockResolvedValueOnce([
          {
            tenant: { id: 'tenant-1', name: 'Inactive Tenant', status: 'suspended' },
            role: 'owner',
          },
        ]),
      });
      const svc = new UserManagementService(em);
      await expect(svc.login({ email: 'login@example.com', password: 'mypassword1' }))
        .rejects.toThrow('No active tenant memberships');
    });

    it('does NOT include inactive tenants in the returned tenants array', async () => {
      const em = buildMockEm({
        findOne: vi.fn().mockResolvedValueOnce(storedUser),
        find: vi.fn().mockResolvedValueOnce([
          {
            tenant: { id: 'tenant-1', name: 'Active Tenant', status: 'active' },
            role: 'owner',
          },
          {
            tenant: { id: 'tenant-2', name: 'Suspended Tenant', status: 'suspended' },
            role: 'member',
          },
        ]),
      });
      const svc = new UserManagementService(em);
      const result = await svc.login({ email: 'login@example.com', password: 'mypassword1' });
      expect(result.tenants).toHaveLength(1);
      expect(result.tenants![0]).toMatchObject({ id: 'tenant-1', name: 'Active Tenant' });
    });
  });

  describe('acceptInvite', () => {
    function makeValidInvite(tenantOverrides: Partial<Tenant> = {}): Invite {
      const invite = new Invite();
      invite.id = 'invite-1';
      invite.token = 'valid-token';
      invite.tenant = makeTenant(tenantOverrides);
      invite.maxUses = null;
      invite.useCount = 0;
      invite.expiresAt = new Date(Date.now() + 86_400_000);
      invite.revokedAt = null;
      invite.createdAt = new Date();
      return invite;
    }

    it('creates a new user and membership for a new email', async () => {
      const invite = makeValidInvite();
      const em = buildMockEm({
        findOne: vi.fn()
          .mockResolvedValueOnce(invite)   // Invite lookup
          .mockResolvedValueOnce(null)     // User lookup (new user)
          .mockResolvedValueOnce(null),    // existing membership check
      });
      const svc = new UserManagementService(em);
      const result = await svc.acceptInvite({
        inviteToken: 'valid-token',
        email: 'newuser@example.com',
        password: 'password123',
      });
      expect(result.userId).toBeTruthy();
      expect(result.email).toBe('newuser@example.com');
    });

    it('adds membership to existing user', async () => {
      const invite = makeValidInvite();
      const existingUser = makeUser();
      const em = buildMockEm({
        findOne: vi.fn()
          .mockResolvedValueOnce(invite)
          .mockResolvedValueOnce(existingUser)
          .mockResolvedValueOnce(null), // no existing membership
      });
      const svc = new UserManagementService(em);
      const result = await svc.acceptInvite({
        inviteToken: 'valid-token',
        email: existingUser.email,
        password: 'password123',
      });
      expect(result.userId).toBe(existingUser.id);
    });

    it('throws when invite token is invalid', async () => {
      const em = buildMockEm({ findOne: vi.fn().mockResolvedValue(null) });
      const svc = new UserManagementService(em);
      await expect(
        svc.acceptInvite({ inviteToken: 'bad-token', email: 'a@b.com', password: 'password123' }),
      ).rejects.toThrow('Invalid invite token');
    });

    it('throws when invite has expired', async () => {
      const expired = makeValidInvite();
      expired.expiresAt = new Date(Date.now() - 1000);
      const em = buildMockEm({ findOne: vi.fn().mockResolvedValue(expired) });
      const svc = new UserManagementService(em);
      await expect(
        svc.acceptInvite({ inviteToken: 'valid-token', email: 'a@b.com', password: 'password123' }),
      ).rejects.toThrow('expired');
    });

    it('throws when invite is revoked', async () => {
      const revoked = makeValidInvite();
      revoked.revokedAt = new Date();
      const em = buildMockEm({ findOne: vi.fn().mockResolvedValue(revoked) });
      const svc = new UserManagementService(em);
      await expect(
        svc.acceptInvite({ inviteToken: 'valid-token', email: 'a@b.com', password: 'password123' }),
      ).rejects.toThrow('revoked');
    });

    it('throws when password is too short', async () => {
      const em = buildMockEm();
      const svc = new UserManagementService(em);
      await expect(
        svc.acceptInvite({ inviteToken: 'any', email: 'a@b.com', password: 'short' }),
      ).rejects.toThrow('Password must be at least 8 characters');
    });

    it('throws 400 if invite tenant is not active', async () => {
      const invite = makeValidInvite({ status: 'suspended' });
      const em = buildMockEm({ findOne: vi.fn().mockResolvedValue(invite) });
      const svc = new UserManagementService(em);
      await expect(
        svc.acceptInvite({ inviteToken: 'valid-token', email: 'a@b.com', password: 'password123' }),
      ).rejects.toThrow('Tenant is not active');
    });

    it('throws 409 if user is already a member', async () => {
      const invite = makeValidInvite();
      const existingUser = makeUser();
      const existingMembership = new TenantMembership();
      existingMembership.id = 'm-1';
      existingMembership.user = existingUser;
      existingMembership.tenant = invite.tenant as Tenant;
      existingMembership.role = 'member';
      existingMembership.joinedAt = new Date();
      
      const em = buildMockEm({
        findOne: vi.fn()
          .mockResolvedValueOnce(invite)
          .mockResolvedValueOnce(existingUser)
          .mockResolvedValueOnce(existingMembership),
      });
      const svc = new UserManagementService(em);
      await expect(
        svc.acceptInvite({ inviteToken: 'valid-token', email: existingUser.email, password: 'password123' }),
      ).rejects.toThrow('Already a member of this tenant');
    });
  });

  describe('switchTenant', () => {
    it('throws 403 if user is not a member of the target tenant', async () => {
      const user = makeUser({ id: 'user-1' });
      const em = buildMockEm({
        findOneOrFail: vi.fn().mockResolvedValue(user),
        findOne: vi.fn().mockResolvedValue(null),
      });
      const svc = new UserManagementService(em);
      await expect(svc.switchTenant('user-1', 'tenant-999'))
        .rejects.toThrow('No membership in requested tenant');
    });

    it('throws 400 if target tenant is inactive', async () => {
      const user = makeUser({ id: 'user-1' });
      const tenant = makeTenant({ id: 'tenant-2', status: 'suspended' });
      const membership = new TenantMembership();
      membership.id = 'm-1';
      membership.user = user;
      membership.tenant = tenant;
      membership.role = 'member';
      membership.joinedAt = new Date();

      const em = buildMockEm({
        findOneOrFail: vi.fn().mockResolvedValue(user),
        findOne: vi.fn().mockResolvedValue(membership),
        find: vi.fn().mockResolvedValue([]),
      });
      const svc = new UserManagementService(em);
      await expect(svc.switchTenant('user-1', 'tenant-2'))
        .rejects.toThrow('Tenant is not active');
    });

    it('returns AuthResult with a new JWT on success', async () => {
      const user = makeUser({ id: 'user-1', email: 'user@example.com' });
      const tenant = makeTenant({ id: 'tenant-2', name: 'New Tenant', status: 'active' });
      const membership = new TenantMembership();
      membership.id = 'm-1';
      membership.user = user;
      membership.tenant = tenant;
      membership.role = 'member';
      membership.joinedAt = new Date();

      const em = buildMockEm({
        findOneOrFail: vi.fn().mockResolvedValue(user),
        findOne: vi.fn().mockResolvedValue(membership),
        find: vi.fn().mockResolvedValue([membership]),
      });
      const svc = new UserManagementService(em);
      const result = await svc.switchTenant('user-1', 'tenant-2');
      expect(result.token).toBeTruthy();
      expect(result.tenantId).toBe('tenant-2');
      expect(result.tenantName).toBe('New Tenant');
      expect(result.email).toBe('user@example.com');
    });
  });

  describe('leaveTenant', () => {
    it('throws 400 "Switch to a different tenant before leaving" if tenantId === currentTenantId', async () => {
      const em = buildMockEm();
      const svc = new UserManagementService(em);
      await expect(svc.leaveTenant('user-1', 'tenant-1', 'tenant-1'))
        .rejects.toThrow('Switch to a different tenant before leaving');
    });

    it('throws 400 if user is the last owner', async () => {
      const user = makeUser({ id: 'user-1' });
      const tenant = makeTenant({ id: 'tenant-1' });
      const membership = new TenantMembership();
      membership.id = 'm-1';
      membership.user = user;
      membership.tenant = tenant;
      membership.role = 'owner';
      membership.joinedAt = new Date();

      const em = buildMockEm({
        findOne: vi.fn().mockResolvedValue(membership),
        count: vi.fn().mockResolvedValue(1),
      });
      const svc = new UserManagementService(em);
      await expect(svc.leaveTenant('user-1', 'tenant-1', 'tenant-2'))
        .rejects.toThrow('Cannot leave tenant as the last owner');
    });

    it('removes membership on success', async () => {
      const user = makeUser({ id: 'user-1' });
      const tenant = makeTenant({ id: 'tenant-1' });
      const membership = new TenantMembership();
      membership.id = 'm-1';
      membership.user = user;
      membership.tenant = tenant;
      membership.role = 'member';
      membership.joinedAt = new Date();

      const em = buildMockEm({
        findOne: vi.fn().mockResolvedValue(membership),
      });
      const svc = new UserManagementService(em);
      await svc.leaveTenant('user-1', 'tenant-1', 'tenant-2');
      expect(em.removeAndFlush).toHaveBeenCalledWith(membership);
    });
  });
});

// ─── TenantManagementService ──────────────────────────────────────────────────

describe('TenantManagementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateSettings', () => {
    it('updates tenant fields that are provided', async () => {
      const tenant = makeTenant();
      const em = buildMockEm({ findOneOrFail: vi.fn().mockResolvedValue(tenant) });
      const svc = new TenantManagementService(em);
      const vm = await svc.updateSettings('tenant-1', { name: 'New Name', systemPrompt: 'Hello' });
      expect(vm.name).toBe('New Name');
      expect(vm.systemPrompt).toBe('Hello');
    });

    it('leaves undefined fields unchanged', async () => {
      const tenant = makeTenant({ name: 'Original', systemPrompt: 'keep me' });
      const em = buildMockEm({ findOneOrFail: vi.fn().mockResolvedValue(tenant) });
      const svc = new TenantManagementService(em);
      const vm = await svc.updateSettings('tenant-1', { name: 'Changed' });
      expect(vm.systemPrompt).toBe('keep me');
    });

    it('flushes changes', async () => {
      const tenant = makeTenant();
      const em = buildMockEm({ findOneOrFail: vi.fn().mockResolvedValue(tenant) });
      const svc = new TenantManagementService(em);
      await svc.updateSettings('tenant-1', { name: 'X' });
      expect(em.flush).toHaveBeenCalled();
    });

    it('returns a TenantViewModel', async () => {
      const tenant = makeTenant();
      const em = buildMockEm({ findOneOrFail: vi.fn().mockResolvedValue(tenant) });
      const svc = new TenantManagementService(em);
      const vm = await svc.updateSettings('tenant-1', {});
      expect(vm).toMatchObject({ id: tenant.id, name: tenant.name, status: tenant.status });
      expect(typeof vm.createdAt).toBe('string');
    });

    it('calls evictProvider when providerConfig is updated', async () => {
      const { evictProvider } = await import('../src/providers/registry.js');
      const tenant = makeTenant();
      const em = buildMockEm({ findOneOrFail: vi.fn().mockResolvedValue(tenant) });
      const svc = new TenantManagementService(em);
      await svc.updateSettings('tenant-1', { providerConfig: { provider: 'openai' } });
      expect(evictProvider).toHaveBeenCalledWith('tenant-1');
    });
  });

  describe('inviteUser', () => {
    it('calls tenant.createInvite and persists the result', async () => {
      const tenant = makeTenant();
      const user = makeUser();
      const em = buildMockEm({
        findOneOrFail: vi.fn()
          .mockResolvedValueOnce(tenant)
          .mockResolvedValueOnce(user),
      });
      const svc = new TenantManagementService(em);
      await svc.inviteUser('tenant-1', 'user-1', { maxUses: 5, expiresInDays: 7 });
      expect(em.persist).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
    });

    it('returns an InviteViewModel', async () => {
      const tenant = makeTenant();
      const user = makeUser();
      const em = buildMockEm({
        findOneOrFail: vi.fn()
          .mockResolvedValueOnce(tenant)
          .mockResolvedValueOnce(user),
      });
      const svc = new TenantManagementService(em);
      const vm = await svc.inviteUser('tenant-1', 'user-1', { maxUses: 5, expiresInDays: 7 });
      expect(vm.token).toBeTruthy();
      expect(vm.tenantId).toBe('tenant-1');
      expect(vm.maxUses).toBe(5);
    });
  });

  describe('listMembers', () => {
    it('returns MemberViewModel array from memberships', async () => {
      const user = makeUser();
      const tenant = makeTenant();
      const membership = new TenantMembership();
      membership.id = 'm-1';
      membership.user = user;
      membership.tenant = tenant;
      membership.role = 'owner';
      membership.joinedAt = new Date();

      const em = buildMockEm({ find: vi.fn().mockResolvedValue([membership]) });
      const svc = new TenantManagementService(em);
      const members = await svc.listMembers('tenant-1');
      expect(members).toHaveLength(1);
      expect(members[0].userId).toBe(user.id);
      expect(members[0].email).toBe(user.email);
      expect(members[0].role).toBe('owner');
    });

    it('returns empty array when no members', async () => {
      const em = buildMockEm({ find: vi.fn().mockResolvedValue([]) });
      const svc = new TenantManagementService(em);
      const members = await svc.listMembers('tenant-1');
      expect(members).toEqual([]);
    });
  });

  describe('createAgent', () => {
    it('calls tenant.createAgent and persists the result', async () => {
      const tenant = makeTenant();
      const em = buildMockEm({ findOneOrFail: vi.fn().mockResolvedValue(tenant) });
      const svc = new TenantManagementService(em);
      await svc.createAgent('tenant-1', { name: 'MyAgent' });
      expect(em.persist).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
    });

    it('returns AgentViewModel', async () => {
      const tenant = makeTenant();
      const em = buildMockEm({ findOneOrFail: vi.fn().mockResolvedValue(tenant) });
      const svc = new TenantManagementService(em);
      const vm = await svc.createAgent('tenant-1', { name: 'MyAgent' });
      expect(vm.name).toBe('MyAgent');
      expect(vm.tenantId).toBe('tenant-1');
      expect(typeof vm.createdAt).toBe('string');
    });
  });

  describe('updateAgent', () => {
    it('updates agent fields and flushes', async () => {
      const tenant = makeTenant();
      const agent = makeAgent(tenant);
      const em = buildMockEm({ findOneOrFail: vi.fn().mockResolvedValue(agent) });
      const svc = new TenantManagementService(em);
      await svc.updateAgent('tenant-1', 'agent-1', { name: 'Renamed', systemPrompt: 'New prompt' });
      expect(agent.name).toBe('Renamed');
      expect(agent.systemPrompt).toBe('New prompt');
      expect(em.flush).toHaveBeenCalled();
    });

    it('returns updated AgentViewModel', async () => {
      const tenant = makeTenant();
      const agent = makeAgent(tenant);
      const em = buildMockEm({ findOneOrFail: vi.fn().mockResolvedValue(agent) });
      const svc = new TenantManagementService(em);
      const vm = await svc.updateAgent('tenant-1', 'agent-1', { name: 'Updated' });
      expect(vm.name).toBe('Updated');
      expect(vm.id).toBe('agent-1');
    });
  });

  describe('deleteAgent', () => {
    it('calls removeAndFlush', async () => {
      const tenant = makeTenant();
      const agent = makeAgent(tenant);
      const em = buildMockEm({ findOneOrFail: vi.fn().mockResolvedValue(agent) });
      const svc = new TenantManagementService(em);
      await svc.deleteAgent('tenant-1', 'agent-1');
      expect(em.removeAndFlush).toHaveBeenCalledWith(agent);
    });
  });

  describe('createApiKey', () => {
    it('calls agent.createApiKey and persists the result', async () => {
      const tenant = makeTenant();
      const agent = makeAgent(tenant);
      const em = buildMockEm({ findOneOrFail: vi.fn().mockResolvedValue(agent) });
      const svc = new TenantManagementService(em);
      await svc.createApiKey('tenant-1', 'agent-1', { name: 'My Key' });
      expect(em.persist).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
    });

    it('returns ApiKeyCreatedViewModel with rawKey', async () => {
      const tenant = makeTenant();
      const agent = makeAgent(tenant);
      const em = buildMockEm({ findOneOrFail: vi.fn().mockResolvedValue(agent) });
      const svc = new TenantManagementService(em);
      const vm = await svc.createApiKey('tenant-1', 'agent-1', { name: 'My Key' });
      expect(vm.rawKey).toBeTruthy();
      expect(vm.rawKey).toMatch(/^loom_sk_/);
      expect(vm.name).toBe('My Key');
      expect(vm.status).toBe('active');
    });
  });

  describe('revokeApiKey', () => {
    it('sets status to revoked and revokedAt', async () => {
      const apiKey = new ApiKey();
      apiKey.id = 'key-1';
      apiKey.status = 'active';
      apiKey.revokedAt = null;
      apiKey.name = 'test';
      apiKey.keyPrefix = 'loom_sk_test';
      apiKey.keyHash = 'hash';
      apiKey.createdAt = new Date();

      const em = buildMockEm({ findOneOrFail: vi.fn().mockResolvedValue(apiKey) });
      const svc = new TenantManagementService(em);
      await svc.revokeApiKey('tenant-1', 'key-1');
      expect(apiKey.status).toBe('revoked');
      expect(apiKey.revokedAt).toBeInstanceOf(Date);
    });

    it('flushes the change', async () => {
      const apiKey = new ApiKey();
      apiKey.id = 'key-1';
      apiKey.status = 'active';
      apiKey.revokedAt = null;
      apiKey.name = 'test';
      apiKey.keyPrefix = 'loom_sk_test';
      apiKey.keyHash = 'hash';
      apiKey.createdAt = new Date();

      const em = buildMockEm({ findOneOrFail: vi.fn().mockResolvedValue(apiKey) });
      const svc = new TenantManagementService(em);
      await svc.revokeApiKey('tenant-1', 'key-1');
      expect(em.flush).toHaveBeenCalled();
    });

    it('returns keyHash that can be used for cache invalidation', async () => {
      const apiKey = new ApiKey();
      apiKey.id = 'key-1';
      apiKey.status = 'active';
      apiKey.revokedAt = null;
      apiKey.name = 'test';
      apiKey.keyPrefix = 'loom_sk_test';
      apiKey.keyHash = 'expected-hash-123';
      apiKey.createdAt = new Date();

      const em = buildMockEm({ findOneOrFail: vi.fn().mockResolvedValue(apiKey) });
      const svc = new TenantManagementService(em);
      const result = await svc.revokeApiKey('tenant-1', 'key-1');
      expect(result.keyHash).toBe('expected-hash-123');
    });
  });

  describe('listApiKeys', () => {
    it('returns ApiKeyViewModel array', async () => {
      const tenant = makeTenant();
      const agent = makeAgent(tenant);
      const apiKey = new ApiKey();
      apiKey.id = 'key-1';
      apiKey.agent = agent;
      apiKey.tenant = tenant;
      apiKey.name = 'My Key';
      apiKey.keyPrefix = 'loom_sk_test';
      apiKey.keyHash = 'hash';
      apiKey.status = 'active';
      apiKey.revokedAt = null;
      apiKey.createdAt = new Date();

      const em = buildMockEm({ find: vi.fn().mockResolvedValue([apiKey]) });
      const svc = new TenantManagementService(em);
      const keys = await svc.listApiKeys('tenant-1');
      expect(keys).toHaveLength(1);
      expect(keys[0].id).toBe('key-1');
      expect(keys[0].name).toBe('My Key');
      expect(keys[0].agentId).toBe('agent-1');
    });
  });

  describe('createSubtenant', () => {
    it('inherits parent memberships', async () => {
      const user = makeUser({ id: 'user-1' });
      const parent = makeTenant({ id: 'parent-1' });
      const membership = new TenantMembership();
      membership.id = 'mem-1';
      membership.tenant = parent;
      membership.user = user;
      membership.role = 'owner';
      membership.joinedAt = new Date();
      parent.members = [membership];
      
      const em = buildMockEm({
        findOneOrFail: vi.fn().mockResolvedValueOnce(parent),
      });
      const svc = new TenantManagementService(em);
      await svc.createSubtenant('parent-1', { name: 'Child Tenant', createdByUserId: 'user-1' });
      const persistCalls = (em.persist as any).mock.calls;
      expect(persistCalls).toHaveLength(1);
      const child = persistCalls[0][0] as Tenant;
      expect(child).toBeInstanceOf(Tenant);
      expect(child.members).toHaveLength(1);
      expect(child.members[0].role).toBe('owner');
      expect((child.members[0].user as any)?.id).toBe('user-1');
    });
  });

  describe('revokeInvite', () => {
    it('throws 404 if invite not found', async () => {
      const em = buildMockEm({ findOne: vi.fn().mockResolvedValue(null) });
      const svc = new TenantManagementService(em);
      await expect(svc.revokeInvite('tenant-1', 'invite-999'))
        .rejects.toThrow('Invite not found');
    });

    it('sets revokedAt on the invite', async () => {
      const invite = new Invite();
      invite.id = 'invite-1';
      invite.token = 'token-123';
      invite.tenant = makeTenant();
      invite.maxUses = null;
      invite.useCount = 0;
      invite.expiresAt = new Date(Date.now() + 86_400_000);
      invite.revokedAt = null;
      invite.createdAt = new Date();

      const em = buildMockEm({ findOne: vi.fn().mockResolvedValue(invite) });
      const svc = new TenantManagementService(em);
      await svc.revokeInvite('tenant-1', 'invite-1');
      expect(invite.revokedAt).toBeInstanceOf(Date);
      expect(em.flush).toHaveBeenCalled();
    });
  });

  describe('listInvites', () => {
    it('returns invites for the tenant', async () => {
      const invite = new Invite();
      invite.id = 'invite-1';
      invite.token = 'token-123';
      invite.tenant = makeTenant({ id: 'tenant-1' });
      invite.maxUses = 5;
      invite.useCount = 2;
      invite.expiresAt = new Date();
      invite.revokedAt = null;
      invite.createdAt = new Date();

      const em = buildMockEm({ find: vi.fn().mockResolvedValue([invite]) });
      const svc = new TenantManagementService(em);
      const invites = await svc.listInvites('tenant-1');
      expect(invites).toHaveLength(1);
      expect(invites[0].id).toBe('invite-1');
      expect(invites[0].maxUses).toBe(5);
      expect(invites[0].useCount).toBe(2);
    });
  });

  describe('updateMemberRole', () => {
    it('throws 400 "Cannot demote the last owner" when demoting the only owner', async () => {
      const membership = new TenantMembership();
      membership.id = 'm-1';
      membership.role = 'owner';
      membership.user = makeUser();
      membership.tenant = makeTenant();
      membership.joinedAt = new Date();

      const em = buildMockEm({
        findOneOrFail: vi.fn().mockResolvedValue(membership),
        count: vi.fn().mockResolvedValue(1),
      });
      const svc = new TenantManagementService(em);
      await expect(svc.updateMemberRole('tenant-1', 'user-1', 'member'))
        .rejects.toThrow('Cannot demote the last owner');
    });

    it('updates role successfully when >1 owner', async () => {
      const membership = new TenantMembership();
      membership.id = 'm-1';
      membership.role = 'owner';
      membership.user = makeUser();
      membership.tenant = makeTenant();
      membership.joinedAt = new Date();

      const em = buildMockEm({
        findOneOrFail: vi.fn().mockResolvedValue(membership),
        count: vi.fn().mockResolvedValue(2),
      });
      const svc = new TenantManagementService(em);
      await svc.updateMemberRole('tenant-1', 'user-1', 'member');
      expect(membership.role).toBe('member');
      expect(em.flush).toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('throws 400 "Use leave instead" if targeting self', async () => {
      const em = buildMockEm();
      const svc = new TenantManagementService(em);
      await expect(svc.removeMember('tenant-1', 'user-1', 'user-1'))
        .rejects.toThrow('Use leave instead');
    });

    it('throws 404 if membership not found', async () => {
      const em = buildMockEm({ findOne: vi.fn().mockResolvedValue(null) });
      const svc = new TenantManagementService(em);
      await expect(svc.removeMember('tenant-1', 'user-2', 'user-1'))
        .rejects.toThrow('Membership not found');
    });

    it('throws 400 if trying to remove the last owner', async () => {
      const membership = new TenantMembership();
      membership.id = 'm-1';
      membership.role = 'owner';
      membership.user = makeUser({ id: 'user-2' });
      membership.tenant = makeTenant();
      membership.joinedAt = new Date();

      const em = buildMockEm({
        findOne: vi.fn().mockResolvedValue(membership),
        count: vi.fn().mockResolvedValue(1),
      });
      const svc = new TenantManagementService(em);
      await expect(svc.removeMember('tenant-1', 'user-2', 'user-1'))
        .rejects.toThrow('Cannot remove the last owner');
    });

    it('removes membership on success', async () => {
      const membership = new TenantMembership();
      membership.id = 'm-1';
      membership.role = 'member';
      membership.user = makeUser({ id: 'user-2' });
      membership.tenant = makeTenant();
      membership.joinedAt = new Date();

      const em = buildMockEm({
        findOne: vi.fn().mockResolvedValue(membership),
      });
      const svc = new TenantManagementService(em);
      await svc.removeMember('tenant-1', 'user-2', 'user-1');
      expect(em.removeAndFlush).toHaveBeenCalledWith(membership);
    });
  });
});

// ─── TenantService ────────────────────────────────────────────────────────────

describe('TenantService', () => {
  describe('loadByApiKey', () => {
    function makeApiKeyRecord(tenant: Tenant, agent: Agent): ApiKey {
      const key = new ApiKey();
      key.id = 'key-1';
      key.tenant = tenant;
      key.agent = agent;
      key.keyHash = 'will-be-overridden';
      key.keyPrefix = 'loom_sk_test';
      key.name = 'Test Key';
      key.status = 'active';
      key.revokedAt = null;
      key.createdAt = new Date();
      return key;
    }

    it('hashes the key and looks it up', async () => {
      const { createHash } = await import('node:crypto');
      const tenant = makeTenant();
      const agent = makeAgent(tenant);
      const rawKey = 'loom_sk_testkey';
      const expectedHash = createHash('sha256').update(rawKey).digest('hex');
      const apiKeyRecord = makeApiKeyRecord(tenant, agent);

      const em = buildMockEm({ findOne: vi.fn().mockResolvedValue(apiKeyRecord) });
      const svc = new TenantService(em);
      await svc.loadByApiKey(rawKey);
      expect(em.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ keyHash: expectedHash }),
        expect.anything(),
      );
    });

    it('returns a TenantContext with tenant+agent config', async () => {
      const tenant = makeTenant();
      const agent = makeAgent(tenant);
      const apiKeyRecord = makeApiKeyRecord(tenant, agent);

      const em = buildMockEm({ findOne: vi.fn().mockResolvedValue(apiKeyRecord) });
      const svc = new TenantService(em);
      const ctx = await svc.loadByApiKey('loom_sk_testkey');
      expect(ctx.tenantId).toBe('tenant-1');
      expect(ctx.agentId).toBe('agent-1');
      expect(ctx.name).toBe('Test Tenant');
    });

    it('throws "Invalid API key" when key not found', async () => {
      const em = buildMockEm({ findOne: vi.fn().mockResolvedValue(null) });
      const svc = new TenantService(em);
      await expect(svc.loadByApiKey('bad-key')).rejects.toThrow('Invalid API key');
    });

    it('throws "Tenant is not active" when tenant is suspended', async () => {
      const tenant = makeTenant({ status: 'suspended' });
      const agent = makeAgent(tenant);
      const apiKeyRecord = makeApiKeyRecord(tenant, agent);

      const em = buildMockEm({ findOne: vi.fn().mockResolvedValue(apiKeyRecord) });
      const svc = new TenantService(em);
      await expect(svc.loadByApiKey('some-key')).rejects.toThrow('Tenant is not active');
    });
  });
});
