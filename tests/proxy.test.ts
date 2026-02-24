/**
 * H2: Proxy Correctness Tests (issue #12)
 *
 * Validates that the OpenAI provider proxies correctly:
 * - Request transformation (auth headers, content-type, host header removal)
 * - Response passthrough (status codes, body structure)
 * - Non-streaming (full JSON) and streaming (SSE) paths
 * - Error handling from upstream (4xx, 5xx)
 *
 * These tests run against the OpenAIProvider directly (the proxy mechanism)
 * using a local mock HTTP server — no real OpenAI credentials needed.
 *
 * // TODO: verify against Fenster's implementation once gateway-level proxy
 * //        (F6) lands and supports OPENAI_BASE_URL override for integration tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { OpenAIProvider } from '../src/providers/openai.js';
import { MockOpenAIServer } from './mocks/mock-openai-server.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Collect all SSE chunks from a Node.js Readable (undici response.body) or any
 * async iterable. Uses async iteration — compatible with Node streams and Web streams
 * that implement Symbol.asyncIterator.
 */
async function collectSSEChunks(stream: AsyncIterable<any>): Promise<{ chunks: any[]; content: string }> {
  const decoder = new TextDecoder();
  const chunks: any[] = [];
  let content = '';
  let buffer = '';

  for await (const value of stream) {
    buffer += typeof value === 'string' ? value : decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        chunks.push(parsed);
        if (parsed.choices?.[0]?.delta?.content) {
          content += parsed.choices[0].delta.content;
        }
      } catch {
        // skip malformed lines
      }
    }
  }
  return { chunks, content };
}

/** Minimal upstream that returns configurable error responses. */
function createErrorServer(port: number): FastifyInstance {
  const server = Fastify({ logger: false });

  server.post('/v1/chat/completions', async (req, reply) => {
    const body = req.body as any;
    const status: number = body?._testStatus ?? 500;
    return reply.code(status).send({
      error: { message: `Mock error ${status}`, type: 'mock_error', code: null }
    });
  });

  return server;
}

// ── test suites ───────────────────────────────────────────────────────────────

