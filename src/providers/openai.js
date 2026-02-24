import { request } from 'undici';
import { BaseProvider } from './base.js';
export class OpenAIProvider extends BaseProvider {
    name = 'openai';
    baseUrl;
    constructor(config) {
        super(config);
        this.baseUrl = config.baseUrl || 'https://api.openai.com';
    }
    async proxy(proxyReq) {
        const url = `${this.baseUrl}${proxyReq.url}`;
        const headers = {
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
        const responseHeaders = {};
        for (const [key, value] of Object.entries(response.headers)) {
            if (typeof value === 'string') {
                responseHeaders[key] = value;
            }
            else if (Array.isArray(value)) {
                responseHeaders[key] = value.join(', ');
            }
        }
        let body;
        const contentType = responseHeaders['content-type'] || '';
        if (contentType.includes('application/json')) {
            body = await response.body.json();
        }
        else if (contentType.includes('text/event-stream')) {
            return {
                status: response.statusCode,
                headers: responseHeaders,
                body: null,
                stream: response.body,
            };
        }
        else {
            body = await response.body.text();
        }
        return {
            status: response.statusCode,
            headers: responseHeaders,
            body,
        };
    }
}
