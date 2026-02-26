import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { scrypt, timingSafeEqual, randomBytes, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
import { adminAuthMiddleware } from '../middleware/adminAuth.js';
import { invalidateCachedKey, invalidateAllKeysForTenant } from '../auth.js';
import { evictProvider } from '../providers/registry.js';
import { encryptTraceBody, decryptTraceBody } from '../encryption.js';

const scryptAsync = promisify(scrypt);

interface LoginBody {
  username: string;
  password: string;
}

/**
 * Verify password using scrypt (same format as migration: salt:derivedKey)
 */
async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, key] = storedHash.split(':');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
}

/**
 * Register admin routes
 * All routes except /v1/admin/auth/login require JWT authentication
 */
export function registerAdminRoutes(fastify: FastifyInstance, pool: pg.Pool): void {
  // POST /v1/admin/auth/login — Admin login endpoint
  fastify.post<{ Body: LoginBody }>(
    '/v1/admin/auth/login',
    async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
      const { username, password } = request.body;

      if (!username || !password) {
        return reply.code(400).send({ error: 'Username and password required' });
      }

      // Look up admin user
      const result = await pool.query<{
        id: string;
        username: string;
        password_hash: string;
      }>(
        'SELECT id, username, password_hash FROM admin_users WHERE username = $1',
        [username]
      );

      if (result.rows.length === 0) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const adminUser = result.rows[0];

      // Verify password
      try {
        const isValid = await verifyPassword(password, adminUser.password_hash);
        if (!isValid) {
          return reply.code(401).send({ error: 'Invalid credentials' });
        }
      } catch (err) {
        fastify.log.error({ err }, 'Password verification failed');
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      // Update last_login timestamp
      await pool.query(
        'UPDATE admin_users SET last_login = now() WHERE id = $1',
        [adminUser.id]
      );

      // Issue JWT (8 hour expiry)
      const token = fastify.jwt.sign(
        { sub: adminUser.id, username: adminUser.username },
        { expiresIn: '8h' }
      );

      return reply.send({ token, username: adminUser.username });
    }
  );

  // Tenant CRUD stubs — all require admin auth
  const authOpts = { preHandler: adminAuthMiddleware };

  // POST /v1/admin/tenants — Create tenant
  fastify.post<{ Body: { name: string } }>(
    '/v1/admin/tenants',
    authOpts,
    async (request, reply) => {
      const { name } = request.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return reply.code(400).send({ error: 'Tenant name is required' });
      }

      const result = await pool.query<{
        id: string;
        name: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>(
        'INSERT INTO tenants (name) VALUES ($1) RETURNING id, name, status, created_at, updated_at',
        [name.trim()]
      );

      return reply.code(201).send(result.rows[0]);
    }
  );

  // GET /v1/admin/tenants — List tenants
  fastify.get<{
    Querystring: { limit?: string; offset?: string; status?: string };
  }>('/v1/admin/tenants', authOpts, async (request, reply) => {
    const limit = Math.min(parseInt(request.query.limit ?? '50', 10), 200);
    const offset = parseInt(request.query.offset ?? '0', 10);
    const { status } = request.query;

    let query = 'SELECT id, name, status, created_at, updated_at FROM tenants';
    const params: unknown[] = [];

    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const [tenants, countResult] = await Promise.all([
      pool.query<{
        id: string;
        name: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>(query, params),
      pool.query<{ count: string }>(
        status ? 'SELECT COUNT(*) FROM tenants WHERE status = $1' : 'SELECT COUNT(*) FROM tenants',
        status ? [status] : []
      ),
    ]);

    return reply.send({
      tenants: tenants.rows,
      total: parseInt(countResult.rows[0].count, 10),
    });
  });

  // GET /v1/admin/tenants/:id — Get tenant details
  fastify.get<{ Params: { id: string } }>(
    '/v1/admin/tenants/:id',
    authOpts,
    async (request, reply) => {
      const { id } = request.params;

      const result = await pool.query<{
        id: string;
        name: string;
        status: string;
        provider_config: any;
        created_at: string;
        updated_at: string;
        api_key_count: string;
      }>(
        `SELECT 
          t.id,
          t.name,
          t.status,
          t.provider_config,
          t.created_at,
          t.updated_at,
          COUNT(ak.id) AS api_key_count
        FROM tenants t
        LEFT JOIN api_keys ak ON ak.tenant_id = t.id
        WHERE t.id = $1
        GROUP BY t.id`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Tenant not found' });
      }

      const tenant = result.rows[0];
      
      // Build provider config summary
      let providerConfigSummary = null;
      if (tenant.provider_config) {
        const cfg = tenant.provider_config;
        providerConfigSummary = {
          provider: cfg.provider,
          baseUrl: cfg.baseUrl,
          deployment: cfg.deployment,
          apiVersion: cfg.apiVersion,
          hasApiKey: !!(cfg.apiKey),
        };
      }

      return reply.send({
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        providerConfig: providerConfigSummary,
        apiKeyCount: parseInt(tenant.api_key_count, 10),
        createdAt: tenant.created_at,
        updatedAt: tenant.updated_at,
      });
    }
  );

  // PATCH /v1/admin/tenants/:id — Update tenant
  fastify.patch<{
    Params: { id: string };
    Body: { name?: string; status?: string };
  }>('/v1/admin/tenants/:id', authOpts, async (request, reply) => {
    const { id } = request.params;
    const { name, status } = request.body;

    if (!name && !status) {
      return reply.code(400).send({ error: 'At least one field (name or status) is required' });
    }

    if (status && status !== 'active' && status !== 'inactive') {
      return reply.code(400).send({ error: 'Status must be "active" or "inactive"' });
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name.trim());
    }

    if (status) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    updates.push(`updated_at = now()`);
    params.push(id);

    const result = await pool.query<{
      id: string;
      name: string;
      status: string;
      created_at: string;
      updated_at: string;
    }>(
      `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, name, status, created_at, updated_at`,
      params
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Tenant not found' });
    }

    // If status changed to inactive, invalidate cache and evict provider
    if (status === 'inactive') {
      await invalidateAllKeysForTenant(id, pool);
      evictProvider(id);
    }

    return reply.send(result.rows[0]);
  });

  // DELETE /v1/admin/tenants/:id — Hard delete tenant
  fastify.delete<{ Params: { id: string }; Querystring: { confirm?: string } }>(
    '/v1/admin/tenants/:id',
    authOpts,
    async (request, reply) => {
      const { id } = request.params;
      const { confirm } = request.query;

      if (confirm !== 'true') {
        return reply.code(400).send({ error: 'Must include ?confirm=true to delete tenant' });
      }

      // Invalidate cache and evict provider before deletion
      await invalidateAllKeysForTenant(id, pool);
      evictProvider(id);

      const result = await pool.query('DELETE FROM tenants WHERE id = $1 RETURNING id', [id]);

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Tenant not found' });
      }

      return reply.code(204).send();
    }
  );

  // PUT /v1/admin/tenants/:id/provider-config — Set/replace provider config
  fastify.put<{
    Params: { id: string };
    Body: {
      provider: string;
      apiKey?: string;
      baseUrl?: string;
      deployment?: string;
      apiVersion?: string;
    };
  }>('/v1/admin/tenants/:id/provider-config', authOpts, async (request, reply) => {
    const { id } = request.params;
    const { provider, apiKey, baseUrl, deployment, apiVersion } = request.body;

    if (!provider || (provider !== 'openai' && provider !== 'azure')) {
      return reply.code(400).send({ error: 'Provider must be "openai" or "azure"' });
    }

    // Verify tenant exists
    const tenantCheck = await pool.query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'Tenant not found' });
    }

    // Build provider config object
    const providerConfig: any = { provider };

    if (baseUrl) providerConfig.baseUrl = baseUrl;
    if (deployment) providerConfig.deployment = deployment;
    if (apiVersion) providerConfig.apiVersion = apiVersion;

    // Encrypt API key if provided
    if (apiKey) {
      try {
        const encrypted = encryptTraceBody(id, apiKey);
        providerConfig.apiKey = `encrypted:${encrypted.ciphertext}:${encrypted.iv}`;
      } catch (err) {
        fastify.log.error({ err }, 'Failed to encrypt provider API key');
        return reply.code(500).send({ error: 'Failed to encrypt API key' });
      }
    }

    await pool.query('UPDATE tenants SET provider_config = $1, updated_at = now() WHERE id = $2', [
      JSON.stringify(providerConfig),
      id,
    ]);

    // Evict provider cache
    evictProvider(id);

    // Return sanitized response
    return reply.send({
      providerConfig: {
        provider,
        baseUrl,
        deployment,
        apiVersion,
        hasApiKey: !!apiKey,
      },
    });
  });

  // DELETE /v1/admin/tenants/:id/provider-config — Remove provider config
  fastify.delete<{ Params: { id: string } }>(
    '/v1/admin/tenants/:id/provider-config',
    authOpts,
    async (request, reply) => {
      const { id } = request.params;

      const result = await pool.query(
        'UPDATE tenants SET provider_config = NULL, updated_at = now() WHERE id = $1 RETURNING id',
        [id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Tenant not found' });
      }

      evictProvider(id);

      return reply.code(204).send();
    }
  );

  // POST /v1/admin/tenants/:id/api-keys — Create API key
  fastify.post<{ Params: { id: string }; Body: { name: string } }>(
    '/v1/admin/tenants/:id/api-keys',
    authOpts,
    async (request, reply) => {
      const { id } = request.params;
      const { name } = request.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return reply.code(400).send({ error: 'API key name is required' });
      }

      // Verify tenant exists
      const tenantCheck = await pool.query('SELECT id FROM tenants WHERE id = $1', [id]);
      if (tenantCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'Tenant not found' });
      }

      // Generate raw key
      const rawKey = 'loom_sk_' + randomBytes(24).toString('base64url');
      const keyPrefix = rawKey.slice(0, 12);
      const keyHash = createHash('sha256').update(rawKey).digest('hex');

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
        [id, name.trim(), keyPrefix, keyHash]
      );

      return reply.code(201).send({
        id: result.rows[0].id,
        name: result.rows[0].name,
        key: rawKey,
        keyPrefix: result.rows[0].key_prefix,
        status: result.rows[0].status,
        createdAt: result.rows[0].created_at,
      });
    }
  );

  // GET /v1/admin/tenants/:id/api-keys — List API keys
  fastify.get<{ Params: { id: string } }>(
    '/v1/admin/tenants/:id/api-keys',
    authOpts,
    async (request, reply) => {
      const { id } = request.params;

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
        [id]
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
    }
  );

  // DELETE /v1/admin/tenants/:id/api-keys/:keyId — Revoke or hard delete API key
  fastify.delete<{
    Params: { id: string; keyId: string };
    Querystring: { permanent?: string };
  }>('/v1/admin/tenants/:id/api-keys/:keyId', authOpts, async (request, reply) => {
    const { id, keyId } = request.params;
    const { permanent } = request.query;

    if (permanent === 'true') {
      // Hard delete
      // First get the key_hash for cache invalidation
      const hashResult = await pool.query<{ key_hash: string }>(
        'SELECT key_hash FROM api_keys WHERE id = $1 AND tenant_id = $2',
        [keyId, id]
      );

      if (hashResult.rows.length === 0) {
        return reply.code(404).send({ error: 'API key not found' });
      }

      // Invalidate cache
      invalidateCachedKey(hashResult.rows[0].key_hash);

      // Delete
      await pool.query('DELETE FROM api_keys WHERE id = $1 AND tenant_id = $2', [keyId, id]);
    } else {
      // Soft revoke
      // Get the key_hash and update status
      const result = await pool.query<{ key_hash: string }>(
        `UPDATE api_keys
         SET status = 'revoked', revoked_at = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING key_hash`,
        [keyId, id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'API key not found' });
      }

      // Invalidate cache
      invalidateCachedKey(result.rows[0].key_hash);
    }

    return reply.code(204).send();
  });
}
