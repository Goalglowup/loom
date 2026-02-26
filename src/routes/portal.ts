import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { scrypt, randomBytes, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
import { registerPortalAuthMiddleware } from '../middleware/portalAuth.js';
import { invalidateCachedKey } from '../auth.js';
import { encryptTraceBody } from '../encryption.js';
import { evictProvider } from '../providers/registry.js';

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
  const { timingSafeEqual } = await import('node:crypto');
  return timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
}

function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const rawKey = 'loom_sk_' + randomBytes(24).toString('base64url');
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 15); // 'loom_sk_' + first 7 chars
  return { rawKey, keyHash, keyPrefix };
}

export function registerPortalRoutes(fastify: FastifyInstance, pool: pg.Pool): void {
  // ── POST /v1/portal/auth/signup ──────────────────────────────────────────────
  fastify.post<{
    Body: { tenantName: string; email: string; password: string };
  }>('/v1/portal/auth/signup', async (request, reply) => {
    const { tenantName, email, password } = request.body;

    // Validate inputs
    if (!tenantName || typeof tenantName !== 'string' || tenantName.trim().length === 0) {
      return reply.code(400).send({ error: 'tenantName is required' });
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: 'Valid email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    }

    // Check email uniqueness before starting transaction
    const emailCheck = await pool.query(
      'SELECT id FROM tenant_users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (emailCheck.rows.length > 0) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await hashPassword(password);
    const { rawKey, keyHash, keyPrefix } = generateApiKey();

    await pool.query('BEGIN');
    try {
      // Insert tenant
      const tenantResult = await pool.query<{ id: string; name: string }>(
        'INSERT INTO tenants (name) VALUES ($1) RETURNING id, name',
        [tenantName.trim()]
      );
      const tenant = tenantResult.rows[0];

      // Insert tenant user
      const userResult = await pool.query<{ id: string; email: string; role: string }>(
        `INSERT INTO tenant_users (tenant_id, email, password_hash, role)
         VALUES ($1, $2, $3, 'owner')
         RETURNING id, email, role`,
        [tenant.id, email.toLowerCase(), passwordHash]
      );
      const user = userResult.rows[0];

      // Insert default API key
      await pool.query(
        `INSERT INTO api_keys (tenant_id, name, key_prefix, key_hash)
         VALUES ($1, 'Default', $2, $3)`,
        [tenant.id, keyPrefix, keyHash]
      );

      await pool.query('COMMIT');

      // Sign portal JWT
      const token = (fastify as any).portalJwt.sign(
        { sub: user.id, tenantId: tenant.id, role: 'owner' },
        { expiresIn: '24h' }
      );

      return reply.code(201).send({
        token,
        user: { id: user.id, email: user.email, role: user.role },
        tenant: { id: tenant.id, name: tenant.name },
        apiKey: rawKey,
      });
    } catch (err) {
      await pool.query('ROLLBACK');
      fastify.log.error({ err }, 'Signup transaction failed');
      return reply.code(500).send({ error: 'Signup failed' });
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

    const result = await pool.query<{
      id: string;
      email: string;
      password_hash: string;
      role: string;
      tenant_id: string;
      tenant_name: string;
      tenant_status: string;
    }>(
      `SELECT tu.id, tu.email, tu.password_hash, tu.role, tu.tenant_id,
              t.name AS tenant_name, t.status AS tenant_status
       FROM tenant_users tu
       JOIN tenants t ON tu.tenant_id = t.id
       WHERE tu.email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const row = result.rows[0];

    try {
      const isValid = await verifyPassword(password, row.password_hash);
      if (!isValid) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }
    } catch {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    if (row.tenant_status !== 'active') {
      return reply.code(403).send({ error: 'Tenant account is suspended' });
    }

    await pool.query('UPDATE tenant_users SET last_login = now() WHERE id = $1', [row.id]);

    const token = (fastify as any).portalJwt.sign(
      { sub: row.id, tenantId: row.tenant_id, role: row.role },
      { expiresIn: '24h' }
    );

    return reply.send({
      token,
      user: { id: row.id, email: row.email, role: row.role },
      tenant: { id: row.tenant_id, name: row.tenant_name },
    });
  });

  const authRequired = registerPortalAuthMiddleware(fastify);
  const ownerRequired = registerPortalAuthMiddleware(fastify, 'owner');

  // ── GET /v1/portal/me ────────────────────────────────────────────────────────
  fastify.get('/v1/portal/me', { preHandler: authRequired }, async (request, reply) => {
    const { userId, tenantId } = request.portalUser!;

    const result = await pool.query<{
      id: string;
      email: string;
      role: string;
      tenant_id: string;
      tenant_name: string;
      provider_config: any;
    }>(
      `SELECT tu.id, tu.email, tu.role, t.id AS tenant_id, t.name AS tenant_name, t.provider_config
       FROM tenant_users tu
       JOIN tenants t ON tu.tenant_id = t.id
       WHERE tu.id = $1 AND t.id = $2`,
      [userId, tenantId]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const row = result.rows[0];
    const cfg = row.provider_config;
    const providerConfig = cfg
      ? {
          provider: cfg.provider,
          baseUrl: cfg.baseUrl ?? null,
          deployment: cfg.deployment ?? null,
          apiVersion: cfg.apiVersion ?? null,
          hasApiKey: !!(cfg.apiKey),
        }
      : null;

    return reply.send({
      user: { id: row.id, email: row.email, role: row.role },
      tenant: {
        id: row.tenant_id,
        name: row.tenant_name,
        providerConfig,
      },
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

    if (!provider || (provider !== 'openai' && provider !== 'azure')) {
      return reply.code(400).send({ error: 'Provider must be "openai" or "azure"' });
    }

    const providerConfig: any = { provider };
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
}
