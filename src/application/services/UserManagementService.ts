import { promisify } from 'node:util';
import { scrypt, randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { createSigner } from 'fast-jwt';
import type { EntityManager } from '@mikro-orm/core';
import { User } from '../../domain/entities/User.js';
import { Tenant } from '../../domain/entities/Tenant.js';
import { TenantMembership } from '../../domain/entities/TenantMembership.js';
import { Invite } from '../../domain/entities/Invite.js';
import { Agent } from '../../domain/entities/Agent.js';
import type { CreateUserDto, LoginDto, AcceptInviteDto, AuthResult } from '../dtos/index.js';

const scryptAsync = promisify(scrypt);

const PORTAL_JWT_SECRET =
  process.env.PORTAL_JWT_SECRET ?? 'unsafe-portal-secret-change-in-production';

const signToken = createSigner({ key: PORTAL_JWT_SECRET, expiresIn: 86_400_000 });

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, key] = storedHash.split(':');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const storedKey = Buffer.from(key, 'hex');
  return derivedKey.length === storedKey.length && timingSafeEqual(derivedKey, storedKey);
}

export class UserManagementService {
  constructor(private readonly em: EntityManager) {}

  async createUser(dto: CreateUserDto): Promise<AuthResult> {
    if (!dto.email || !dto.password || dto.password.length < 8) {
      throw new Error('Valid email and password (min 8 chars) required');
    }

    // Email uniqueness pre-check
    const existingUser = await this.em.findOne(User, { email: dto.email.toLowerCase() });
    if (existingUser) {
      throw Object.assign(new Error('Email already registered'), { status: 409 });
    }

    const passwordHash = await hashPassword(dto.password);

    const user = new User();
    user.id = randomUUID();
    user.email = dto.email.toLowerCase();
    user.passwordHash = passwordHash;
    user.createdAt = new Date();
    user.lastLogin = null;

    const tenant = new Tenant();
    tenant.id = randomUUID();
    tenant.name = (dto.tenantName ?? `${dto.email}'s Workspace`).trim();
    tenant.parentId = null;
    tenant.providerConfig = null;
    tenant.systemPrompt = null;
    tenant.skills = null;
    tenant.mcpEndpoints = null;
    tenant.status = 'active';
    tenant.availableModels = null;
    tenant.updatedAt = null;
    tenant.createdAt = new Date();
    tenant.agents = [];
    tenant.members = [];
    tenant.invites = [];

    const membership = new TenantMembership();
    membership.id = randomUUID();
    membership.user = user;
    membership.tenant = tenant;
    membership.role = 'owner';
    membership.joinedAt = new Date();

    // Create default agent for the tenant
    const agent = new Agent();
    agent.id = randomUUID();
    agent.tenant = tenant;
    agent.name = 'Default';
    agent.providerConfig = null;
    agent.systemPrompt = null;
    agent.skills = null;
    agent.mcpEndpoints = null;
    agent.mergePolicies = { system_prompt: 'prepend', skills: 'merge', mcp_endpoints: 'merge' };
    agent.availableModels = null;
    agent.conversationsEnabled = false;
    agent.conversationTokenLimit = 0;
    agent.conversationSummaryModel = null;
    agent.createdAt = new Date();
    agent.updatedAt = null;

    this.em.persist(user);
    this.em.persist(tenant);
    this.em.persist(membership);
    this.em.persist(agent);
    await this.em.flush();

    const token = signToken({ sub: user.id, tenantId: tenant.id, role: 'owner' });
    return { token, userId: user.id, tenantId: tenant.id, email: user.email, tenantName: tenant.name };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    if (!dto.email || !dto.password) {
      throw new Error('Email and password required');
    }

    const user = await this.em.findOne(User, { email: dto.email.toLowerCase() });
    if (!user) throw new Error('Invalid credentials');

    const valid = await verifyPassword(dto.password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');

    user.lastLogin = new Date();
    await this.em.flush();

    // Load all tenant memberships for the user
    const memberships = await this.em.find(
      TenantMembership,
      { user: user.id },
      { populate: ['tenant'], orderBy: { joinedAt: 'ASC' } },
    );

    // Filter to only active tenants
    const activeMemberships = memberships.filter(
      (m) => (m.tenant as Tenant).status === 'active'
    );

    if (activeMemberships.length === 0) {
      throw Object.assign(new Error('No active tenant memberships'), { status: 403 });
    }

    // Primary tenant is the first active membership
    const primaryMembership = activeMemberships[0];
    const tenantId = (primaryMembership.tenant as any)?.id ?? '';
    const tenantName = (primaryMembership.tenant as any)?.name ?? '';

    // Build tenants list for response
    const tenants = activeMemberships.map((m) => ({
      id: (m.tenant as any)?.id ?? '',
      name: (m.tenant as any)?.name ?? '',
      role: m.role,
    }));

    const token = signToken({ sub: user.id, tenantId, role: primaryMembership.role });
    return { token, userId: user.id, tenantId, email: user.email, tenantName, tenants };
  }

  async acceptInvite(dto: AcceptInviteDto): Promise<AuthResult> {
    if (!dto.password || dto.password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    const invite = await this.em.findOne(
      Invite,
      { token: dto.inviteToken },
      { populate: ['tenant'] },
    );

    if (!invite) throw new Error('Invalid invite token');
    if (invite.expiresAt < new Date()) throw new Error('Invite has expired');
    if (invite.revokedAt) throw new Error('Invite has been revoked');
    if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
      throw new Error('Invite has reached max uses');
    }

    const tenant = invite.tenant as Tenant;

    // Check tenant status
    if (tenant.status !== 'active') {
      throw Object.assign(new Error('Tenant is not active'), { status: 400 });
    }

    let user = await this.em.findOne(User, { email: dto.email.toLowerCase() });
    let role = 'member';

    if (!user) {
      const passwordHash = await hashPassword(dto.password);
      user = new User();
      user.id = randomUUID();
      user.email = dto.email.toLowerCase();
      user.passwordHash = passwordHash;
      user.createdAt = new Date();
      user.lastLogin = null;
      this.em.persist(user);
    }

    // Check for existing membership
    const existingMembership = await this.em.findOne(TenantMembership, {
      user: user.id,
      tenant: tenant.id,
    });

    if (existingMembership) {
      throw Object.assign(new Error('Already a member of this tenant'), { status: 409 });
    }

    const membership = new TenantMembership();
    membership.id = randomUUID();
    membership.user = user;
    membership.tenant = tenant;
    membership.role = role;
    membership.joinedAt = new Date();
    this.em.persist(membership);

    invite.useCount += 1;
    await this.em.flush();

    const token = signToken({ sub: user.id, tenantId: tenant.id, role });
    return {
      token,
      userId: user.id,
      tenantId: tenant.id,
      email: user.email,
      tenantName: tenant.name,
    };
  }

  async switchTenant(userId: string, newTenantId: string): Promise<AuthResult> {
    const user = await this.em.findOneOrFail(User, { id: userId });
    
    const membership = await this.em.findOne(
      TenantMembership,
      { user: userId, tenant: newTenantId },
      { populate: ['tenant'] },
    );

    if (!membership) {
      throw Object.assign(new Error('No membership in requested tenant'), { status: 403 });
    }

    const tenant = membership.tenant as Tenant;
    if (tenant.status !== 'active') {
      throw Object.assign(new Error('Tenant is not active'), { status: 400 });
    }

    // Load all active tenant memberships
    const allMemberships = await this.em.find(
      TenantMembership,
      { user: userId },
      { populate: ['tenant'] },
    );

    const activeMemberships = allMemberships.filter(
      (m) => (m.tenant as Tenant).status === 'active'
    );

    const tenants = activeMemberships.map((m) => ({
      id: (m.tenant as any)?.id ?? '',
      name: (m.tenant as any)?.name ?? '',
      role: m.role,
    }));

    const token = signToken({ sub: userId, tenantId: newTenantId, role: membership.role });
    return {
      token,
      userId: user.id,
      tenantId: newTenantId,
      email: user.email,
      tenantName: tenant.name,
      tenants,
    };
  }

  async leaveTenant(userId: string, tenantId: string, currentTenantId: string): Promise<void> {
    // Prevent leaving currently active tenant
    if (tenantId === currentTenantId) {
      throw Object.assign(new Error('Switch to a different tenant before leaving'), { status: 400 });
    }

    const membership = await this.em.findOne(TenantMembership, {
      user: userId,
      tenant: tenantId,
    });

    if (!membership) {
      throw Object.assign(new Error('Membership not found'), { status: 404 });
    }

    // Check if user is the last owner
    if (membership.role === 'owner') {
      const ownerCount = await this.em.count(TenantMembership, {
        tenant: tenantId,
        role: 'owner',
      });

      if (ownerCount === 1) {
        throw Object.assign(new Error('Cannot leave tenant as the last owner'), { status: 400 });
      }
    }

    await this.em.removeAndFlush(membership);
  }
}
