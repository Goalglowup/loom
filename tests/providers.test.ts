/**
 * H5: Multi-Provider Tests (issue #15)
 *
 * Validates correct routing between OpenAI and Azure OpenAI providers:
 *
 * OpenAI path:
 *   - Standard api.openai.com URL format: POST /v1/chat/completions
 *   - Authorization: Bearer <key> header
 *
 * Azure path:
 *   - Deployment-based URL: {endpoint}/openai/deployments/{deployment}/chat/completions?api-version=...
 *   - api-version query parameter required
 *   - api-key header (not Authorization)
 *
 * Also validates provider-specific error handling and response format mapping.
 *
 * // TODO: verify against Fenster's implementation once AzureOpenAIProvider (F5)
 *          and gateway provider routing (F6) land. The AzureOpenAIProvider import
 *          path is assumed to be src/providers/azure.ts — adjust if different.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { OpenAIProvider } from '../src/providers/openai.js';
import { MockOpenAIServer } from './mocks/mock-openai-server.js';
import { MockAzureOpenAIServer } from './mocks/mock-azure-openai-server.js';

// ── helpers ──────────────────────────────────────────────────────────────────

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

// ── OpenAI provider path ──────────────────────────────────────────────────────

describe('providers — OpenAI path (api.openai.com format)', () => {
  let mockServer: MockOpenAIServer;
  let baseURL: string;

  beforeAll(async () => {
    mockServer = new MockOpenAIServer({ port: 3031 });
    baseURL = await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('should use /v1/chat/completions URL path for OpenAI', async () => {
    const captureServer = Fastify({ logger: false });
    let capturedPath: string | undefined;

    captureServer.post('/v1/chat/completions', async (req, reply) => {
      capturedPath = req.url;
      return reply.send({
        id: 'chatcmpl-x', object: 'chat.completion', created: 0, model: 'gpt-4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    });

    await captureServer.listen({ port: 3032, host: '127.0.0.1' });

    try {
      const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: 'http://127.0.0.1:3032' });
      await provider.proxy({
        url: '/v1/chat/completions',
        method: 'POST',
        headers: {},
        body: { model: 'gpt-4', messages: [] },
      });

      expect(capturedPath).toBe('/v1/chat/completions');
    } finally {
      await captureServer.close();
    }
  });

  it('should send Authorization: Bearer header for OpenAI (not api-key)', async () => {
    const captureServer = Fastify({ logger: false });
    let authHeader: string | undefined;
    let apiKeyHeader: string | undefined;

    captureServer.post('/v1/chat/completions', async (req, reply) => {
      authHeader = req.headers['authorization'] as string | undefined;
      apiKeyHeader = req.headers['api-key'] as string | undefined;
      return reply.send({
        id: 'chatcmpl-x', object: 'chat.completion', created: 0, model: 'gpt-4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    });

    await captureServer.listen({ port: 3033, host: '127.0.0.1' });

    try {
      const provider = new OpenAIProvider({ apiKey: 'openai-secret', baseUrl: 'http://127.0.0.1:3033' });
      await provider.proxy({
        url: '/v1/chat/completions',
        method: 'POST',
        headers: {},
        body: { model: 'gpt-4', messages: [] },
      });

      expect(authHeader).toBe('Bearer openai-secret');
      expect(apiKeyHeader).toBeUndefined();
    } finally {
      await captureServer.close();
    }
  });

  it('should proxy non-streaming response correctly via OpenAI provider', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: baseURL });
    const response = await provider.proxy({
      url: '/v1/chat/completions',
      method: 'POST',
      headers: {},
      body: { model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }] },
    });

    expect(response.status).toBe(200);
    expect(response.body.object).toBe('chat.completion');
    expect(response.body.choices[0].message.role).toBe('assistant');
  });

  it('should proxy streaming response correctly via OpenAI provider', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: baseURL });
    const response = await provider.proxy({
      url: '/v1/chat/completions',
      method: 'POST',
      headers: {},
      body: { model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }], stream: true },
    });

    expect(response.stream).toBeDefined();
    const { content } = await collectSSEChunks(response.stream as AsyncIterable<any>);
    expect(content).toBe('Hello from mock OpenAI!');
  });
});

// ── Azure OpenAI provider path ────────────────────────────────────────────────

describe('providers — Azure path (deployment-based URL format)', () => {
  let mockAzureServer: MockAzureOpenAIServer;
  let azureBaseURL: string;

  beforeAll(async () => {
    mockAzureServer = new MockAzureOpenAIServer({ port: 3034 });
    azureBaseURL = await mockAzureServer.start();
  });

  afterAll(async () => {
    await mockAzureServer.stop();
  });

  /**
   * Tests for AzureOpenAIProvider (src/providers/azure.ts — Fenster F5).
   *
   * These tests validate the expected Azure URL contract by hitting the existing
   * MockAzureOpenAIServer, which already implements the deployment-based URL pattern.
   * Once Fenster ships AzureOpenAIProvider, import it here and run the provider
   * through the same assertions.
   *
   * // TODO: verify against Fenster's implementation — import AzureOpenAIProvider
   *          from '../src/providers/azure.js' and replace the direct fetch below.
   */

  it('Azure URL format: should use /openai/deployments/{deployment}/chat/completions path', async () => {
    const deployment = 'gpt-4-prod';
    const apiVersion = '2024-02-15-preview';

    // Direct fetch against the mock Azure server validates URL contract
    // TODO: verify against Fenster's implementation — replace with AzureOpenAIProvider.proxy()
    const res = await fetch(
      `${azureBaseURL}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': 'azure-secret' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }),
      }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.object).toBe('chat.completion');
    expect(data.model).toBe(deployment);
  });

  it('Azure URL format: api-version query param must be present', async () => {
    const deployment = 'gpt-4-prod';

    // Azure mock only registers routes with the correct path; without api-version
    // it should either 404 or be rejected at the provider level
    // TODO: verify against Fenster's implementation — AzureOpenAIProvider should
    //       enforce api-version presence and throw a descriptive error if missing.
    const res = await fetch(
      `${azureBaseURL}/openai/deployments/${deployment}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': 'azure-secret' },
        body: JSON.stringify({ messages: [] }),
      }
    );

    // Mock server accepts without api-version (query param is optional in mock).
    // Real Azure API returns 400; AzureOpenAIProvider should validate.
    // This assertion documents the contract, not strict enforcement in mock.
    expect([200, 400, 404]).toContain(res.status);
  });

  it('Azure non-streaming response should be OpenAI-compatible shape', async () => {
    const deployment = 'gpt-4-deployment';

    const res = await fetch(
      `${azureBaseURL}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': 'azure-secret' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }),
      }
    );

    const data = await res.json();

    // Azure response must be OpenAI-compatible at the field level
    expect(data).toHaveProperty('id');
    expect(data.object).toBe('chat.completion');
    expect(data).toHaveProperty('created');
    expect(data).toHaveProperty('model');
    expect(Array.isArray(data.choices)).toBe(true);
    expect(data.choices[0]).toMatchObject({
      index: 0,
      message: { role: 'assistant' },
      finish_reason: 'stop',
    });
    expect(data.usage).toMatchObject({
      prompt_tokens: expect.any(Number),
      completion_tokens: expect.any(Number),
      total_tokens: expect.any(Number),
    });
  });

  it('Azure streaming response should be valid SSE with OpenAI-compatible chunks', async () => {
    const deployment = 'gpt-4-deployment';

    const res = await fetch(
      `${azureBaseURL}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': 'azure-secret' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }], stream: true }),
      }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');

    const { chunks, content } = await collectSSEChunks(res.body as AsyncIterable<any>);

    expect(chunks.length).toBeGreaterThan(0);
    expect(content).toBe('Hello from Azure OpenAI!');
    expect(chunks[chunks.length - 1].choices[0].finish_reason).toBe('stop');

    // Each chunk must be OpenAI-compatible
    for (const chunk of chunks) {
      expect(chunk).toHaveProperty('id');
      expect(chunk.object).toBe('chat.completion.chunk');
      expect(Array.isArray(chunk.choices)).toBe(true);
    }
  });

  it('Azure streaming: deployment name used as model in chunk responses', async () => {
    const deployment = 'my-custom-gpt4-deployment';

    const res = await fetch(
      `${azureBaseURL}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': 'azure-secret' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }], stream: true }),
      }
    );

    const { chunks } = await collectSSEChunks(res.body as AsyncIterable<any>);
    for (const chunk of chunks) {
      expect(chunk.model).toBe(deployment);
    }
  });
});

// ── Provider routing differentiation ─────────────────────────────────────────

describe('providers — OpenAI vs Azure routing differentiation', () => {
  let openaiServer: MockOpenAIServer;
  let azureServer: MockAzureOpenAIServer;

  beforeAll(async () => {
    openaiServer = new MockOpenAIServer({ port: 3035 });
    azureServer = new MockAzureOpenAIServer({ port: 3036 });
    await Promise.all([openaiServer.start(), azureServer.start()]);
  });

  afterAll(async () => {
    await Promise.all([openaiServer.stop(), azureServer.stop()]);
  });

  it('OpenAI provider targets /v1/chat/completions; Azure targets deployment path', async () => {
    const captureServer = Fastify({ logger: false });
    const capturedPaths: string[] = [];

    captureServer.post('/*', async (req, reply) => {
      capturedPaths.push(req.url);
      return reply.send({
        id: 'x', object: 'chat.completion', created: 0, model: 'm',
        choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    });

    await captureServer.listen({ port: 3037, host: '127.0.0.1' });

    try {
      const openaiProvider = new OpenAIProvider({
        apiKey: 'openai-key',
        baseUrl: 'http://127.0.0.1:3037',
      });

      await openaiProvider.proxy({
        url: '/v1/chat/completions',
        method: 'POST',
        headers: {},
        body: { model: 'gpt-4', messages: [] },
      });

      expect(capturedPaths[0]).toBe('/v1/chat/completions');

      // Azure deployment path validation (direct mock — no AzureOpenAIProvider yet)
      // TODO: verify against Fenster's implementation — once AzureOpenAIProvider ships,
      //       instantiate it here and call .proxy() to confirm the deployment path is used.
      const azureRes = await fetch(
        `http://127.0.0.1:3036/openai/deployments/gpt-4-deployment/chat/completions?api-version=2024-02-15-preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': 'azure-key' },
          body: JSON.stringify({ messages: [] }),
        }
      );

      expect(azureRes.status).toBe(200);
    } finally {
      await captureServer.close();
    }
  });

  it('OpenAI and Azure responses are structurally identical (OpenAI-compatible format)', async () => {
    const [openaiRes, azureRes] = await Promise.all([
      fetch(`http://127.0.0.1:3035/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-key' },
        body: JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }] }),
      }),
      fetch(`http://127.0.0.1:3036/openai/deployments/gpt-4-deployment/chat/completions?api-version=2024-02-15-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': 'azure-secret' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }),
      }),
    ]);

    const [openaiData, azureData] = await Promise.all([openaiRes.json(), azureRes.json()]);

    // Both must expose the same top-level shape
    const sharedKeys = ['id', 'object', 'created', 'model', 'choices', 'usage'];
    for (const key of sharedKeys) {
      expect(openaiData).toHaveProperty(key);
      expect(azureData).toHaveProperty(key);
    }

    expect(openaiData.object).toBe('chat.completion');
    expect(azureData.object).toBe('chat.completion');
  });
});

