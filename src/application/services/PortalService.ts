/**
 * PortalService — encapsulates all database access for portal routes.
 * Route handlers stay thin: parse HTTP → call PortalService → return DTO.
 */
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createSigner } from 'fast-jwt';
import pg from 'pg';

const scryptAsync = promisify(scrypt);

const PORTAL_JWT_SECRET =
  process.env.PORTAL_JWT_SECRET || 'unsafe-portal-secret-change-in-production';
const signPortalToken = createSigner({ key: PORTAL_JWT_SECRET, expiresIn: 86_400_000 });

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, key] = storedHash.split(':');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
}

function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const rawKey = 'loom_sk_' + randomBytes(24).toString('base64url');
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 15);
  return { rawKey, keyHash, keyPrefix };
}

export class PortalService {
  constructor(private readonly pool: pg.Pool) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  async signup(email: string, password: string, tenantName: string) {
    const emailCheck = await this.pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()],
    );
    if (emailCheck.rows.length > 0) {
      throw Object.assign(new Error('Email already registered'), { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    await this.pool.query('BEGIN');
    try {
      const tenantResult = await this.pool.query<{ id: string; name: string }>(
        'INSERT INTO tenants (name) VALUES ($1) RETURNING id, name',
        [tenantName.trim()],
      );
      const tenant = tenantResult.rows[0];

      const userResult = await this.pool.query<{ id: string; email: string }>(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
        [email.toLowerCase(), passwordHash],
      );
      const user = userResult.rows[0];

      await this.pool.query(
        `INSERT INTO tenant_memberships (user_id, tenant_id, role) VALUES ($1, $2, 'owner')`,
        [user.id, tenant.id],
      );
      // Create default agent so API keys created later have an agent to reference
      await this.pool.query(
        `INSERT INTO agents (tenant_id, name) VALUES ($1, 'Default')`,
        [tenant.id],
      );
      await this.pool.query('COMMIT');

      const token = signPortalToken({ sub: user.id, tenantId: tenant.id, role: 'owner' });
      return { token, userId: user.id, email: user.email, tenantId: tenant.id, tenantName: tenant.name };
    } catch (err) {
      await this.pool.query('ROLLBACK');
      throw err;
    }
  }

  async signupWithInvite(email: string, password: string, inviteToken: string) {
    const inviteResult = await this.pool.query<{
      id: string; tenant_id: string; tenant_name: string;
      max_uses: number | null; use_count: number;
    }>(
      `SELECT i.id, i.tenant_id, t.name AS tenant_name, i.max_uses, i.use_count
       FROM invites i
       JOIN tenants t ON i.tenant_id = t.id
       WHERE i.token = $1
         AND i.revoked_at IS NULL
         AND i.expires_at > now()
         AND (i.max_uses IS NULL OR i.use_count < i.max_uses)
         AND t.status = 'active'`,
      [inviteToken],
    );
    if (inviteResult.rows.length === 0) {
      throw Object.assign(new Error('Invalid or expired invite token'), { status: 400 });
    }
    const invite = inviteResult.rows[0];

    await this.pool.query('BEGIN');
    try {
      const existingUser = await this.pool.query<{ id: string; email: string }>(
        'SELECT id, email FROM users WHERE email = $1',
        [email.toLowerCase()],
      );

      let userId: string;
      let userEmail: string;

      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].id;
        userEmail = existingUser.rows[0].email;
        const memberCheck = await this.pool.query(
          'SELECT id FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2',
          [userId, invite.tenant_id],
        );
        if (memberCheck.rows.length > 0) {
          await this.pool.query('ROLLBACK');
          throw Object.assign(new Error('Already a member of this tenant'), { status: 409 });
        }
      } else {
        const passwordHash = await hashPassword(password);
        const newUser = await this.pool.query<{ id: string; email: string }>(
          'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
          [email.toLowerCase(), passwordHash],
        );
        userId = newUser.rows[0].id;
        userEmail = newUser.rows[0].email;
      }

      await this.pool.query(
        `INSERT INTO tenant_memberships (user_id, tenant_id, role) VALUES ($1, $2, 'member')`,
        [userId, invite.tenant_id],
      );
      await this.pool.query(
        'UPDATE invites SET use_count = use_count + 1 WHERE id = $1',
        [invite.id],
      );
      await this.pool.query('COMMIT');

      const token = signPortalToken({ sub: userId, tenantId: invite.tenant_id, role: 'member' });
      return {
        token,
        userId,
        email: userEmail,
        tenantId: invite.tenant_id,
        tenantName: invite.tenant_name,
      };
    } catch (err) {
      await this.pool.query('ROLLBACK');
      throw err;
    }
  }

  async login(email: string, password: string) {
    const userResult = await this.pool.query<{
      id: string; email: string; password_hash: string;
    }>(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()],
    );
    if (userResult.rows.length === 0) return null;

    const user = userResult.rows[0];
    try {
      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) return null;
    } catch {
      return null;
    }

    const membershipsResult = await this.pool.query<{
      tenant_id: string; tenant_name: string; role: string; tenant_status: string;
    }>(
      `SELECT tm.tenant_id, t.name AS tenant_name, tm.role, t.status AS tenant_status
       FROM tenant_memberships tm
       JOIN tenants t ON tm.tenant_id = t.id
       WHERE tm.user_id = $1 AND t.status = 'active'
       ORDER BY tm.joined_at ASC`,
      [user.id],
    );
    if (membershipsResult.rows.length === 0) {
      throw Object.assign(new Error('No active tenant memberships'), { status: 403 });
    }

    const memberships = membershipsResult.rows;
    const defaultMembership = memberships[0];

    await this.pool.query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);

    const token = signPortalToken({
      sub: user.id,
      tenantId: defaultMembership.tenant_id,
      role: defaultMembership.role,
    });
    return {
      token,
      userId: user.id,
      email: user.email,
      tenantId: defaultMembership.tenant_id,
      tenantName: defaultMembership.tenant_name,
      tenants: memberships.map((m) => ({ id: m.tenant_id, name: m.tenant_name, role: m.role })),
    };
  }

  async switchTenant(userId: string, newTenantId: string) {
    const membershipResult = await this.pool.query<{
      role: string; tenant_name: string; tenant_status: string;
    }>(
      `SELECT tm.role, t.name AS tenant_name, t.status AS tenant_status
       FROM tenant_memberships tm
       JOIN tenants t ON tm.tenant_id = t.id
       WHERE tm.user_id = $1 AND tm.tenant_id = $2`,
      [userId, newTenantId],
    );
    if (membershipResult.rows.length === 0) {
      throw Object.assign(new Error('No membership in requested tenant'), { status: 403 });
    }
    const membership = membershipResult.rows[0];
    if (membership.tenant_status !== 'active') {
      throw Object.assign(new Error('Tenant is inactive'), { status: 403 });
    }

    const userResult = await this.pool.query<{ id: string; email: string }>(
      'SELECT id, email FROM users WHERE id = $1',
      [userId],
    );
    const user = userResult.rows[0];

    const allMembershipsResult = await this.pool.query<{
      tenant_id: string; tenant_name: string; role: string;
    }>(
      `SELECT tm.tenant_id, t.name AS tenant_name, tm.role
       FROM tenant_memberships tm
       JOIN tenants t ON tm.tenant_id = t.id
       WHERE tm.user_id = $1 AND t.status = 'active'
       ORDER BY tm.joined_at ASC`,
      [userId],
    );

    const token = signPortalToken({
      sub: userId,
      tenantId: newTenantId,
      role: membership.role,
    });
    return {
      token,
      user,
      tenantId: newTenantId,
      tenantName: membership.tenant_name,
      tenants: allMembershipsResult.rows,
    };
  }

  // ── Profile ───────────────────────────────────────────────────────────────

  async getMe(userId: string, tenantId: string) {
    const result = await this.pool.query<{
      id: string; email: string; role: string;
      tenant_id: string; tenant_name: string;
      provider_config: Record<string, unknown> | null;
      available_models: string[] | null;
    }>(
      `SELECT u.id, u.email, tm.role, t.id AS tenant_id, t.name AS tenant_name, t.provider_config, t.available_models
       FROM users u
       JOIN tenant_memberships tm ON tm.user_id = u.id
       JOIN tenants t ON t.id = tm.tenant_id
       WHERE u.id = $1 AND t.id = $2`,
      [userId, tenantId],
    );
    if (result.rows.length === 0) return null;

    const tenantsResult = await this.pool.query<{
      tenant_id: string; tenant_name: string; role: string;
    }>(
      `SELECT tm.tenant_id, t.name AS tenant_name, tm.role
       FROM tenant_memberships tm
       JOIN tenants t ON tm.tenant_id = t.id
       WHERE tm.user_id = $1 AND t.status = 'active'
       ORDER BY tm.joined_at ASC`,
      [userId],
    );

    const [agentsResult, subtenantsResult] = await Promise.all([
      this.pool.query<{ id: string; name: string }>(
        'SELECT id, name FROM agents WHERE tenant_id = $1 ORDER BY created_at',
        [tenantId],
      ),
      this.pool.query<{ id: string; name: string; status: string }>(
        'SELECT id, name, status FROM tenants WHERE parent_id = $1 ORDER BY created_at',
        [tenantId],
      ),
    ]);

    return {
      row: result.rows[0],
      tenants: tenantsResult.rows,
      agents: agentsResult.rows,
      subtenants: subtenantsResult.rows,
    };
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  async updateProviderSettings(
    tenantId: string,
    providerConfig: Record<string, unknown>,
    availableModels?: string[] | null,
  ) {
    if (availableModels !== undefined) {
      await this.pool.query(
        'UPDATE tenants SET provider_config = $1, available_models = $2, updated_at = now() WHERE id = $3',
        [
          JSON.stringify(providerConfig),
          availableModels !== null ? JSON.stringify(availableModels) : null,
          tenantId,
        ],
      );
    } else {
      await this.pool.query(
        'UPDATE tenants SET provider_config = $1, updated_at = now() WHERE id = $2',
        [JSON.stringify(providerConfig), tenantId],
      );
    }
  }

  // ── API Keys ──────────────────────────────────────────────────────────────

  async listApiKeys(tenantId: string) {
    const result = await this.pool.query<{
      id: string; name: string; key_prefix: string; status: string;
      created_at: string; revoked_at: string | null;
    }>(
      `SELECT id, name, key_prefix, status, created_at, revoked_at
       FROM api_keys
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
    );
    return result.rows;
  }

  async createApiKey(tenantId: string, agentId: string, name: string) {
    const agentCheck = await this.pool.query(
      'SELECT id FROM agents WHERE id = $1 AND tenant_id = $2',
      [agentId, tenantId],
    );
    if (agentCheck.rows.length === 0) return null;

    const { rawKey, keyHash, keyPrefix } = generateApiKey();
    const result = await this.pool.query<{
      id: string; name: string; key_prefix: string; status: string; created_at: string;
    }>(
      `INSERT INTO api_keys (tenant_id, agent_id, name, key_prefix, key_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, key_prefix, status, created_at`,
      [tenantId, agentId, name.trim(), keyPrefix, keyHash],
    );
    return { ...result.rows[0], rawKey };
  }

  /** Revokes an API key. Returns the key_hash for cache invalidation, or null if not found. */
  async revokeApiKey(tenantId: string, keyId: string): Promise<string | null> {
    const result = await this.pool.query<{ key_hash: string }>(
      `UPDATE api_keys
       SET status = 'revoked', revoked_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING key_hash`,
      [keyId, tenantId],
    );
    return result.rows.length > 0 ? result.rows[0].key_hash : null;
  }

  // ── Traces ────────────────────────────────────────────────────────────────

  async listTraces(tenantId: string, limit: number, cursor?: string) {
    let result;
    if (cursor) {
      result = await this.pool.query(
        `SELECT id, tenant_id, model, provider, status_code, latency_ms,
                prompt_tokens, completion_tokens, ttfb_ms, gateway_overhead_ms, created_at
         FROM   traces
         WHERE  tenant_id = $1
           AND  created_at < $2::timestamptz
         ORDER  BY created_at DESC
         LIMIT  $3`,
        [tenantId, cursor, limit],
      );
    } else {
      result = await this.pool.query(
        `SELECT id, tenant_id, model, provider, status_code, latency_ms,
                prompt_tokens, completion_tokens, ttfb_ms, gateway_overhead_ms, created_at
         FROM   traces
         WHERE  tenant_id = $1
         ORDER  BY created_at DESC
         LIMIT  $2`,
        [tenantId, limit],
      );
    }
    return result.rows;
  }

  // ── Invites ───────────────────────────────────────────────────────────────

  async getInviteInfo(token: string) {
    const result = await this.pool.query<{
      tenant_name: string; expires_at: string;
      revoked_at: string | null; max_uses: number | null; use_count: number;
      tenant_status: string;
    }>(
      `SELECT t.name AS tenant_name, i.expires_at, i.revoked_at,
              i.max_uses, i.use_count, t.status AS tenant_status
       FROM invites i
       JOIN tenants t ON i.tenant_id = t.id
       WHERE i.token = $1`,
      [token],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async createInvite(
    tenantId: string,
    userId: string,
    maxUses: number | null | undefined,
    expiresInHours: number,
  ) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
    const result = await this.pool.query<{
      id: string; token: string; max_uses: number | null;
      use_count: number; expires_at: string; created_at: string;
    }>(
      `INSERT INTO invites (tenant_id, token, created_by, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, token, max_uses, use_count, expires_at, created_at`,
      [tenantId, token, userId, maxUses ?? null, expiresAt],
    );
    return result.rows[0];
  }

  async listInvites(tenantId: string) {
    const result = await this.pool.query<{
      id: string; token: string; max_uses: number | null; use_count: number;
      expires_at: string; revoked_at: string | null; created_at: string;
      creator_id: string; creator_email: string;
    }>(
      `SELECT i.id, i.token, i.max_uses, i.use_count, i.expires_at, i.revoked_at,
              i.created_at, u.id AS creator_id, u.email AS creator_email
       FROM invites i
       JOIN users u ON i.created_by = u.id
       WHERE i.tenant_id = $1
       ORDER BY i.created_at DESC`,
      [tenantId],
    );
    return result.rows;
  }

  async revokeInvite(tenantId: string, inviteId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE invites SET revoked_at = now()
       WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL
       RETURNING id`,
      [inviteId, tenantId],
    );
    return result.rows.length > 0;
  }

  // ── Members ───────────────────────────────────────────────────────────────

  async listMembers(tenantId: string) {
    const result = await this.pool.query<{
      id: string; email: string; role: string; joined_at: string; last_login: string | null;
    }>(
      `SELECT u.id, u.email, tm.role, tm.joined_at, u.last_login
       FROM tenant_memberships tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.tenant_id = $1
       ORDER BY tm.joined_at ASC`,
      [tenantId],
    );
    return result.rows;
  }

  async updateMemberRole(tenantId: string, targetUserId: string, role: string) {
    if (role === 'member') {
      const ownerCount = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM tenant_memberships
         WHERE tenant_id = $1 AND role = 'owner'`,
        [tenantId],
      );
      if (parseInt(ownerCount.rows[0].count, 10) <= 1) {
        throw Object.assign(new Error('Cannot demote the last owner'), { status: 400 });
      }
    }

    const result = await this.pool.query<{ user_id: string; role: string; joined_at: string }>(
      `UPDATE tenant_memberships SET role = $1
       WHERE user_id = $2 AND tenant_id = $3
       RETURNING user_id, role, joined_at`,
      [role, targetUserId, tenantId],
    );
    if (result.rows.length === 0) return null;

    const userResult = await this.pool.query<{ email: string }>(
      'SELECT email FROM users WHERE id = $1',
      [targetUserId],
    );
    return { ...result.rows[0], email: userResult.rows[0].email };
  }

  async removeMember(tenantId: string, targetUserId: string, requestingUserId: string) {
    if (targetUserId === requestingUserId) {
      throw Object.assign(
        new Error('Cannot remove yourself; use leave instead'),
        { status: 400 },
      );
    }

    const targetRole = await this.pool.query<{ role: string }>(
      'SELECT role FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2',
      [targetUserId, tenantId],
    );
    if (targetRole.rows.length === 0) {
      throw Object.assign(new Error('Member not found'), { status: 404 });
    }
    if (targetRole.rows[0].role === 'owner') {
      const ownerCount = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM tenant_memberships
         WHERE tenant_id = $1 AND role = 'owner'`,
        [tenantId],
      );
      if (parseInt(ownerCount.rows[0].count, 10) <= 1) {
        throw Object.assign(new Error('Cannot remove the last owner'), { status: 400 });
      }
    }

    await this.pool.query(
      'DELETE FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2',
      [targetUserId, tenantId],
    );
  }

  // ── Tenants ───────────────────────────────────────────────────────────────

  async listUserTenants(userId: string) {
    const result = await this.pool.query<{
      tenant_id: string; tenant_name: string; role: string; joined_at: string;
    }>(
      `SELECT tm.tenant_id, t.name AS tenant_name, tm.role, tm.joined_at
       FROM tenant_memberships tm
       JOIN tenants t ON tm.tenant_id = t.id
       WHERE tm.user_id = $1 AND t.status = 'active'
       ORDER BY tm.joined_at ASC`,
      [userId],
    );
    return result.rows;
  }

  async leaveTenant(userId: string, targetTenantId: string, currentTenantId: string) {
    if (targetTenantId === currentTenantId) {
      throw Object.assign(
        new Error('Switch tenant before leaving the currently active one'),
        { status: 400 },
      );
    }

    const membershipResult = await this.pool.query<{ role: string }>(
      'SELECT role FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2',
      [userId, targetTenantId],
    );
    if (membershipResult.rows.length === 0) {
      throw Object.assign(new Error('Membership not found'), { status: 404 });
    }
    if (membershipResult.rows[0].role === 'owner') {
      const ownerCount = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM tenant_memberships
         WHERE tenant_id = $1 AND role = 'owner'`,
        [targetTenantId],
      );
      if (parseInt(ownerCount.rows[0].count, 10) <= 1) {
        throw Object.assign(
          new Error('Cannot leave as last owner; transfer ownership first'),
          { status: 400 },
        );
      }
    }

    await this.pool.query(
      'DELETE FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2',
      [userId, targetTenantId],
    );
  }

  async listSubtenants(tenantId: string) {
    const result = await this.pool.query<{
      id: string; name: string; parent_id: string; status: string; created_at: string;
    }>(
      'SELECT id, name, parent_id, status, created_at FROM tenants WHERE parent_id = $1 ORDER BY created_at',
      [tenantId],
    );
    return result.rows;
  }

  async createSubtenant(parentTenantId: string, userId: string, name: string) {
    await this.pool.query('BEGIN');
    try {
      const tenantResult = await this.pool.query<{
        id: string; name: string; parent_id: string; status: string; created_at: string;
      }>(
        `INSERT INTO tenants (name, parent_id) VALUES ($1, $2)
         RETURNING id, name, parent_id, status, created_at`,
        [name.trim(), parentTenantId],
      );
      const newTenant = tenantResult.rows[0];

      await this.pool.query(
        `INSERT INTO tenant_memberships (user_id, tenant_id, role) VALUES ($1, $2, 'owner')`,
        [userId, newTenant.id],
      );
      await this.pool.query('COMMIT');
      return newTenant;
    } catch (err) {
      await this.pool.query('ROLLBACK');
      throw err;
    }
  }

  // ── Agents ────────────────────────────────────────────────────────────────

  async listAgents(tenantId: string) {
    const result = await this.pool.query<{
      id: string; name: string;
      provider_config: Record<string, unknown> | null;
      system_prompt: string | null;
      skills: unknown[] | null;
      mcp_endpoints: unknown[] | null;
      merge_policies: Record<string, unknown>;
      available_models: string[] | null;
      conversations_enabled: boolean;
      conversation_token_limit: number | null;
      conversation_summary_model: string | null;
      created_at: string; updated_at: string | null;
    }>(
      `SELECT id, name, provider_config, system_prompt, skills, mcp_endpoints, merge_policies,
              available_models, conversations_enabled, conversation_token_limit,
              conversation_summary_model, created_at, updated_at
       FROM agents WHERE tenant_id = $1 ORDER BY created_at`,
      [tenantId],
    );
    return result.rows;
  }

  async createAgent(tenantId: string, data: {
    name: string;
    providerConfig?: Record<string, unknown> | null;
    systemPrompt?: string | null;
    skills?: unknown[] | null;
    mcpEndpoints?: unknown[] | null;
    mergePolicies?: Record<string, unknown>;
  }) {
    const DEFAULT_MERGE_POLICIES = { system_prompt: 'prepend', skills: 'merge', mcp_endpoints: 'merge' };
    const storedMergePolicies = data.mergePolicies ?? DEFAULT_MERGE_POLICIES;

    const result = await this.pool.query<{
      id: string; name: string;
      provider_config: Record<string, unknown> | null;
      system_prompt: string | null;
      skills: unknown[] | null;
      mcp_endpoints: unknown[] | null;
      merge_policies: Record<string, unknown>;
      created_at: string; updated_at: string | null;
    }>(
      `INSERT INTO agents (tenant_id, name, provider_config, system_prompt, skills, mcp_endpoints, merge_policies)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, provider_config, system_prompt, skills, mcp_endpoints, merge_policies, created_at, updated_at`,
      [
        tenantId,
        data.name.trim(),
        data.providerConfig ? JSON.stringify(data.providerConfig) : null,
        data.systemPrompt ?? null,
        data.skills ? JSON.stringify(data.skills) : null,
        data.mcpEndpoints ? JSON.stringify(data.mcpEndpoints) : null,
        JSON.stringify(storedMergePolicies),
      ],
    );
    return result.rows[0];
  }

  async getAgent(agentId: string, userId: string) {
    const result = await this.pool.query<{
      id: string; name: string;
      provider_config: Record<string, unknown> | null;
      system_prompt: string | null;
      skills: unknown[] | null;
      mcp_endpoints: unknown[] | null;
      merge_policies: Record<string, unknown>;
      available_models: string[] | null;
      conversations_enabled: boolean;
      conversation_token_limit: number | null;
      conversation_summary_model: string | null;
      created_at: string; updated_at: string | null;
    }>(
      `SELECT a.id, a.name, a.provider_config, a.system_prompt, a.skills, a.mcp_endpoints, a.merge_policies,
              a.available_models, a.conversations_enabled, a.conversation_token_limit,
              a.conversation_summary_model, a.created_at, a.updated_at
       FROM agents a
       JOIN tenant_memberships tm ON tm.tenant_id = a.tenant_id
       WHERE a.id = $1 AND tm.user_id = $2`,
      [agentId, userId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async updateAgent(
    agentId: string,
    tenantId: string,
    userId: string,
    data: {
      name?: string;
      preparedProviderConfig?: Record<string, unknown> | null;
      systemPrompt?: string;
      skills?: unknown[];
      mcpEndpoints?: unknown[];
      mergePolicies?: Record<string, unknown>;
      availableModels?: string[] | null;
      conversationsEnabled?: boolean;
      conversationTokenLimit?: number | null;
      conversationSummaryModel?: string | null;
    },
  ) {
    const memberCheck = await this.pool.query(
      `SELECT 1 FROM agents a JOIN tenant_memberships tm ON tm.tenant_id = a.tenant_id
       WHERE a.id = $1 AND tm.user_id = $2`,
      [agentId, userId],
    );
    if (memberCheck.rows.length === 0) return null;

    const setClauses: string[] = ['updated_at = now()'];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) { setClauses.push(`name = $${idx++}`); values.push(data.name.trim()); }
    if (data.preparedProviderConfig !== undefined) {
      setClauses.push(`provider_config = $${idx++}`);
      values.push(data.preparedProviderConfig ? JSON.stringify(data.preparedProviderConfig) : null);
    }
    if (data.systemPrompt !== undefined) { setClauses.push(`system_prompt = $${idx++}`); values.push(data.systemPrompt); }
    if (data.skills !== undefined) { setClauses.push(`skills = $${idx++}`); values.push(JSON.stringify(data.skills)); }
    if (data.mcpEndpoints !== undefined) { setClauses.push(`mcp_endpoints = $${idx++}`); values.push(JSON.stringify(data.mcpEndpoints)); }
    if (data.mergePolicies !== undefined) { setClauses.push(`merge_policies = $${idx++}`); values.push(JSON.stringify(data.mergePolicies)); }
    if (data.availableModels !== undefined) {
      setClauses.push(`available_models = $${idx++}`);
      values.push(data.availableModels !== null ? JSON.stringify(data.availableModels) : null);
    }
    if (data.conversationsEnabled !== undefined) { setClauses.push(`conversations_enabled = $${idx++}`); values.push(data.conversationsEnabled); }
    if (data.conversationTokenLimit !== undefined) { setClauses.push(`conversation_token_limit = $${idx++}`); values.push(data.conversationTokenLimit); }
    if (data.conversationSummaryModel !== undefined) { setClauses.push(`conversation_summary_model = $${idx++}`); values.push(data.conversationSummaryModel || null); }

    values.push(agentId, tenantId);

    const result = await this.pool.query<{
      id: string; name: string;
      provider_config: Record<string, unknown> | null;
      system_prompt: string | null;
      skills: unknown[] | null;
      mcp_endpoints: unknown[] | null;
      merge_policies: Record<string, unknown>;
      available_models: string[] | null;
      conversations_enabled: boolean;
      conversation_token_limit: number | null;
      conversation_summary_model: string | null;
      created_at: string; updated_at: string | null;
    }>(
      `UPDATE agents SET ${setClauses.join(', ')}
       WHERE id = $${idx} AND tenant_id = $${idx + 1}
       RETURNING id, name, provider_config, system_prompt, skills, mcp_endpoints, merge_policies,
                 available_models, conversations_enabled, conversation_token_limit,
                 conversation_summary_model, created_at, updated_at`,
      values,
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async deleteAgent(agentId: string, tenantId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM agents WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [agentId, tenantId],
    );
    return result.rows.length > 0;
  }

  async getAgentResolved(agentId: string, userId: string) {
    const agentResult = await this.pool.query<{
      id: string; name: string; tenant_id: string;
      provider_config: Record<string, unknown> | null;
      system_prompt: string | null;
      skills: unknown[] | null;
      mcp_endpoints: unknown[] | null;
      merge_policies: Record<string, unknown>;
    }>(
      `SELECT a.id, a.name, a.tenant_id, a.provider_config, a.system_prompt,
              a.skills, a.mcp_endpoints, a.merge_policies
       FROM agents a
       JOIN tenant_memberships tm ON tm.tenant_id = a.tenant_id
       WHERE a.id = $1 AND tm.user_id = $2`,
      [agentId, userId],
    );
    if (agentResult.rows.length === 0) return null;

    const agent = agentResult.rows[0];
    const chainResult = await this.pool.query<{
      id: string; name: string;
      provider_config: Record<string, unknown> | null;
      system_prompt: string | null;
      skills: unknown[] | null;
      mcp_endpoints: unknown[] | null;
      depth: number;
    }>(
      `WITH RECURSIVE tenant_chain AS (
         SELECT id, name, parent_id, provider_config, system_prompt, skills, mcp_endpoints, 0 AS depth
         FROM tenants WHERE id = $1
         UNION ALL
         SELECT t.id, t.name, t.parent_id, t.provider_config, t.system_prompt, t.skills, t.mcp_endpoints, tc.depth + 1
         FROM tenants t
         JOIN tenant_chain tc ON t.id = tc.parent_id
       )
       SELECT id, name, provider_config, system_prompt, skills, mcp_endpoints, depth
       FROM tenant_chain ORDER BY depth ASC`,
      [agent.tenant_id],
    );
    return { agent, tenantChain: chainResult.rows };
  }

  async getAgentForChat(agentId: string, userId: string) {
    const agentResult = await this.pool.query<{
      id: string; name: string; tenant_id: string;
      provider_config: Record<string, unknown> | null;
      system_prompt: string | null;
      skills: unknown[] | null;
      mcp_endpoints: unknown[] | null;
      merge_policies: Record<string, unknown>;
      conversations_enabled: boolean;
      conversation_token_limit: number | null;
      conversation_summary_model: string | null;
    }>(
      `SELECT a.id, a.name, a.tenant_id, a.provider_config, a.system_prompt, a.skills,
              a.mcp_endpoints, a.merge_policies, a.conversations_enabled,
              a.conversation_token_limit, a.conversation_summary_model
       FROM agents a
       JOIN tenant_memberships tm ON tm.tenant_id = a.tenant_id
       WHERE a.id = $1 AND tm.user_id = $2`,
      [agentId, userId],
    );
    if (agentResult.rows.length === 0) return null;

    const agent = agentResult.rows[0];
    const chainResult = await this.pool.query<{
      id: string; name: string;
      provider_config: Record<string, unknown> | null;
      system_prompt: string | null;
      skills: unknown[] | null;
      mcp_endpoints: unknown[] | null;
      depth: number;
    }>(
      `WITH RECURSIVE tenant_chain AS (
         SELECT id, name, parent_id, provider_config, system_prompt, skills, mcp_endpoints, 0 AS depth
         FROM tenants WHERE id = $1
         UNION ALL
         SELECT t.id, t.name, t.parent_id, t.provider_config, t.system_prompt, t.skills, t.mcp_endpoints, tc.depth + 1
         FROM tenants t
         JOIN tenant_chain tc ON t.id = tc.parent_id
       )
       SELECT id, name, provider_config, system_prompt, skills, mcp_endpoints, depth
       FROM tenant_chain ORDER BY depth ASC`,
      [agent.tenant_id],
    );
    return { agent, tenantChain: chainResult.rows };
  }

  // ── Partitions ────────────────────────────────────────────────────────────

  async listPartitions(tenantId: string) {
    const result = await this.pool.query<{
      id: string; parent_id: string | null; external_id: string;
      title_encrypted: string | null; title_iv: string | null; created_at: string;
    }>(
      `SELECT id, parent_id, external_id, title_encrypted, title_iv, created_at
       FROM partitions
       WHERE tenant_id = $1
       ORDER BY created_at ASC`,
      [tenantId],
    );
    return result.rows;
  }

  async createPartition(
    tenantId: string,
    externalId: string,
    parentId: string | null,
    titleEncrypted: string | null,
    titleIv: string | null,
  ) {
    const result = await this.pool.query<{
      id: string; external_id: string; parent_id: string | null; created_at: string;
    }>(
      `INSERT INTO partitions (tenant_id, parent_id, external_id, title_encrypted, title_iv)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, external_id, parent_id, created_at`,
      [tenantId, parentId, externalId, titleEncrypted, titleIv],
    );
    return result.rows[0];
  }

  async updatePartition(
    id: string,
    tenantId: string,
    updates: {
      titleEncrypted?: string;
      titleIv?: string;
      parentId?: string | null;
    },
  ): Promise<boolean> {
    const sets: string[] = [];
    const params: unknown[] = [id, tenantId];

    if (updates.titleEncrypted !== undefined && updates.titleIv !== undefined) {
      sets.push(`title_encrypted = $${params.length + 1}, title_iv = $${params.length + 2}`);
      params.push(updates.titleEncrypted, updates.titleIv);
    }
    if ('parentId' in updates) {
      sets.push(`parent_id = $${params.length + 1}`);
      params.push(updates.parentId);
    }
    if (sets.length === 0) return false;

    const result = await this.pool.query(
      `UPDATE partitions SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      params,
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deletePartition(id: string, tenantId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM partitions WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ── Conversations ─────────────────────────────────────────────────────────

  async listConversations(tenantId: string, partitionId?: string | null) {
    const result = await this.pool.query<{
      id: string; agent_id: string | null; partition_id: string | null;
      external_id: string; created_at: string; last_active_at: string;
    }>(
      `SELECT c.id, c.agent_id, c.partition_id, c.external_id, c.created_at, c.last_active_at
       FROM conversations c
       WHERE c.tenant_id = $1
         AND ($2::uuid IS NULL OR c.partition_id = $2)
       ORDER BY c.last_active_at DESC`,
      [tenantId, partitionId ?? null],
    );
    return result.rows;
  }

  async getConversation(id: string, tenantId: string) {
    const convResult = await this.pool.query<{
      id: string; agent_id: string | null; partition_id: string | null;
      external_id: string; created_at: string; last_active_at: string;
    }>(
      `SELECT id, agent_id, partition_id, external_id, created_at, last_active_at
       FROM conversations WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (convResult.rows.length === 0) return null;

    const snapResult = await this.pool.query<{
      id: string; summary_encrypted: string; summary_iv: string;
      messages_archived: number; created_at: string;
    }>(
      `SELECT id, summary_encrypted, summary_iv, messages_archived, created_at
       FROM conversation_snapshots WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [id],
    );

    const msgResult = await this.pool.query<{
      id: string; role: string; content_encrypted: string; content_iv: string;
      token_estimate: number | null; snapshot_id: string | null; created_at: string;
    }>(
      `SELECT id, role, content_encrypted, content_iv, token_estimate, snapshot_id, created_at
       FROM conversation_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [id],
    );

    return { conv: convResult.rows[0], snapshots: snapResult.rows, messages: msgResult.rows };
  }
}
