import { request } from 'undici';
import { BaseProvider } from './base.js';
import { ProxyRequest, ProxyResponse, ProviderConfig } from '../types/openai.js';

export class OpenAIProvider extends BaseProvider {
  name = 'openai';
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    // Strip trailing /v1 from baseUrl — proxyReq.url already includes /v1/...
    this.baseUrl = (config.baseUrl || 'https://api.openai.com').replace(/\/v1\/?$/, '');
  }

  async proxy(proxyReq: ProxyRequest): Promise<ProxyResponse> {
    const url = `${this.baseUrl}${proxyReq.url}`;
    
    const headers: Record<string, string> = {
      ...proxyReq.headers,
      'Authorization': this.getAuthHeader(),
      'Content-Type': 'application/json',
    };

    // Remove hop-by-hop and browser-only headers that must not be forwarded
    delete headers['host'];
    delete headers['Host'];
    delete headers['content-length'];
    delete headers['Content-Length'];
    delete headers['transfer-encoding'];
    delete headers['Transfer-Encoding'];
    // Strip Origin — browsers send "null" for file:// pages; upstream LLMs (e.g. Ollama) reject it
    delete headers['origin'];
    delete headers['Origin'];
    delete headers['referer'];
    delete headers['Referer'];

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
