import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

export interface MockAzureOpenAIServerOptions {
  port?: number;
  host?: string;
}

export interface AzureChatCompletionRequest {
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export class MockAzureOpenAIServer {
  private server: FastifyInstance;
  private port: number;
  private host: string;

  constructor(options: MockAzureOpenAIServerOptions = {}) {
    this.port = options.port || 3002;
    this.host = options.host || '127.0.0.1';
    this.server = Fastify({ logger: false });
    this.setupRoutes();
  }

  private setupRoutes() {
    this.server.post('/openai/deployments/:deploymentId/chat/completions', async (request, reply) => {
      const { deploymentId } = request.params as { deploymentId: string };
      const body = request.body as AzureChatCompletionRequest;
      const apiVersion = (request.query as any)['api-version'] || '2024-02-15-preview';

      if (body.stream) {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        const chunks = [
          { role: 'assistant', content: 'Hello' },
          { role: 'assistant', content: ' from' },
          { role: 'assistant', content: ' Azure' },
          { role: 'assistant', content: ' OpenAI!' }
        ];

        for (const chunk of chunks) {
          const sseData = {
            id: 'chatcmpl-azure-mock-456',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: deploymentId,
            choices: [{
              index: 0,
              delta: { content: chunk.content },
              finish_reason: null
            }]
          };
          reply.raw.write(`data: ${JSON.stringify(sseData)}\n\n`);
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        const finalChunk = {
          id: 'chatcmpl-azure-mock-456',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: deploymentId,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop'
          }]
        };
        reply.raw.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
      } else {
        return {
          id: 'chatcmpl-azure-mock-456',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: deploymentId,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello from Azure OpenAI!'
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15
          }
        };
      }
    });

    this.server.get('/health', async () => {
      return { status: 'ok', provider: 'mock-azure-openai' };
    });
  }

  async start(): Promise<string> {
    await this.server.listen({ port: this.port, host: this.host });
    return `http://${this.host}:${this.port}`;
  }

  async stop(): Promise<void> {
    await this.server.close();
  }

  getBaseURL(): string {
    return `http://${this.host}:${this.port}`;
  }
}
