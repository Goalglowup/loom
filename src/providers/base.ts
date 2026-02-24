import { ProxyRequest, ProxyResponse, ProviderConfig } from '../types/openai.js';

export interface Provider {
  name: string;
  proxy(request: ProxyRequest): Promise<ProxyResponse>;
}

export abstract class BaseProvider implements Provider {
  abstract name: string;
  
  constructor(protected config: ProviderConfig) {}
  
  abstract proxy(request: ProxyRequest): Promise<ProxyResponse>;
  
  protected getAuthHeader(): string {
    return `Bearer ${this.config.apiKey}`;
  }
}
