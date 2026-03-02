import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt } from '../auth/jwtUtils.js';

/**
 * Factory that returns a Fastify preHandler for checking a specific registry scope.
 * Usage: fastify.addHook('preHandler', registryAuth('weave:write', secret))
 */
export function registryAuth(requiredScope: string, secret: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing authorization header' });
    }

    const token = authHeader.slice(7);
    try {
      const payload = verifyJwt<{ scopes?: string[]; [key: string]: unknown }>(token, secret);
      const scopes: string[] = payload.scopes ?? [];

      if (!scopes.includes(requiredScope)) {
        return reply.code(403).send({
          error: 'Insufficient permissions',
          required: requiredScope,
        });
      }

      // Attach decoded payload to request for downstream use
      (request as any).registryUser = payload;
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }
  };
}
