import { promisify } from 'node:util';
import { scrypt, randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { createSigner } from 'fast-jwt';
import type { EntityManager } from '@mikro-orm/core';
import { User } from '../../domain/entities/User.js';
import { Tenant } from '../../domain/entities/Tenant.js';
import { TenantMembership } from '../../domain/entities/TenantMembership.js';
import { Invite } from '../../domain/entities/Invite.js';
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

    const passwordHash = await hashPassword(dto.password);

    const user = new User();
    user.id = randomUUID();
    user.email = dto.email.toLowerCase();
    user.passwordHash = passwordHash;
    user.createdAt = new Date();
    user.lastLogin = null;

    const tenant = new Tenant();
    tenant.id = randomUUID();
    tenant.name = dto.tenantName ?? `${dto.email}'s Workspace`;
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

    this.em.persist(user);
    this.em.persist(tenant);
    this.em.persist(membership);
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

    // Find the user's primary tenant (first 'owner' membership)
    const membership = await this.em.findOne(
      TenantMembership,
      { user: user.id },
      { populate: ['tenant'], orderBy: { joinedAt: 'ASC' } },
    );
    const tenantId = (membership?.tenant as any)?.id ?? '';
    const tenantName = (membership?.tenant as any)?.name ?? '';

    const token = signToken({ sub: user.id, tenantId, role: membership?.role ?? 'member' });
    return { token, userId: user.id, tenantId, email: user.email, tenantName };
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

    // Add membership if not already a member
    const existingMembership = await this.em.findOne(TenantMembership, {
      user: user.id,
      tenant: tenant.id,
    });

    if (!existingMembership) {
      const membership = new TenantMembership();
      membership.id = randomUUID();
      membership.user = user;
      membership.tenant = tenant;
      membership.role = role;
      membership.joinedAt = new Date();
      this.em.persist(membership);
    } else {
      role = existingMembership.role;
    }

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
}
