import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createBearerAuth } from './createBearerAuth.js';

declare module 'fastify' {
  interface FastifyRequest {
    portalUser?: { userId: string; tenantId: string; role: string };
  }
}

const PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'unsafe-portal-secret-change-in-production';

type PortalTokenPayload = { sub: string; tenantId: string; role: string };

/**
 * Returns a Fastify preHandler that verifies the portal JWT and attaches
 * the decoded payload to request.portalUser.
 */
export function registerPortalAuthMiddleware(
  _fastify: FastifyInstance,
  requiredRole?: 'owner' | 'member'
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const verifyAndExtract = createBearerAuth<PortalTokenPayload>(
    PORTAL_JWT_SECRET,
    (payload: PortalTokenPayload, request: FastifyRequest) => {
      request.portalUser = { userId: payload.sub, tenantId: payload.tenantId, role: payload.role };
    }
  );

  return async function portalAuthPreHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    await verifyAndExtract(request, reply);
    if (reply.sent) return;
    if (requiredRole && request.portalUser!.role !== requiredRole) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
  };
}
