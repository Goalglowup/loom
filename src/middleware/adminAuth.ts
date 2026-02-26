import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Admin authentication middleware for Fastify
 * Verifies JWT tokens issued by POST /v1/admin/auth/login
 */

export interface AdminUser {
  sub: string;
  username: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    adminUser?: AdminUser;
  }
}

// Warn if ADMIN_JWT_SECRET is missing (similar to ENCRYPTION_MASTER_KEY check)
if (!process.env.ADMIN_JWT_SECRET) {
  console.warn('⚠️  WARNING: ADMIN_JWT_SECRET is not set. Admin authentication will fail. Set this env var in .env before starting the gateway.');
}

export async function adminAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({
      error: 'Missing or invalid Authorization header. Expected: Bearer <token>'
    });
  }

  const token = authHeader.slice(7).trim();

  try {
    // Verify JWT using Fastify's JWT plugin
    const decoded = await request.jwtVerify();
    request.adminUser = decoded as AdminUser;
  } catch (err) {
    return reply.code(401).send({
      error: 'Invalid or expired token'
    });
  }
}
