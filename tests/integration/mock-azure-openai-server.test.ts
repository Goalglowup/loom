import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockAzureOpenAIServer } from '../mocks/mock-azure-openai-server';

describe('Mock Azure OpenAI Server', () => {
  let server: MockAzureOpenAIServer;
  let baseURL: string;

  beforeAll(async () => {
    server = new MockAzureOpenAIServer({ port: 3002 });
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
    expect(data.provider).toBe('mock-azure-openai');
  });

  it('should handle non-streaming chat completion', async () => {
    const deploymentId = 'gpt-4-deployment';
    const response = await fetch(
      `${baseURL}/openai/deployments/${deploymentId}/chat/completions?api-version=2024-02-15-preview`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }]
        })
      }
    );

    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.id).toBe('chatcmpl-azure-mock-456');
    expect(data.object).toBe('chat.completion');
    expect(data.model).toBe(deploymentId);
    expect(data.choices).toHaveLength(1);
    expect(data.choices[0].message.role).toBe('assistant');
    expect(data.choices[0].message.content).toBe('Hello from Azure OpenAI!');
    expect(data.usage.prompt_tokens).toBe(10);
    expect(data.usage.completion_tokens).toBe(5);
    expect(data.usage.total_tokens).toBe(15);
  });

  it('should handle streaming chat completion', async () => {
    const deploymentId = 'gpt-4-deployment';
    const response = await fetch(
      `${baseURL}/openai/deployments/${deploymentId}/chat/completions?api-version=2024-02-15-preview`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true
        })
      }
    );

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
    expect(fullContent).toBe('Hello from Azure OpenAI!');
    expect(chunks[chunks.length - 1].choices[0].finish_reason).toBe('stop');
  });
});
