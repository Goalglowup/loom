import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    portalUser?: { userId: string; tenantId: string; role: string };
  }
}

/**
 * Register the portal JWT plugin on a Fastify instance.
 * Must be called before route registration so portalJwtVerify is available.
 */
export async function registerPortalJwt(fastify: FastifyInstance): Promise<void> {
  const fastifyJWT = (await import('@fastify/jwt')).default;
  await fastify.register(fastifyJWT, {
    secret: process.env.PORTAL_JWT_SECRET || 'unsafe-portal-secret-change-in-production',
    namespace: 'portal',
    decoratorName: 'portalJwt',
  });
}

/**
 * Returns a Fastify preHandler that verifies the portal JWT and attaches
 * the decoded payload to request.portalUser.
 *
 * @param requiredRole - If provided, the handler also enforces the role.
 */
export function registerPortalAuthMiddleware(
  fastify: FastifyInstance,
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

    try {
      const decoded = await (request as any).portalJwtVerify() as {
        sub: string;
        tenantId: string;
        role: string;
      };
      request.portalUser = {
        userId: decoded.sub,
        tenantId: decoded.tenantId,
        role: decoded.role,
      };
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired portal token' });
    }

    if (requiredRole && request.portalUser!.role !== requiredRole) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
  };
}
