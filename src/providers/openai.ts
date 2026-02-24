import { request } from 'undici';
import { BaseProvider } from './base.js';
import { ProxyRequest, ProxyResponse, ProviderConfig } from '../types/openai.js';

export class OpenAIProvider extends BaseProvider {
  name = 'openai';
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl || 'https://api.openai.com';
  }

  async proxy(proxyReq: ProxyRequest): Promise<ProxyResponse> {
    const url = `${this.baseUrl}${proxyReq.url}`;
    
    const headers: Record<string, string> = {
      ...proxyReq.headers,
      'Authorization': this.getAuthHeader(),
      'Content-Type': 'application/json',
    };

    // Remove host header to avoid conflicts
    delete headers['host'];
    delete headers['Host'];

    const response = await request(url, {
      method: proxyReq.method,
      headers,
      body: proxyReq.body ? JSON.stringify(proxyReq.body) : undefined,
    });

    const responseHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      if (typeof value === 'string') {
        responseHeaders[key] = value;
      } else if (Array.isArray(value)) {
        responseHeaders[key] = value.join(', ');
      }
    }

    let body: any;
    const contentType = responseHeaders['content-type'] || '';
    
    if (contentType.includes('application/json')) {
      body = await response.body.json();
    } else if (contentType.includes('text/event-stream')) {
      return {
        status: response.statusCode,
        headers: responseHeaders,
        body: null,
        stream: response.body as any,
      };
    } else {
      body = await response.body.text();
    }

    return {
      status: response.statusCode,
      headers: responseHeaders,
      body,
    };
  }
}
