import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt } from '../auth/jwtUtils.js';

export function createBearerAuth<T extends object>(
  secret: string,
  extractClaims: (payload: T, request: FastifyRequest) => void
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      const token = authHeader.slice(7);
      const payload = verifyJwt<T>(token, secret);
      extractClaims(payload, request);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  };
}
