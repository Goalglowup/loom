import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { scrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
import { createSigner } from 'fast-jwt';
import { registerPortalAuthMiddleware } from '../middleware/portalAuth.js';
import { invalidateCachedKey } from '../auth.js';
import type { TenantContext } from '../auth.js';
import { encryptTraceBody, decryptTraceBody } from '../encryption.js';
import { traceRecorder } from '../tracing.js';
import { evictProvider, getProviderForTenant } from '../providers/registry.js';
import { applyAgentToRequest } from '../agent.js';
import { getAnalyticsSummary, getTimeseriesMetrics, getModelBreakdown } from '../analytics.js';
import { query } from '../db.js';
import { conversationManager } from '../conversations.js';

const PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'unsafe-portal-secret-change-in-production';
const signPortalToken = createSigner({ key: PORTAL_JWT_SECRET, expiresIn: 86400000 }); // 24h in ms

const scryptAsync = promisify(scrypt);

// TODO: Add rate limiting to signup and login endpoints to prevent abuse.

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
  const keyPrefix = rawKey.slice(0, 15); // 'loom_sk_' + first 7 chars
  return { rawKey, keyHash, keyPrefix };
}

export function registerPortalRoutes(fastify: FastifyInstance, pool: pg.Pool): void {
  const PORTAL_BASE_URL = process.env.PORTAL_BASE_URL ?? 'http://localhost:3000';

  // ── POST /v1/portal/auth/signup ──────────────────────────────────────────────
  fastify.post<{
    Body: { tenantName?: string; email: string; password: string; inviteToken?: string };
  }>('/v1/portal/auth/signup', async (request, reply) => {
    const { tenantName, email, password, inviteToken } = request.body;

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: 'Valid email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    }

    if (inviteToken) {
      // ── Invite-based signup ──────────────────────────────────────────────
      const inviteResult = await pool.query<{
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
        [inviteToken]
      );
      if (inviteResult.rows.length === 0) {
        return reply.code(400).send({ error: 'Invalid or expired invite token' });
      }
      const invite = inviteResult.rows[0];

      await pool.query('BEGIN');
      try {
        // Create or find user
        const existingUser = await pool.query<{ id: string; email: string }>(
          'SELECT id, email FROM users WHERE email = $1',
          [email.toLowerCase()]
        );

        let userId: string;
        let userEmail: string;
        if (existingUser.rows.length > 0) {
          userId = existingUser.rows[0].id;
          userEmail = existingUser.rows[0].email;
          const memberCheck = await pool.query(
            'SELECT id FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2',
            [userId, invite.tenant_id]
          );
          if (memberCheck.rows.length > 0) {
            await pool.query('ROLLBACK');
            return reply.code(409).send({ error: 'Already a member of this tenant' });
          }
        } else {
          const passwordHash = await hashPassword(password);
          const newUser = await pool.query<{ id: string; email: string }>(
            `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email`,
            [email.toLowerCase(), passwordHash]
          );
          userId = newUser.rows[0].id;
          userEmail = newUser.rows[0].email;
        }

        await pool.query(
          `INSERT INTO tenant_memberships (user_id, tenant_id, role) VALUES ($1, $2, 'member')`,
          [userId, invite.tenant_id]
        );
        await pool.query('UPDATE invites SET use_count = use_count + 1 WHERE id = $1', [invite.id]);
        await pool.query('COMMIT');

        const token = signPortalToken({ sub: userId, tenantId: invite.tenant_id, role: 'member' });
        return reply.code(201).send({
          token,
          user: { id: userId, email: userEmail },
          tenant: { id: invite.tenant_id, name: invite.tenant_name },
        });
      } catch (err) {
        await pool.query('ROLLBACK');
        fastify.log.error({ err }, 'Invite signup transaction failed');
        return reply.code(500).send({ error: 'Signup failed' });
      }
    } else {
      // ── Regular signup ───────────────────────────────────────────────────
      if (!tenantName || typeof tenantName !== 'string' || tenantName.trim().length === 0) {
        return reply.code(400).send({ error: 'tenantName is required' });
      }

      const emailCheck = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase()]
      );
      if (emailCheck.rows.length > 0) {
        return reply.code(409).send({ error: 'Email already registered' });
      }

      const passwordHash = await hashPassword(password);

      await pool.query('BEGIN');
      try {
        const tenantResult = await pool.query<{ id: string; name: string }>(
          'INSERT INTO tenants (name) VALUES ($1) RETURNING id, name',
          [tenantName.trim()]
        );
        const tenant = tenantResult.rows[0];

        const userResult = await pool.query<{ id: string; email: string }>(
          `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email`,
          [email.toLowerCase(), passwordHash]
        );
        const user = userResult.rows[0];

        await pool.query(
          `INSERT INTO tenant_memberships (user_id, tenant_id, role) VALUES ($1, $2, 'owner')`,
          [user.id, tenant.id]
        );
        // Create a Default agent so API keys created later have an agent to reference
        await pool.query(
          `INSERT INTO agents (tenant_id, name) VALUES ($1, 'Default')`,
          [tenant.id]
        );
        await pool.query('COMMIT');

        const token = signPortalToken({ sub: user.id, tenantId: tenant.id, role: 'owner' });
        return reply.code(201).send({
          token,
          user: { id: user.id, email: user.email },
          tenant: { id: tenant.id, name: tenant.name },
        });
      } catch (err) {
        await pool.query('ROLLBACK');
        fastify.log.error({ err }, 'Signup transaction failed');
        return reply.code(500).send({ error: 'Signup failed' });
      }
    }
  });

  // ── POST /v1/portal/auth/login ───────────────────────────────────────────────
  fastify.post<{
    Body: { email: string; password: string };
  }>('/v1/portal/auth/login', async (request, reply) => {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password required' });
    }

    const userResult = await pool.query<{
      id: string; email: string; password_hash: string;
    }>(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }
    const user = userResult.rows[0];

    try {
      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) return reply.code(401).send({ error: 'Invalid credentials' });
    } catch {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const membershipsResult = await pool.query<{
      tenant_id: string; tenant_name: string; role: string; tenant_status: string;
    }>(
      `SELECT tm.tenant_id, t.name AS tenant_name, tm.role, t.status AS tenant_status
       FROM tenant_memberships tm
       JOIN tenants t ON tm.tenant_id = t.id
       WHERE tm.user_id = $1 AND t.status = 'active'
       ORDER BY tm.joined_at ASC`,
      [user.id]
    );

    if (membershipsResult.rows.length === 0) {
      return reply.code(403).send({ error: 'No active tenant memberships' });
    }
    const memberships = membershipsResult.rows;
    const defaultMembership = memberships[0];

    await pool.query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);

    const token = signPortalToken({
      sub: user.id, tenantId: defaultMembership.tenant_id, role: defaultMembership.role,
    });

    return reply.send({
      token,
      user: { id: user.id, email: user.email },
      tenant: { id: defaultMembership.tenant_id, name: defaultMembership.tenant_name },
      tenants: memberships.map((m) => ({ id: m.tenant_id, name: m.tenant_name, role: m.role })),
    });
  });

  const authRequired = registerPortalAuthMiddleware(fastify);
  const ownerRequired = registerPortalAuthMiddleware(fastify, 'owner');

  // ── GET /v1/portal/me ────────────────────────────────────────────────────────
  fastify.get('/v1/portal/me', { preHandler: authRequired }, async (request, reply) => {
    const { userId, tenantId } = request.portalUser!;

    const result = await pool.query<{
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
      [userId, tenantId]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const tenantsResult = await pool.query<{
      tenant_id: string; tenant_name: string; role: string;
    }>(
      `SELECT tm.tenant_id, t.name AS tenant_name, tm.role
       FROM tenant_memberships tm
       JOIN tenants t ON tm.tenant_id = t.id
       WHERE tm.user_id = $1 AND t.status = 'active'
       ORDER BY tm.joined_at ASC`,
      [userId]
    );

    const row = result.rows[0];
    const cfg = row.provider_config;
    const providerConfig = cfg
      ? {
          provider: cfg['provider'],
          baseUrl: cfg['baseUrl'] ?? null,
          deployment: cfg['deployment'] ?? null,
          apiVersion: cfg['apiVersion'] ?? null,
          hasApiKey: !!(cfg['apiKey']),
        }
      : null;

    const [agentsResult, subtenantsResult] = await Promise.all([
      pool.query<{ id: string; name: string }>(
        `SELECT id, name FROM agents WHERE tenant_id = $1 ORDER BY created_at`,
        [tenantId]
      ),
      pool.query<{ id: string; name: string; status: string }>(
        `SELECT id, name, status FROM tenants WHERE parent_id = $1 ORDER BY created_at`,
        [tenantId]
      ),
    ]);

    return reply.send({
      user: { id: row.id, email: row.email, role: row.role },
      tenant: { id: row.tenant_id, name: row.tenant_name, providerConfig, availableModels: row.available_models ?? null },
      tenants: tenantsResult.rows.map((t) => ({ id: t.tenant_id, name: t.tenant_name, role: t.role })),
      agents: agentsResult.rows.map((a) => ({ id: a.id, name: a.name })),
      subtenants: subtenantsResult.rows.map((s) => ({ id: s.id, name: s.name, status: s.status })),
    });
  });

  // ── PATCH /v1/portal/settings ────────────────────────────────────────────────
  fastify.patch<{
    Body: {
      provider: string;
      apiKey?: string;
      baseUrl?: string;
      deployment?: string;
      apiVersion?: string;
      availableModels?: string[] | null;
    };
  }>('/v1/portal/settings', { preHandler: ownerRequired }, async (request, reply) => {
    const { tenantId } = request.portalUser!;
    const { provider, apiKey, baseUrl, deployment, apiVersion, availableModels } = request.body;

    if (!provider || (provider !== 'openai' && provider !== 'azure' && provider !== 'ollama')) {
      return reply.code(400).send({ error: 'Provider must be "openai" or "azure"' });
    }

    const providerConfig: Record<string, unknown> = { provider };
    if (baseUrl) providerConfig.baseUrl = baseUrl;
    if (deployment) providerConfig.deployment = deployment;
    if (apiVersion) providerConfig.apiVersion = apiVersion;

    if (apiKey) {
      try {
        const encrypted = encryptTraceBody(tenantId, apiKey);
        providerConfig.apiKey = `encrypted:${encrypted.ciphertext}:${encrypted.iv}`;
      } catch (err) {
        fastify.log.error({ err }, 'Failed to encrypt provider API key');
        return reply.code(500).send({ error: 'Failed to encrypt API key. Ensure ENCRYPTION_MASTER_KEY is set.' });
      }
    }

    if (availableModels !== undefined) {
      await pool.query(
        'UPDATE tenants SET provider_config = $1, available_models = $2, updated_at = now() WHERE id = $3',
        [JSON.stringify(providerConfig), availableModels !== null ? JSON.stringify(availableModels) : null, tenantId]
      );
    } else {
      await pool.query(
        'UPDATE tenants SET provider_config = $1, updated_at = now() WHERE id = $2',
        [JSON.stringify(providerConfig), tenantId]
      );
    }

    evictProvider(tenantId);

    return reply.send({
      providerConfig: {
        provider,
        baseUrl: baseUrl ?? null,
        deployment: deployment ?? null,
        apiVersion: apiVersion ?? null,
        hasApiKey: !!apiKey,
      },
      availableModels: availableModels !== undefined ? (availableModels ?? null) : undefined,
    });
  });

  // ── GET /v1/portal/api-keys ──────────────────────────────────────────────────
  fastify.get('/v1/portal/api-keys', { preHandler: authRequired }, async (request, reply) => {
    const { tenantId } = request.portalUser!;

    const result = await pool.query<{
      id: string;
      name: string;
      key_prefix: string;
      status: string;
      created_at: string;
      revoked_at: string | null;
    }>(
      `SELECT id, name, key_prefix, status, created_at, revoked_at
       FROM api_keys
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );

    return reply.send({
      apiKeys: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        keyPrefix: row.key_prefix,
        status: row.status,
        createdAt: row.created_at,
        revokedAt: row.revoked_at,
      })),
    });
  });

  // ── POST /v1/portal/api-keys ─────────────────────────────────────────────────
  fastify.post<{ Body: { name: string; agentId: string } }>(
    '/v1/portal/api-keys',
    { preHandler: ownerRequired },
    async (request, reply) => {
      const { tenantId } = request.portalUser!;
      const { name, agentId } = request.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return reply.code(400).send({ error: 'API key name is required' });
      }
      if (!agentId || typeof agentId !== 'string') {
        return reply.code(400).send({ error: 'agentId is required' });
      }

      // Verify agent belongs to this tenant
      const agentCheck = await pool.query(
        'SELECT id FROM agents WHERE id = $1 AND tenant_id = $2',
        [agentId, tenantId]
      );
      if (agentCheck.rows.length === 0) {
        return reply.code(400).send({ error: 'Invalid agentId' });
      }

      const { rawKey, keyHash, keyPrefix } = generateApiKey();

      const result = await pool.query<{
        id: string;
        name: string;
        key_prefix: string;
        status: string;
        created_at: string;
      }>(
        `INSERT INTO api_keys (tenant_id, agent_id, name, key_prefix, key_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, key_prefix, status, created_at`,
        [tenantId, agentId, name.trim(), keyPrefix, keyHash]
      );

      const row = result.rows[0];
      return reply.code(201).send({
        id: row.id,
        name: row.name,
        key: rawKey,
        keyPrefix: row.key_prefix,
        status: row.status,
        createdAt: row.created_at,
      });
    }
  );

  // ── DELETE /v1/portal/api-keys/:id ──────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>(
    '/v1/portal/api-keys/:id',
    { preHandler: ownerRequired },
    async (request, reply) => {
      const { tenantId } = request.portalUser!;
      const { id: keyId } = request.params;

      const result = await pool.query<{ key_hash: string }>(
        `UPDATE api_keys
         SET status = 'revoked', revoked_at = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING key_hash`,
        [keyId, tenantId]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'API key not found' });
      }

      invalidateCachedKey(result.rows[0].key_hash);

      return reply.code(204).send();
    }
  );

  // ── GET /v1/portal/traces ────────────────────────────────────────────────────
  fastify.get('/v1/portal/traces', { preHandler: authRequired }, async (request, reply) => {
    const { tenantId } = request.portalUser!;
    const qs = request.query as Record<string, string>;
    const limit = Math.min(parseInt(qs.limit ?? '50', 10), 200);
    const cursor = qs.cursor;

    let result;
    if (cursor) {
      result = await query(
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
      result = await query(
        `SELECT id, tenant_id, model, provider, status_code, latency_ms,
                prompt_tokens, completion_tokens, ttfb_ms, gateway_overhead_ms, created_at
         FROM   traces
         WHERE  tenant_id = $1
         ORDER  BY created_at DESC
         LIMIT  $2`,
        [tenantId, limit],
      );
    }

    const traces = result.rows;
    const nextCursor =
      traces.length === limit
        ? (traces[traces.length - 1].created_at as Date).toISOString()
        : null;

    return reply.send({ traces, nextCursor });
  });

  // ── GET /v1/portal/analytics/summary ────────────────────────────────────────
  fastify.get('/v1/portal/analytics/summary', { preHandler: authRequired }, async (request, reply) => {
    const { tenantId } = request.portalUser!;
    const qs = request.query as Record<string, string>;
    const windowHours = parseInt(qs.window ?? '24', 10);
    const rollup = qs.rollup === 'true' || qs.rollup === '1';
    const summary = await getAnalyticsSummary(tenantId, windowHours, rollup);
    return reply.send(summary);
  });

  // ── GET /v1/portal/analytics/timeseries ─────────────────────────────────────
  fastify.get('/v1/portal/analytics/timeseries', { preHandler: authRequired }, async (request, reply) => {
    const { tenantId } = request.portalUser!;
    const qs = request.query as Record<string, string>;
    const windowHours   = parseInt(qs.window ?? '24', 10);
    const bucketMinutes = parseInt(qs.bucket ?? '60', 10);
    const rollup = qs.rollup === 'true' || qs.rollup === '1';
    const timeseries = await getTimeseriesMetrics(tenantId, windowHours, bucketMinutes, rollup);
    return reply.send(timeseries);
  });

  // ── GET /v1/portal/analytics/models ─────────────────────────────────────────
  fastify.get('/v1/portal/analytics/models', { preHandler: authRequired }, async (request, reply) => {
    const { tenantId } = request.portalUser!;
    const qs = request.query as Record<string, string>;
    const windowHours = parseInt(qs.window ?? '24', 10);
    const rollup = qs.rollup === 'true' || qs.rollup === '1';
    const models = await getModelBreakdown(tenantId, windowHours, 10, rollup);
    return reply.send({ models });
  });

  // ── POST /v1/portal/auth/switch-tenant ───────────────────────────────────────
  fastify.post<{ Body: { tenantId: string } }>(
    '/v1/portal/auth/switch-tenant',
    { preHandler: authRequired },
    async (request, reply) => {
      const { userId } = request.portalUser!;
      const { tenantId: newTenantId } = request.body;

      if (!newTenantId) {
        return reply.code(400).send({ error: 'tenantId is required' });
      }

      const membershipResult = await pool.query<{ role: string; tenant_name: string; tenant_status: string }>(
        `SELECT tm.role, t.name AS tenant_name, t.status AS tenant_status
         FROM tenant_memberships tm
         JOIN tenants t ON tm.tenant_id = t.id
         WHERE tm.user_id = $1 AND tm.tenant_id = $2`,
        [userId, newTenantId]
      );

      if (membershipResult.rows.length === 0) {
        return reply.code(403).send({ error: 'No membership in requested tenant' });
      }
      const membership = membershipResult.rows[0];
      if (membership.tenant_status !== 'active') {
        return reply.code(403).send({ error: 'Tenant is inactive' });
      }

      const userResult = await pool.query<{ id: string; email: string }>(
        'SELECT id, email FROM users WHERE id = $1',
        [userId]
      );
      const user = userResult.rows[0];

      const allMembershipsResult = await pool.query<{
        tenant_id: string; tenant_name: string; role: string;
      }>(
        `SELECT tm.tenant_id, t.name AS tenant_name, tm.role
         FROM tenant_memberships tm
         JOIN tenants t ON tm.tenant_id = t.id
         WHERE tm.user_id = $1 AND t.status = 'active'
         ORDER BY tm.joined_at ASC`,
        [userId]
      );

      const token = signPortalToken({ sub: userId, tenantId: newTenantId, role: membership.role });
      return reply.send({
        token,
        user: { id: user.id, email: user.email },
        tenant: { id: newTenantId, name: membership.tenant_name },
        tenants: allMembershipsResult.rows.map((m) => ({
          id: m.tenant_id, name: m.tenant_name, role: m.role,
        })),
      });
    }
  );

  // ── GET /v1/portal/invites/:token/info (public — no auth) ────────────────────
  fastify.get<{ Params: { token: string } }>(
    '/v1/portal/invites/:token/info',
    async (request, reply) => {
      const { token } = request.params;

      const result = await pool.query<{
        tenant_name: string; expires_at: string;
        revoked_at: string | null; max_uses: number | null; use_count: number;
        tenant_status: string;
      }>(
        `SELECT t.name AS tenant_name, i.expires_at, i.revoked_at,
                i.max_uses, i.use_count, t.status AS tenant_status
         FROM invites i
         JOIN tenants t ON i.tenant_id = t.id
         WHERE i.token = $1`,
        [token]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Invite not found' });
      }
      const row = result.rows[0];
      const now = new Date();
      const isValid =
        row.revoked_at === null &&
        new Date(row.expires_at) > now &&
        (row.max_uses === null || row.use_count < row.max_uses) &&
        row.tenant_status === 'active';

      return reply.send({
        tenantName: row.tenant_name,
        expiresAt: row.expires_at,
        isValid,
      });
    }
  );

  // ── POST /v1/portal/invites ───────────────────────────────────────────────────
  fastify.post<{ Body: { maxUses?: number; expiresInHours?: number } }>(
    '/v1/portal/invites',
    { preHandler: ownerRequired },
    async (request, reply) => {
      const { tenantId, userId } = request.portalUser!;
      const { maxUses, expiresInHours = 168 } = request.body;

      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

      const result = await pool.query<{
        id: string; token: string; max_uses: number | null;
        use_count: number; expires_at: string; created_at: string;
      }>(
        `INSERT INTO invites (tenant_id, token, created_by, max_uses, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, token, max_uses, use_count, expires_at, created_at`,
        [tenantId, token, userId, maxUses ?? null, expiresAt]
      );
      const row = result.rows[0];
      return reply.code(201).send({
        id: row.id,
        token: row.token,
        inviteUrl: `${PORTAL_BASE_URL}/signup?invite=${row.token}`,
        maxUses: row.max_uses,
        useCount: row.use_count,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      });
    }
  );

  // ── GET /v1/portal/invites ────────────────────────────────────────────────────
  fastify.get('/v1/portal/invites', { preHandler: ownerRequired }, async (request, reply) => {
    const { tenantId } = request.portalUser!;

    const result = await pool.query<{
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
      [tenantId]
    );

    const now = new Date();
    return reply.send({
      invites: result.rows.map((row) => ({
        id: row.id,
        token: row.token,
        inviteUrl: `${PORTAL_BASE_URL}/signup?invite=${row.token}`,
        maxUses: row.max_uses,
        useCount: row.use_count,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        createdAt: row.created_at,
        createdBy: { id: row.creator_id, email: row.creator_email },
        isActive:
          row.revoked_at === null &&
          new Date(row.expires_at) > now &&
          (row.max_uses === null || row.use_count < row.max_uses),
      })),
    });
  });

  // ── DELETE /v1/portal/invites/:id ────────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>(
    '/v1/portal/invites/:id',
    { preHandler: ownerRequired },
    async (request, reply) => {
      const { tenantId } = request.portalUser!;
      const { id } = request.params;

      const result = await pool.query(
        `UPDATE invites SET revoked_at = now()
         WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL
         RETURNING id`,
        [id, tenantId]
      );
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Invite not found or already revoked' });
      }
      return reply.code(204).send();
    }
  );

  // ── GET /v1/portal/members ────────────────────────────────────────────────────
  fastify.get('/v1/portal/members', { preHandler: authRequired }, async (request, reply) => {
    const { tenantId } = request.portalUser!;

    const result = await pool.query<{
      id: string; email: string; role: string; joined_at: string; last_login: string | null;
    }>(
      `SELECT u.id, u.email, tm.role, tm.joined_at, u.last_login
       FROM tenant_memberships tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.tenant_id = $1
       ORDER BY tm.joined_at ASC`,
      [tenantId]
    );

    return reply.send({
      members: result.rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        joinedAt: row.joined_at,
        lastLogin: row.last_login,
      })),
    });
  });

  // ── PATCH /v1/portal/members/:userId ─────────────────────────────────────────
  fastify.patch<{ Params: { userId: string }; Body: { role: 'owner' | 'member' } }>(
    '/v1/portal/members/:userId',
    { preHandler: ownerRequired },
    async (request, reply) => {
      const { tenantId } = request.portalUser!;
      const { userId: targetUserId } = request.params;
      const { role } = request.body;

      if (!role || (role !== 'owner' && role !== 'member')) {
        return reply.code(400).send({ error: 'Role must be "owner" or "member"' });
      }

      // Guard: can't demote last owner
      if (role === 'member') {
        const ownerCount = await pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM tenant_memberships
           WHERE tenant_id = $1 AND role = 'owner'`,
          [tenantId]
        );
        if (parseInt(ownerCount.rows[0].count, 10) <= 1) {
          return reply.code(400).send({ error: 'Cannot demote the last owner' });
        }
      }

      const result = await pool.query<{
        user_id: string; email: string; role: string; joined_at: string;
      }>(
        `UPDATE tenant_memberships SET role = $1
         WHERE user_id = $2 AND tenant_id = $3
         RETURNING user_id, role, joined_at`,
        [role, targetUserId, tenantId]
      );
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Member not found' });
      }

      const userResult = await pool.query<{ email: string }>(
        'SELECT email FROM users WHERE id = $1',
        [targetUserId]
      );
      const row = result.rows[0];
      return reply.send({
        id: row.user_id,
        email: userResult.rows[0].email,
        role: row.role,
        joinedAt: row.joined_at,
      });
    }
  );

  // ── DELETE /v1/portal/members/:userId ────────────────────────────────────────
  fastify.delete<{ Params: { userId: string } }>(
    '/v1/portal/members/:userId',
    { preHandler: ownerRequired },
    async (request, reply) => {
      const { tenantId, userId: requestingUserId } = request.portalUser!;
      const { userId: targetUserId } = request.params;

      if (targetUserId === requestingUserId) {
        return reply.code(400).send({ error: 'Cannot remove yourself; use leave instead' });
      }

      // Guard: can't remove last owner
      const targetRole = await pool.query<{ role: string }>(
        'SELECT role FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2',
        [targetUserId, tenantId]
      );
      if (targetRole.rows.length === 0) {
        return reply.code(404).send({ error: 'Member not found' });
      }
      if (targetRole.rows[0].role === 'owner') {
        const ownerCount = await pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM tenant_memberships
           WHERE tenant_id = $1 AND role = 'owner'`,
          [tenantId]
        );
        if (parseInt(ownerCount.rows[0].count, 10) <= 1) {
          return reply.code(400).send({ error: 'Cannot remove the last owner' });
        }
      }

      await pool.query(
        'DELETE FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2',
        [targetUserId, tenantId]
      );
      return reply.code(204).send();
    }
  );

  // ── GET /v1/portal/tenants ────────────────────────────────────────────────────
  fastify.get('/v1/portal/tenants', { preHandler: authRequired }, async (request, reply) => {
    const { userId } = request.portalUser!;

    const result = await pool.query<{
      tenant_id: string; tenant_name: string; role: string; joined_at: string;
    }>(
      `SELECT tm.tenant_id, t.name AS tenant_name, tm.role, tm.joined_at
       FROM tenant_memberships tm
       JOIN tenants t ON tm.tenant_id = t.id
       WHERE tm.user_id = $1 AND t.status = 'active'
       ORDER BY tm.joined_at ASC`,
      [userId]
    );

    return reply.send({
      tenants: result.rows.map((row) => ({
        id: row.tenant_id,
        name: row.tenant_name,
        role: row.role,
        joinedAt: row.joined_at,
      })),
    });
  });

  // ── POST /v1/portal/tenants/:tenantId/leave ───────────────────────────────────
  fastify.post<{ Params: { tenantId: string } }>(
    '/v1/portal/tenants/:tenantId/leave',
    { preHandler: authRequired },
    async (request, reply) => {
      const { userId, tenantId: currentTenantId } = request.portalUser!;
      const { tenantId: targetTenantId } = request.params;

      if (targetTenantId === currentTenantId) {
        return reply.code(400).send({ error: 'Switch tenant before leaving the currently active one' });
      }

      const membershipResult = await pool.query<{ role: string }>(
        'SELECT role FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2',
        [userId, targetTenantId]
      );
      if (membershipResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Membership not found' });
      }

      if (membershipResult.rows[0].role === 'owner') {
        const ownerCount = await pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM tenant_memberships
           WHERE tenant_id = $1 AND role = 'owner'`,
          [targetTenantId]
        );
        if (parseInt(ownerCount.rows[0].count, 10) <= 1) {
          return reply.code(400).send({ error: 'Cannot leave as last owner; transfer ownership first' });
        }
      }

      await pool.query(
        'DELETE FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2',
        [userId, targetTenantId]
      );
      return reply.code(204).send();
    }
  );

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function sanitizeAgentProviderConfig(cfg: Record<string, unknown> | null) {
    if (!cfg) return null;
    return {
      provider: cfg['provider'] ?? null,
      baseUrl: cfg['baseUrl'] ?? null,
      deployment: cfg['deployment'] ?? null,
      apiVersion: cfg['apiVersion'] ?? null,
      hasApiKey: !!(cfg['apiKey']),
    };
  }

  function prepareAgentProviderConfig(
    tenantId: string,
    rawConfig: Record<string, unknown> | undefined | null,
  ): Record<string, unknown> | null {
    if (!rawConfig) return null;
    const stored: Record<string, unknown> = { ...rawConfig };
    if (typeof stored['apiKey'] === 'string' && stored['apiKey'] && !String(stored['apiKey']).startsWith('encrypted:')) {
      try {
        const encrypted = encryptTraceBody(tenantId, stored['apiKey'] as string);
        stored['apiKey'] = `encrypted:${encrypted.ciphertext}:${encrypted.iv}`;
      } catch {
        // if encryption fails, omit the key rather than store plaintext
        delete stored['apiKey'];
      }
    }
    return stored;
  }

  function formatAgent(row: {
    id: string; name: string;
    provider_config: Record<string, unknown> | null;
    system_prompt: string | null;
    skills: unknown[] | null;
    mcp_endpoints: unknown[] | null;
    merge_policies: Record<string, unknown>;
    available_models?: string[] | null;
    conversations_enabled?: boolean;
    conversation_token_limit?: number | null;
    conversation_summary_model?: string | null;
    created_at: string; updated_at: string | null;
  }) {
    return {
      id: row.id,
      name: row.name,
      providerConfig: sanitizeAgentProviderConfig(row.provider_config),
      systemPrompt: row.system_prompt,
      skills: row.skills,
      mcpEndpoints: row.mcp_endpoints,
      mergePolicies: row.merge_policies,
      availableModels: row.available_models ?? null,
      conversations_enabled: row.conversations_enabled ?? false,
      conversation_token_limit: row.conversation_token_limit ?? null,
      conversation_summary_model: row.conversation_summary_model ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  const DEFAULT_MERGE_POLICIES = { system_prompt: 'prepend', skills: 'merge', mcp_endpoints: 'merge' };

  // ── GET /v1/portal/subtenants ─────────────────────────────────────────────────
  fastify.get('/v1/portal/subtenants', { preHandler: authRequired }, async (request, reply) => {
    const { tenantId } = request.portalUser!;

    const result = await pool.query<{
      id: string; name: string; parent_id: string; status: string; created_at: string;
    }>(
      `SELECT id, name, parent_id, status, created_at FROM tenants WHERE parent_id = $1 ORDER BY created_at`,
      [tenantId]
    );

    return reply.send({
      subtenants: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        createdAt: row.created_at,
      })),
    });
  });

  // ── POST /v1/portal/subtenants ────────────────────────────────────────────────
  fastify.post<{ Body: { name: string } }>(
    '/v1/portal/subtenants',
    { preHandler: ownerRequired },
    async (request, reply) => {
      const { tenantId, userId } = request.portalUser!;
      const { name } = request.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return reply.code(400).send({ error: 'name is required' });
      }

      await pool.query('BEGIN');
      try {
        const tenantResult = await pool.query<{
          id: string; name: string; parent_id: string; status: string; created_at: string;
        }>(
          `INSERT INTO tenants (name, parent_id) VALUES ($1, $2)
           RETURNING id, name, parent_id, status, created_at`,
          [name.trim(), tenantId]
        );
        const newTenant = tenantResult.rows[0];

        await pool.query(
          `INSERT INTO tenant_memberships (user_id, tenant_id, role) VALUES ($1, $2, 'owner')`,
          [userId, newTenant.id]
        );

        await pool.query('COMMIT');

        return reply.code(201).send({
          subtenant: {
            id: newTenant.id,
            name: newTenant.name,
            parentId: newTenant.parent_id,
            status: newTenant.status,
            createdAt: newTenant.created_at,
          },
        });
      } catch (err) {
        await pool.query('ROLLBACK');
        fastify.log.error({ err }, 'Create subtenant transaction failed');
        return reply.code(500).send({ error: 'Failed to create subtenant' });
      }
    }
  );

  // ── GET /v1/portal/agents ─────────────────────────────────────────────────────
  fastify.get('/v1/portal/agents', { preHandler: authRequired }, async (request, reply) => {
    const { tenantId } = request.portalUser!;

    const result = await pool.query<{
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
      `SELECT id, name, provider_config, system_prompt, skills, mcp_endpoints, merge_policies, available_models, conversations_enabled, conversation_token_limit, conversation_summary_model, created_at, updated_at
       FROM agents WHERE tenant_id = $1 ORDER BY created_at`,
      [tenantId]
    );

    return reply.send({ agents: result.rows.map(formatAgent) });
  });

  // ── POST /v1/portal/agents ────────────────────────────────────────────────────
  fastify.post<{
    Body: {
      name: string;
      providerConfig?: Record<string, unknown>;
      systemPrompt?: string;
      skills?: unknown[];
      mcpEndpoints?: unknown[];
      mergePolicies?: Record<string, unknown>;
    };
  }>('/v1/portal/agents', { preHandler: authRequired }, async (request, reply) => {
    const { tenantId } = request.portalUser!;
    const { name, providerConfig, systemPrompt, skills, mcpEndpoints, mergePolicies } = request.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return reply.code(400).send({ error: 'name is required' });
    }

    const storedProviderConfig = prepareAgentProviderConfig(tenantId, providerConfig ?? null);
    const storedMergePolicies = mergePolicies ?? DEFAULT_MERGE_POLICIES;

    const result = await pool.query<{
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
        name.trim(),
        storedProviderConfig ? JSON.stringify(storedProviderConfig) : null,
        systemPrompt ?? null,
        skills ? JSON.stringify(skills) : null,
        mcpEndpoints ? JSON.stringify(mcpEndpoints) : null,
        JSON.stringify(storedMergePolicies),
      ]
    );

    return reply.code(201).send({ agent: formatAgent(result.rows[0]) });
  });

  // ── GET /v1/portal/agents/:id ─────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/v1/portal/agents/:id',
    { preHandler: authRequired },
    async (request, reply) => {
      const { tenantId } = request.portalUser!;
      const { id } = request.params;

      const result = await pool.query<{
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
                a.available_models, a.conversations_enabled, a.conversation_token_limit, a.conversation_summary_model,
                a.created_at, a.updated_at
         FROM agents a
         JOIN tenant_memberships tm ON tm.tenant_id = a.tenant_id
         WHERE a.id = $1 AND tm.user_id = $2`,
        [id, request.portalUser!.userId]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Agent not found' });
      }
      return reply.send({ agent: formatAgent(result.rows[0]) });
    }
  );

  // ── PUT /v1/portal/agents/:id ─────────────────────────────────────────────────
  fastify.put<{
    Params: { id: string };
    Body: {
      name?: string;
      providerConfig?: Record<string, unknown>;
      systemPrompt?: string;
      skills?: unknown[];
      mcpEndpoints?: unknown[];
      mergePolicies?: Record<string, unknown>;
      availableModels?: string[] | null;
      conversationsEnabled?: boolean;
      conversationTokenLimit?: number | null;
      conversationSummaryModel?: string | null;
    };
  }>(
    '/v1/portal/agents/:id',
    { preHandler: authRequired },
    async (request, reply) => {
      const { tenantId, userId } = request.portalUser!;
      const { id } = request.params;
      const { name, providerConfig, systemPrompt, skills, mcpEndpoints, mergePolicies, availableModels, conversationsEnabled, conversationTokenLimit, conversationSummaryModel } = request.body;

      // Verify membership
      const memberCheck = await pool.query(
        `SELECT 1 FROM agents a JOIN tenant_memberships tm ON tm.tenant_id = a.tenant_id
         WHERE a.id = $1 AND tm.user_id = $2`,
        [id, userId]
      );
      if (memberCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'Agent not found' });
      }

      const setClauses: string[] = ['updated_at = now()'];
      const values: unknown[] = [];
      let idx = 1;

      if (name !== undefined) { setClauses.push(`name = $${idx++}`); values.push(name.trim()); }
      if (providerConfig !== undefined) {
        const stored = prepareAgentProviderConfig(tenantId, providerConfig);
        setClauses.push(`provider_config = $${idx++}`);
        values.push(stored ? JSON.stringify(stored) : null);
      }
      if (systemPrompt !== undefined) { setClauses.push(`system_prompt = $${idx++}`); values.push(systemPrompt); }
      if (skills !== undefined) { setClauses.push(`skills = $${idx++}`); values.push(JSON.stringify(skills)); }
      if (mcpEndpoints !== undefined) { setClauses.push(`mcp_endpoints = $${idx++}`); values.push(JSON.stringify(mcpEndpoints)); }
      if (mergePolicies !== undefined) { setClauses.push(`merge_policies = $${idx++}`); values.push(JSON.stringify(mergePolicies)); }
      if (availableModels !== undefined) { setClauses.push(`available_models = $${idx++}`); values.push(availableModels !== null ? JSON.stringify(availableModels) : null); }
      if (conversationsEnabled !== undefined) { setClauses.push(`conversations_enabled = $${idx++}`); values.push(conversationsEnabled); }
      if (conversationTokenLimit !== undefined) { setClauses.push(`conversation_token_limit = $${idx++}`); values.push(conversationTokenLimit); }
      if (conversationSummaryModel !== undefined) { setClauses.push(`conversation_summary_model = $${idx++}`); values.push(conversationSummaryModel || null); }

      values.push(id, tenantId);

      const result = await pool.query<{
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
         RETURNING id, name, provider_config, system_prompt, skills, mcp_endpoints, merge_policies, available_models, conversations_enabled, conversation_token_limit, conversation_summary_model, created_at, updated_at`,
        values
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Agent not found' });
      }
      return reply.send({ agent: formatAgent(result.rows[0]) });
    }
  );

  // ── DELETE /v1/portal/agents/:id ──────────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>(
    '/v1/portal/agents/:id',
    { preHandler: ownerRequired },
    async (request, reply) => {
      const { tenantId } = request.portalUser!;
      const { id } = request.params;

      const result = await pool.query(
        `DELETE FROM agents WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Agent not found' });
      }
      return reply.code(204).send();
    }
  );

  // ── GET /v1/portal/agents/:id/resolved ───────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/v1/portal/agents/:id/resolved',
    { preHandler: authRequired },
    async (request, reply) => {
      const { userId } = request.portalUser!;
      const { id } = request.params;

      // Fetch agent + verify membership
      const agentResult = await pool.query<{
        id: string; name: string; tenant_id: string;
        provider_config: Record<string, unknown> | null;
        system_prompt: string | null;
        skills: unknown[] | null;
        mcp_endpoints: unknown[] | null;
        merge_policies: Record<string, unknown>;
      }>(
        `SELECT a.id, a.name, a.tenant_id, a.provider_config, a.system_prompt, a.skills, a.mcp_endpoints, a.merge_policies
         FROM agents a
         JOIN tenant_memberships tm ON tm.tenant_id = a.tenant_id
         WHERE a.id = $1 AND tm.user_id = $2`,
        [id, userId]
      );

      if (agentResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Agent not found' });
      }
      const agent = agentResult.rows[0];

      // Walk tenant hierarchy upward via recursive CTE
      const chainResult = await pool.query<{
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
        [agent.tenant_id]
      );
      const tenantChain = chainResult.rows;

      // Resolve: first non-null providerConfig (agent first, then tenant chain)
      let resolvedProviderConfig: Record<string, unknown> | null = agent.provider_config ?? null;
      if (!resolvedProviderConfig) {
        for (const t of tenantChain) {
          if (t.provider_config) { resolvedProviderConfig = t.provider_config; break; }
        }
      }

      // Resolve: first non-null systemPrompt
      let resolvedSystemPrompt: string | null = agent.system_prompt ?? null;
      if (!resolvedSystemPrompt) {
        for (const t of tenantChain) {
          if (t.system_prompt) { resolvedSystemPrompt = t.system_prompt; break; }
        }
      }

      // Resolve: union of skills (agent + all tenant levels)
      const skillsUnion: unknown[] = [];
      const skillsSeen = new Set<string>();
      const addSkills = (arr: unknown[] | null) => {
        if (!arr) return;
        for (const s of arr) {
          const key = JSON.stringify(s);
          if (!skillsSeen.has(key)) { skillsSeen.add(key); skillsUnion.push(s); }
        }
      };
      addSkills(agent.skills);
      for (const t of tenantChain) addSkills(t.skills);

      // Resolve: union of mcpEndpoints
      const endpointsUnion: unknown[] = [];
      const endpointsSeen = new Set<string>();
      const addEndpoints = (arr: unknown[] | null) => {
        if (!arr) return;
        for (const e of arr) {
          const key = JSON.stringify(e);
          if (!endpointsSeen.has(key)) { endpointsSeen.add(key); endpointsUnion.push(e); }
        }
      };
      addEndpoints(agent.mcp_endpoints);
      for (const t of tenantChain) addEndpoints(t.mcp_endpoints);

      const inheritanceChain = [
        { level: 'agent' as const, name: agent.name, id: agent.id },
        ...tenantChain.map((t) => ({ level: 'tenant' as const, name: t.name, id: t.id })),
      ];

      return reply.send({
        resolved: {
          providerConfig: sanitizeAgentProviderConfig(resolvedProviderConfig),
          systemPrompt: resolvedSystemPrompt,
          skills: skillsUnion,
          mcpEndpoints: endpointsUnion,
          mergePolicies: agent.merge_policies,
          inheritanceChain,
        },
      });
    }
  );

  // ── POST /v1/portal/agents/:id/chat ──────────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: { messages?: unknown[]; model?: string; conversation_id?: string; partition_id?: string } }>(
    '/v1/portal/agents/:id/chat',
    { preHandler: authRequired },
    async (request, reply) => {
      const { userId } = request.portalUser!;
      const { id } = request.params;
      const body = request.body as { messages?: unknown[]; model?: string; conversation_id?: string; partition_id?: string };

      if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        return reply.code(400).send({ error: 'messages array is required and must not be empty' });
      }

      // Fetch agent + verify membership
      const agentResult = await pool.query<{
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
        `SELECT a.id, a.name, a.tenant_id, a.provider_config, a.system_prompt, a.skills, a.mcp_endpoints, a.merge_policies,
                a.conversations_enabled, a.conversation_token_limit, a.conversation_summary_model
         FROM agents a
         JOIN tenant_memberships tm ON tm.tenant_id = a.tenant_id
         WHERE a.id = $1 AND tm.user_id = $2`,
        [id, userId]
      );

      if (agentResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Agent not found' });
      }
      const agent = agentResult.rows[0];

      // Walk tenant hierarchy upward via recursive CTE
      const chainResult = await pool.query<{
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
        [agent.tenant_id]
      );
      const tenantChain = chainResult.rows;

      // Resolve providerConfig: agent first, then tenant chain
      let resolvedProviderConfig: Record<string, unknown> | null = agent.provider_config ?? null;
      if (!resolvedProviderConfig) {
        for (const t of tenantChain) {
          if (t.provider_config) { resolvedProviderConfig = t.provider_config; break; }
        }
      }

      if (!resolvedProviderConfig && !process.env.OPENAI_API_KEY) {
        return reply.code(400).send({ error: 'Agent has no provider configured' });
      }

      // Resolve systemPrompt
      let resolvedSystemPrompt: string | null = agent.system_prompt ?? null;
      if (!resolvedSystemPrompt) {
        for (const t of tenantChain) {
          if (t.system_prompt) { resolvedSystemPrompt = t.system_prompt; break; }
        }
      }

      // Resolve skills union
      const skillsUnion: unknown[] = [];
      const skillsSeen = new Set<string>();
      const addSkills = (arr: unknown[] | null) => {
        if (!arr) return;
        for (const s of arr) {
          const key = JSON.stringify(s);
          if (!skillsSeen.has(key)) { skillsSeen.add(key); skillsUnion.push(s); }
        }
      };
      addSkills(agent.skills);
      for (const t of tenantChain) addSkills(t.skills);

      // Resolve mcpEndpoints union
      const endpointsUnion: unknown[] = [];
      const endpointsSeen = new Set<string>();
      const addEndpoints = (arr: unknown[] | null) => {
        if (!arr) return;
        for (const e of arr) {
          const key = JSON.stringify(e);
          if (!endpointsSeen.has(key)) { endpointsSeen.add(key); endpointsUnion.push(e); }
        }
      };
      addEndpoints(agent.mcp_endpoints);
      for (const t of tenantChain) addEndpoints(t.mcp_endpoints);

      const mergePolicies = (agent.merge_policies as any) ?? { system_prompt: 'prepend', skills: 'merge' };

      const tenantCtx: TenantContext = {
        tenantId: agent.tenant_id,
        name: tenantChain[0]?.name ?? agent.tenant_id,
        agentId: agent.id,
        providerConfig: resolvedProviderConfig as any,
        resolvedSystemPrompt: resolvedSystemPrompt ?? undefined,
        resolvedSkills: skillsUnion.length > 0 ? skillsUnion : undefined,
        resolvedMcpEndpoints: endpointsUnion.length > 0 ? endpointsUnion : undefined,
        mergePolicies,
      };

      const provider = getProviderForTenant(tenantCtx);
      const model = body.model ?? 'gpt-4o-mini';

      // ── Conversation memory support ────────────────────────────────────────────
      let resolvedConversationId: string | undefined;
      let effectiveMessages = body.messages as any[];

      if (agent.conversations_enabled) {
        const incomingConversationId = body.conversation_id ?? crypto.randomUUID();
        try {
          const partitionId = body.partition_id
            ? (await conversationManager.getOrCreatePartition(
                pool,
                tenantCtx.tenantId,
                body.partition_id,
              )).id
            : null;

          const conversationUUID = (await conversationManager.getOrCreateConversation(
            pool,
            tenantCtx.tenantId,
            partitionId,
            incomingConversationId,
            agent.id,
          )).id;
          resolvedConversationId = incomingConversationId;

          const ctx = await conversationManager.loadContext(pool, tenantCtx.tenantId, conversationUUID);
          const historyMessages = conversationManager.buildInjectionMessages(ctx);
          if (historyMessages.length > 0) {
            effectiveMessages = [...historyMessages, ...effectiveMessages];
          }
        } catch (err) {
          fastify.log.warn({ err }, 'Sandbox conversation load failed — continuing without memory');
        }
      }

      const effectiveBody = applyAgentToRequest(
        { model, messages: effectiveMessages, stream: false },
        tenantCtx,
      );

      try {
        const startTimeMs = Date.now();
        const upstreamStartMs = Date.now();
        const response = await provider.proxy({
          url: '/v1/chat/completions',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: effectiveBody,
        });

        if (response.status >= 400) {
          return reply.code(502).send({ error: 'Provider returned an error', details: response.body });
        }

        const choice = response.body?.choices?.[0];
        if (!choice) {
          return reply.code(502).send({ error: 'Provider returned no choices' });
        }

        const latencyMs = Date.now() - startTimeMs;
        const usage = response.body?.usage;
        traceRecorder.record({
          tenantId: agent.tenant_id,
          agentId: agent.id,
          model: response.body?.model ?? model,
          provider: provider.name,
          requestBody: effectiveBody,
          responseBody: response.body,
          latencyMs,
          statusCode: response.status,
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
          ttfbMs: latencyMs,
          gatewayOverheadMs: upstreamStartMs - startTimeMs,
        });
        // Flush immediately so the trace is in the DB before the response
        // reaches the client — sandbox callers expect instant trace visibility.
        await traceRecorder.flush();

        // Store conversation messages (fire-and-forget)
        if (resolvedConversationId) {
          const partitionId = body.partition_id
            ? (await conversationManager.getOrCreatePartition(
                pool,
                tenantCtx.tenantId,
                body.partition_id,
              )).id
            : null;
          const conversationUUID = (await conversationManager.getOrCreateConversation(
            pool,
            tenantCtx.tenantId,
            partitionId,
            resolvedConversationId,
            agent.id,
          )).id;
          const userContent = (body.messages[body.messages.length - 1] as any)?.content as string ?? '';
          const assistantContent = choice.message.content ?? '';
          conversationManager.storeMessages(
            pool, tenantCtx.tenantId, conversationUUID, userContent, assistantContent, null, null
          ).catch(err => fastify.log.warn({ err }, 'Failed to store sandbox conversation messages'));
        }

        return reply.send({
          message: choice.message,
          model: response.body.model ?? model,
          usage: response.body.usage ?? null,
          ...(resolvedConversationId ? { conversation_id: resolvedConversationId } : {}),
        });
      } catch (err: any) {
        return reply.code(502).send({ error: 'Provider call failed', details: err?.message ?? String(err) });
      }
    }
  );

  // ── Partitions ────────────────────────────────────────────────────────────

  // GET /v1/portal/partitions — list all partitions for the tenant as a tree
  fastify.get('/v1/portal/partitions', { preHandler: authRequired }, async (request, reply) => {
    const { tenantId } = request.portalUser!;

    const result = await pool.query<{
      id: string;
      parent_id: string | null;
      external_id: string;
      title_encrypted: string | null;
      title_iv: string | null;
      created_at: string;
    }>(
      `SELECT id, parent_id, external_id, title_encrypted, title_iv, created_at
       FROM partitions
       WHERE tenant_id = $1
       ORDER BY created_at ASC`,
      [tenantId],
    );

    const flat = result.rows.map((row) => {
      let title: string | null = null;
      if (row.title_encrypted && row.title_iv) {
        try { title = decryptTraceBody(tenantId, row.title_encrypted, row.title_iv); } catch { /* skip */ }
      }
      return { uuid: row.id, id: row.external_id, parentId: row.parent_id, title, createdAt: row.created_at };
    });

    // Build tree
    const map = new Map<string, any>(flat.map((p) => [p.uuid, { ...p, children: [] }]));
    const roots: any[] = [];
    for (const p of map.values()) {
      if (p.parentId) {
        map.get(p.parentId)?.children.push(p);
      } else {
        roots.push(p);
      }
    }
    return reply.send({ partitions: roots });
  });

  // POST /v1/portal/partitions — create a partition
  fastify.post<{ Body: { external_id: string; parent_id?: string; title?: string } }>(
    '/v1/portal/partitions',
    { preHandler: authRequired },
    async (request, reply) => {
      const { tenantId } = request.portalUser!;
      const { external_id, parent_id, title } = request.body;

      if (!external_id || typeof external_id !== 'string') {
        return reply.code(400).send({ error: 'external_id is required' });
      }

      let titleEncrypted: string | null = null;
      let titleIv: string | null = null;
      if (title) {
        const enc = encryptTraceBody(tenantId, title);
        titleEncrypted = enc.ciphertext;
        titleIv = enc.iv;
      }

      try {
        const result = await pool.query<{ id: string; external_id: string; parent_id: string | null; created_at: string }>(
          `INSERT INTO partitions (tenant_id, parent_id, external_id, title_encrypted, title_iv)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, external_id, parent_id, created_at`,
          [tenantId, parent_id ?? null, external_id, titleEncrypted, titleIv],
        );
        const row = result.rows[0];
        return reply.code(201).send({
          uuid: row.id,
          id: row.external_id,
          parentId: row.parent_id,
          title: title ?? null,
          createdAt: row.created_at,
        });
      } catch (err: any) {
        if (err.code === '23505') return reply.code(409).send({ error: 'Partition already exists' });
        throw err;
      }
    },
  );

  // PUT /v1/portal/partitions/:id — update partition title or parent
  fastify.put<{ Params: { id: string }; Body: { title?: string; parent_id?: string | null } }>(
    '/v1/portal/partitions/:id',
    { preHandler: authRequired },
    async (request, reply) => {
      const { tenantId } = request.portalUser!;
      const { id } = request.params;
      const { title, parent_id } = request.body;

      const sets: string[] = [];
      const params: any[] = [id, tenantId];

      if (title !== undefined) {
        const enc = encryptTraceBody(tenantId, title);
        sets.push(`title_encrypted = $${params.length + 1}, title_iv = $${params.length + 2}`);
        params.push(enc.ciphertext, enc.iv);
      }
      if (parent_id !== undefined) {
        sets.push(`parent_id = $${params.length + 1}`);
        params.push(parent_id);
      }
      if (sets.length === 0) return reply.code(400).send({ error: 'No fields to update' });

      const result = await pool.query(
        `UPDATE partitions SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        params,
      );
      if (result.rowCount === 0) return reply.code(404).send({ error: 'Partition not found' });
      return reply.send({ success: true });
    },
  );

  // DELETE /v1/portal/partitions/:id
  fastify.delete<{ Params: { id: string } }>(
    '/v1/portal/partitions/:id',
    { preHandler: authRequired },
    async (request, reply) => {
      const { tenantId } = request.portalUser!;
      const { id } = request.params;

      const result = await pool.query(
        `DELETE FROM partitions WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
      if (result.rowCount === 0) return reply.code(404).send({ error: 'Partition not found' });
      return reply.send({ success: true });
    },
  );

  // ── Conversations ─────────────────────────────────────────────────────────

  // GET /v1/portal/conversations — list conversations (metadata only)
  fastify.get<{ Querystring: { partition_id?: string } }>(
    '/v1/portal/conversations',
    { preHandler: authRequired },
    async (request, reply) => {
      const { tenantId } = request.portalUser!;
      const { partition_id } = request.query;

      const result = await pool.query<{
        id: string;
        agent_id: string | null;
        partition_id: string | null;
        external_id: string;
        created_at: string;
        last_active_at: string;
      }>(
        `SELECT c.id, c.agent_id, c.partition_id, c.external_id, c.created_at, c.last_active_at
         FROM conversations c
         WHERE c.tenant_id = $1
           AND ($2::uuid IS NULL OR c.partition_id = $2)
         ORDER BY c.last_active_at DESC`,
        [tenantId, partition_id ?? null],
      );

      return reply.send({
        conversations: result.rows.map((row) => ({
          uuid: row.id,
          id: row.external_id,
          agentId: row.agent_id,
          partitionId: row.partition_id,
          createdAt: row.created_at,
          lastActiveAt: row.last_active_at,
        })),
      });
    },
  );

  // GET /v1/portal/conversations/:id — conversation detail with decrypted messages
  fastify.get<{ Params: { id: string } }>(
    '/v1/portal/conversations/:id',
    { preHandler: authRequired },
    async (request, reply) => {
      const { tenantId } = request.portalUser!;
      const { id } = request.params;

      const convResult = await pool.query<{
        id: string;
        agent_id: string | null;
        partition_id: string | null;
        external_id: string;
        created_at: string;
        last_active_at: string;
      }>(
        `SELECT id, agent_id, partition_id, external_id, created_at, last_active_at
         FROM conversations WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
      if (convResult.rows.length === 0) return reply.code(404).send({ error: 'Conversation not found' });
      const conv = convResult.rows[0];

      // Snapshots
      const snapResult = await pool.query<{
        id: string;
        summary_encrypted: string;
        summary_iv: string;
        messages_archived: number;
        created_at: string;
      }>(
        `SELECT id, summary_encrypted, summary_iv, messages_archived, created_at
         FROM conversation_snapshots WHERE conversation_id = $1 ORDER BY created_at ASC`,
        [id],
      );
      const snapshots = snapResult.rows.map((row) => {
        let summary: string | null = null;
        try { summary = decryptTraceBody(tenantId, row.summary_encrypted, row.summary_iv); } catch { /* skip */ }
        return { id: row.id, summary, messagesArchived: row.messages_archived, createdAt: row.created_at };
      });

      // Messages (all, ordered chronologically)
      const msgResult = await pool.query<{
        id: string;
        role: string;
        content_encrypted: string;
        content_iv: string;
        token_estimate: number | null;
        snapshot_id: string | null;
        created_at: string;
      }>(
        `SELECT id, role, content_encrypted, content_iv, token_estimate, snapshot_id, created_at
         FROM conversation_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
        [id],
      );
      const messages = msgResult.rows.map((row) => {
        let content: string | null = null;
        try { content = decryptTraceBody(tenantId, row.content_encrypted, row.content_iv); } catch { /* skip */ }
        return {
          id: row.id,
          role: row.role,
          content,
          tokenEstimate: row.token_estimate,
          snapshotId: row.snapshot_id,
          createdAt: row.created_at,
        };
      });

      return reply.send({
        conversation: {
          uuid: conv.id,
          id: conv.external_id,
          agentId: conv.agent_id,
          partitionId: conv.partition_id,
          createdAt: conv.created_at,
          lastActiveAt: conv.last_active_at,
        },
        snapshots,
        messages,
      });
    },
  );
}
