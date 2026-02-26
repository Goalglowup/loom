import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createVerifier } from 'fast-jwt';

declare module 'fastify' {
  interface FastifyRequest {
    portalUser?: { userId: string; tenantId: string; role: string };
  }
}

const PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'unsafe-portal-secret-change-in-production';
const verifyPortalToken = createVerifier({ key: async () => PORTAL_JWT_SECRET });

/**
 * Returns a Fastify preHandler that verifies the portal JWT and attaches
 * the decoded payload to request.portalUser.
 */
export function registerPortalAuthMiddleware(
  _fastify: FastifyInstance,
  requiredRole?: 'owner' | 'member'
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function portalAuthPreHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
    }
    const token = authHeader.slice(7);
    try {
      const decoded = await verifyPortalToken(token) as { sub: string; tenantId: string; role: string };
      request.portalUser = { userId: decoded.sub, tenantId: decoded.tenantId, role: decoded.role };
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired portal token' });
    }
    if (requiredRole && request.portalUser!.role !== requiredRole) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
  };
}
