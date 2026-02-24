import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import pg from 'pg';
import { ProxyRequest } from './types/openai.js';
import { registerAuthMiddleware } from './auth.js';
import { createSSEProxy } from './streaming.js';
import { getProviderForTenant } from './providers/registry.js';
import { registerDashboardRoutes } from './routes/dashboard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fastify = Fastify({
  logger: true
});

// Database pool — used by auth middleware and (future) trace persistence
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://loom:loom_dev_password@localhost:5432/loom',
});

registerAuthMiddleware(fastify, pool);

// Allow requests from file:// origins and any localhost port (dev chat app, dashboard)
fastify.register(fastifyCors, { origin: true });

// Serve dashboard at /dashboard
fastify.register(fastifyStatic, {
  root: join(__dirname, '../dashboard/dist'),
  prefix: '/dashboard',
  wildcard: false
});

// SPA fallback for React Router
fastify.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/dashboard')) {
    const indexHtml = readFileSync(join(__dirname, '../dashboard/dist/index.html'), 'utf-8');
    reply.type('text/html').send(indexHtml);
  } else {
    reply.code(404).send({ error: 'Not Found' });
  }
});

fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

// Register dashboard API routes (/v1/traces, /v1/analytics/*)
fastify.register(registerDashboardRoutes);

fastify.post('/v1/chat/completions', async (request, reply) => {
  const tenant = request.tenant;
  if (!tenant && !process.env.OPENAI_API_KEY) {
    return reply.code(500).send({
      error: {
        message: 'OPENAI_API_KEY not configured',
        type: 'server_error'
      }
    });
  }

  const provider = tenant
    ? getProviderForTenant(tenant)
    : (() => { throw new Error('No tenant context'); })();

  const proxyReq: ProxyRequest = {
    url: '/v1/chat/completions',
    method: 'POST',
    headers: request.headers as Record<string, string>,
    body: request.body,
  };

  const startTimeMs = Date.now();

  try {
    const response = await provider.proxy(proxyReq);

    // Set response headers
    for (const [key, value] of Object.entries(response.headers)) {
      reply.header(key, value);
    }

    // Handle streaming response — pipe through SSE proxy for trace capture
    if (response.stream) {
      const tenant = request.tenant;
      const reqBody = request.body as any;
      const sseProxy = createSSEProxy({
        onComplete: () => {},
        traceContext: tenant
          ? {
              tenantId: tenant.tenantId,
              requestBody: reqBody,
              model: reqBody?.model ?? 'unknown',
              provider: provider.name,
              statusCode: response.status,
              startTimeMs,
            }
          : undefined,
      });
      reply.code(response.status);
      return reply.send((response.stream as unknown as NodeJS.ReadableStream).pipe(sseProxy));
    }

    // Handle regular JSON response
    return reply.code(response.status).send(response.body);
  } catch (err: any) {
    fastify.log.error(err);
    return reply.code(500).send({
      error: {
        message: err.message || 'Internal server error',
        type: 'server_error'
      }
    });
  }
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    console.log(`Server listening on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