describe('proxy — non-streaming (OpenAIProvider → mock server)', () => {
  let mockServer: MockOpenAIServer;
  let baseURL: string;

  beforeAll(async () => {
    mockServer = new MockOpenAIServer({ port: 3011 });
    baseURL = await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('should proxy a basic non-streaming request and return OpenAI-shaped body', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: baseURL });

    const response = await provider.proxy({
      url: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }] },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 'chatcmpl-mock-123',
      object: 'chat.completion',
      model: 'gpt-4',
      choices: expect.arrayContaining([
        expect.objectContaining({
          index: 0,
          message: { role: 'assistant', content: 'Hello from mock OpenAI!' },
          finish_reason: 'stop',
        }),
      ]),
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
  });

  it('should set Authorization header to Bearer <apiKey> on upstream request', async () => {
    // Validate by standing up a capture server that records incoming headers.
    const captureServer = Fastify({ logger: false });
    let receivedAuthHeader: string | undefined;

    captureServer.post('/v1/chat/completions', async (req, reply) => {
      receivedAuthHeader = (req.headers['authorization'] as string) ?? undefined;
      return reply.send({
        id: 'chatcmpl-x',
        object: 'chat.completion',
        created: 0,
        model: 'gpt-4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    });

    await captureServer.listen({ port: 3012, host: '127.0.0.1' });
    const captureBase = 'http://127.0.0.1:3012';

    try {
      const provider = new OpenAIProvider({ apiKey: 'my-secret-key', baseUrl: captureBase });
      await provider.proxy({
        url: '/v1/chat/completions',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }] },
      });

      expect(receivedAuthHeader).toBe('Bearer my-secret-key');
    } finally {
      await captureServer.close();
    }
  });

  it('should set Content-Type: application/json on upstream request', async () => {
    const captureServer = Fastify({ logger: false });
    let receivedContentType: string | undefined;

    captureServer.post('/v1/chat/completions', async (req, reply) => {
      receivedContentType = (req.headers['content-type'] as string) ?? undefined;
      return reply.send({
        id: 'chatcmpl-x', object: 'chat.completion', created: 0, model: 'gpt-4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    });

    await captureServer.listen({ port: 3013, host: '127.0.0.1' });

    try {
      const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: 'http://127.0.0.1:3013' });
      await provider.proxy({
        url: '/v1/chat/completions',
        method: 'POST',
        headers: {},
        body: { model: 'gpt-4', messages: [] },
      });

      expect(receivedContentType).toContain('application/json');
    } finally {
      await captureServer.close();
    }
  });

  it('should strip the host header before forwarding to upstream', async () => {
    const captureServer = Fastify({ logger: false });
    let receivedHost: string | undefined;

    captureServer.post('/v1/chat/completions', async (req, reply) => {
      receivedHost = (req.headers['host'] as string) ?? undefined;
      return reply.send({
        id: 'chatcmpl-x', object: 'chat.completion', created: 0, model: 'gpt-4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    });

    await captureServer.listen({ port: 3014, host: '127.0.0.1' });

    try {
      const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: 'http://127.0.0.1:3014' });
      await provider.proxy({
        url: '/v1/chat/completions',
        method: 'POST',
        // Simulate a downstream request that carries the client-facing host header
        headers: { 'host': 'loom.example.com', 'content-type': 'application/json' },
        body: { model: 'gpt-4', messages: [] },
      });

      // Host should be rewritten to upstream server host, not the client-facing value
      expect(receivedHost).not.toBe('loom.example.com');
    } finally {
      await captureServer.close();
    }
  });

  it('should passthrough upstream 4xx status codes', async () => {
    const errorServer = createErrorServer(3015);
    await errorServer.listen({ port: 3015, host: '127.0.0.1' });

    try {
      const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: 'http://127.0.0.1:3015' });
      const response = await provider.proxy({
        url: '/v1/chat/completions',
        method: 'POST',
        headers: {},
        body: { model: 'gpt-4', messages: [], _testStatus: 401 },
      });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: { type: 'mock_error' } });
    } finally {
      await errorServer.close();
    }
  });

  it('should passthrough upstream 5xx status codes', async () => {
    const errorServer = createErrorServer(3016);
    await errorServer.listen({ port: 3016, host: '127.0.0.1' });

    try {
      const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: 'http://127.0.0.1:3016' });
      const response = await provider.proxy({
        url: '/v1/chat/completions',
        method: 'POST',
        headers: {},
        body: { model: 'gpt-4', messages: [], _testStatus: 500 },
      });

      expect(response.status).toBe(500);
    } finally {
      await errorServer.close();
    }
  });

  it('should passthrough upstream 429 rate-limit responses', async () => {
    const rateLimitServer = Fastify({ logger: false });
    rateLimitServer.post('/v1/chat/completions', async (_req, reply) => {
      return reply.code(429).send({
        error: { message: 'Rate limit exceeded', type: 'requests', param: null, code: 'rate_limit_exceeded' }
      });
    });
    await rateLimitServer.listen({ port: 3017, host: '127.0.0.1' });

    try {
      const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: 'http://127.0.0.1:3017' });
      const response = await provider.proxy({
        url: '/v1/chat/completions',
        method: 'POST',
        headers: {},
        body: { model: 'gpt-4', messages: [] },
      });

      expect(response.status).toBe(429);
    } finally {
      await rateLimitServer.close();
    }
  });
});

describe('proxy — streaming (SSE) path', () => {
  let mockServer: MockOpenAIServer;
  let baseURL: string;

  beforeAll(async () => {
    mockServer = new MockOpenAIServer({ port: 3018 });
    baseURL = await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('should return a stream when upstream sends text/event-stream', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: baseURL });

    const response = await provider.proxy({
      url: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { model: 'gpt-4', messages: [{ role: 'user', content: 'Hi' }], stream: true },
    });

    expect(response.status).toBe(200);
    expect(response.stream).toBeDefined();
    expect(response.body).toBeNull();
  });

  it('should stream valid SSE chunks with proper data: prefix format', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: baseURL });

    const response = await provider.proxy({
      url: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { model: 'gpt-4', messages: [{ role: 'user', content: 'Hi' }], stream: true },
    });

    const { chunks, content } = await collectSSEChunks(response.stream as AsyncIterable<any>);

    expect(chunks.length).toBeGreaterThan(0);
    expect(content).toBe('Hello from mock OpenAI!');
  });

  it('should end stream with a chunk having finish_reason: stop', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: baseURL });

    const response = await provider.proxy({
      url: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { model: 'gpt-4', messages: [{ role: 'user', content: 'Hi' }], stream: true },
    });

    const { chunks } = await collectSSEChunks(response.stream as AsyncIterable<any>);

    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.choices[0].finish_reason).toBe('stop');
  });

  it('each SSE chunk should have the expected shape (id, object, model, choices)', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: baseURL });

    const response = await provider.proxy({
      url: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { model: 'gpt-4', messages: [{ role: 'user', content: 'Hi' }], stream: true },
    });

    const { chunks } = await collectSSEChunks(response.stream as AsyncIterable<any>);

    for (const chunk of chunks) {
      expect(chunk).toHaveProperty('id');
      expect(chunk.object).toBe('chat.completion.chunk');
      expect(chunk).toHaveProperty('model');
      expect(Array.isArray(chunk.choices)).toBe(true);
    }
  });
});
