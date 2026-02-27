import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { scrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
import { createSigner } from 'fast-jwt';
import { registerPortalAuthMiddleware } from '../middleware/portalAuth.js';
import { invalidateCachedKey } from '../auth.js';
import { encryptTraceBody } from '../encryption.js';
import { evictProvider } from '../providers/registry.js';
import { getAnalyticsSummary, getTimeseriesMetrics, getModelBreakdown } from '../analytics.js';
import { query } from '../db.js';

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
      const { rawKey, keyHash, keyPrefix } = generateApiKey();

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
        await pool.query(
          `INSERT INTO api_keys (tenant_id, name, key_prefix, key_hash) VALUES ($1, 'Default', $2, $3)`,
          [tenant.id, keyPrefix, keyHash]
        );
        await pool.query('COMMIT');

        const token = signPortalToken({ sub: user.id, tenantId: tenant.id, role: 'owner' });
        return reply.code(201).send({
          token,
          user: { id: user.id, email: user.email },
          tenant: { id: tenant.id, name: tenant.name },
          apiKey: rawKey,
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
    }>(
      `SELECT u.id, u.email, tm.role, t.id AS tenant_id, t.name AS tenant_name, t.provider_config
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

    return reply.send({
      user: { id: row.id, email: row.email, role: row.role },
      tenant: { id: row.tenant_id, name: row.tenant_name, providerConfig },
      tenants: tenantsResult.rows.map((t) => ({ id: t.tenant_id, name: t.tenant_name, role: t.role })),
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
    };
  }>('/v1/portal/settings', { preHandler: ownerRequired }, async (request, reply) => {
    const { tenantId } = request.portalUser!;
    const { provider, apiKey, baseUrl, deployment, apiVersion } = request.body;

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

    await pool.query(
      'UPDATE tenants SET provider_config = $1, updated_at = now() WHERE id = $2',
      [JSON.stringify(providerConfig), tenantId]
    );

    evictProvider(tenantId);

    return reply.send({
      providerConfig: {
        provider,
        baseUrl: baseUrl ?? null,
        deployment: deployment ?? null,
        apiVersion: apiVersion ?? null,
        hasApiKey: !!apiKey,
      },
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
  fastify.post<{ Body: { name: string } }>(
    '/v1/portal/api-keys',
    { preHandler: ownerRequired },
    async (request, reply) => {
      const { tenantId } = request.portalUser!;
      const { name } = request.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return reply.code(400).send({ error: 'API key name is required' });
      }

      const { rawKey, keyHash, keyPrefix } = generateApiKey();

      const result = await pool.query<{
        id: string;
        name: string;
        key_prefix: string;
        status: string;
        created_at: string;
      }>(
        `INSERT INTO api_keys (tenant_id, name, key_prefix, key_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, key_prefix, status, created_at`,
        [tenantId, name.trim(), keyPrefix, keyHash]
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
    const summary = await getAnalyticsSummary(tenantId, windowHours);
    return reply.send(summary);
  });

  // ── GET /v1/portal/analytics/timeseries ─────────────────────────────────────
  fastify.get('/v1/portal/analytics/timeseries', { preHandler: authRequired }, async (request, reply) => {
    const { tenantId } = request.portalUser!;
    const qs = request.query as Record<string, string>;
    const windowHours   = parseInt(qs.window ?? '24', 10);
    const bucketMinutes = parseInt(qs.bucket ?? '60', 10);
    const timeseries = await getTimeseriesMetrics(tenantId, windowHours, bucketMinutes);
    return reply.send(timeseries);
  });

  // ── GET /v1/portal/analytics/models ─────────────────────────────────────────
  fastify.get('/v1/portal/analytics/models', { preHandler: authRequired }, async (request, reply) => {
    const { tenantId } = request.portalUser!;
    const qs = request.query as Record<string, string>;
    const windowHours = parseInt(qs.window ?? '24', 10);
    const models = await getModelBreakdown(tenantId, windowHours);
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
}
