import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockOpenAIServer } from '../mocks/mock-openai-server';

describe('Mock OpenAI Server', () => {
  let server: MockOpenAIServer;
  let baseURL: string;

  beforeAll(async () => {
    server = new MockOpenAIServer({ port: 3001 });
    baseURL = await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should respond to health check', async () => {
    const response = await fetch(`${baseURL}/health`);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.provider).toBe('mock-openai');
  });

  it('should handle non-streaming chat completion', async () => {
    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }]
      })
    });

    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.id).toBe('chatcmpl-mock-123');
    expect(data.object).toBe('chat.completion');
    expect(data.model).toBe('gpt-4');
    expect(data.choices).toHaveLength(1);
    expect(data.choices[0].message.role).toBe('assistant');
    expect(data.choices[0].message.content).toBe('Hello from mock OpenAI!');
    expect(data.usage.prompt_tokens).toBe(10);
    expect(data.usage.completion_tokens).toBe(5);
    expect(data.usage.total_tokens).toBe(15);
  });

  it('should handle streaming chat completion', async () => {
    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    let fullContent = '';
    let chunks: any[] = [];

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            chunks.push(parsed);
            if (parsed.choices[0]?.delta?.content) {
              fullContent += parsed.choices[0].delta.content;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(fullContent).toBe('Hello from mock OpenAI!');
    expect(chunks[chunks.length - 1].choices[0].finish_reason).toBe('stop');
  });
});
