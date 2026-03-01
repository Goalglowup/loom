import { FastifyRequest, FastifyReply } from 'fastify';
import { createBearerAuth } from './createBearerAuth.js';

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

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET ?? 'unsafe-dev-secret-change-in-production';

export const adminAuthMiddleware = createBearerAuth<AdminUser>(
  ADMIN_JWT_SECRET,
  (payload: AdminUser, request: FastifyRequest) => {
    request.adminUser = { sub: payload.sub, username: payload.username };
  }
);