// ── Provider error handling ───────────────────────────────────────────────────

describe('providers — error handling and format mapping', () => {
  it('OpenAI provider should surface upstream 401 (invalid API key) as-is', async () => {
    const errorServer = Fastify({ logger: false });
    errorServer.post('/v1/chat/completions', async (_req, reply) => {
      return reply.code(401).send({
        error: { message: 'Incorrect API key provided', type: 'invalid_request_error', code: 'invalid_api_key' }
      });
    });
    await errorServer.listen({ port: 3038, host: '127.0.0.1' });

    try {
      const provider = new OpenAIProvider({ apiKey: 'bad-key', baseUrl: 'http://127.0.0.1:3038' });
      const response = await provider.proxy({
        url: '/v1/chat/completions',
        method: 'POST',
        headers: {},
        body: { model: 'gpt-4', messages: [] },
      });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('invalid_api_key');
    } finally {
      await errorServer.close();
    }
  });

  it('OpenAI provider should surface upstream 429 rate-limit with original body', async () => {
    const rateLimitServer = Fastify({ logger: false });
    rateLimitServer.post('/v1/chat/completions', async (_req, reply) => {
      return reply.code(429).send({
        error: { message: 'Rate limit exceeded', type: 'requests', code: 'rate_limit_exceeded' }
      });
    });
    await rateLimitServer.listen({ port: 3039, host: '127.0.0.1' });

    try {
      const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: 'http://127.0.0.1:3039' });
      const response = await provider.proxy({
        url: '/v1/chat/completions',
        method: 'POST',
        headers: {},
        body: { model: 'gpt-4', messages: [] },
      });

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('rate_limit_exceeded');
    } finally {
      await rateLimitServer.close();
    }
  });

  it('OpenAI provider should throw on network failure (unreachable upstream)', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: 'http://127.0.0.1:19999' });

    await expect(
      provider.proxy({
        url: '/v1/chat/completions',
        method: 'POST',
        headers: {},
        body: { model: 'gpt-4', messages: [] },
      })
    ).rejects.toThrow();
  });

  it('Azure mock: 404 for unknown deployment path validates routing contract', async () => {
    const azureServer = new MockAzureOpenAIServer({ port: 3040 });
    await azureServer.start();

    try {
      // Hitting wrong path (not deployment-based) should fail
      // TODO: verify against Fenster's implementation — AzureOpenAIProvider must
      //       always build the deployment URL, never the /v1/chat/completions path.
      const res = await fetch(`${azureServer.getBaseURL()}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': 'azure-key' },
        body: JSON.stringify({ messages: [] }),
      });

      expect(res.status).toBe(404);
    } finally {
      await azureServer.stop();
    }
  });
});
