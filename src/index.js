import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { OpenAIProvider } from './providers/openai.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fastify = Fastify({
    logger: true
});
// Serve dashboard at /dashboard
fastify.register(fastifyStatic, {
    root: join(__dirname, '../dashboard/dist'),
    prefix: '/dashboard/',
    decorateReply: false
});
// Fallback route for React Router
fastify.get('/dashboard/*', async (request, reply) => {
    return reply.sendFile('index.html');
});
fastify.get('/health', async (request, reply) => {
    return { status: 'ok' };
});
fastify.post('/v1/chat/completions', async (request, reply) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return reply.code(500).send({
            error: {
                message: 'OPENAI_API_KEY not configured',
                type: 'server_error'
            }
        });
    }
    const provider = new OpenAIProvider({ apiKey });
    const proxyReq = {
        url: '/v1/chat/completions',
        method: 'POST',
        headers: request.headers,
        body: request.body,
    };
    try {
        const response = await provider.proxy(proxyReq);
        // Set response headers
        for (const [key, value] of Object.entries(response.headers)) {
            reply.header(key, value);
        }
        // Handle streaming response
        if (response.stream) {
            reply.code(response.status);
            return reply.send(response.stream);
        }
        // Handle regular JSON response
        return reply.code(response.status).send(response.body);
    }
    catch (err) {
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
    }
    catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};
start();
