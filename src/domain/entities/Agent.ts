import { randomUUID } from 'node:crypto';
import type { Tenant } from './Tenant.js';
import { ApiKey } from './ApiKey.js';

export class Agent {
  id!: string;
  tenant!: Tenant;
  name!: string;
  providerConfig!: any | null;
  systemPrompt!: string | null;
  skills!: any[] | null;
  mcpEndpoints!: any[] | null;
  mergePolicies!: any;
  availableModels!: any[] | null;
  conversationsEnabled!: boolean;
  conversationTokenLimit!: number;
  conversationSummaryModel!: string | null;
  createdAt!: Date;
  updatedAt!: Date | null;

  apiKeys: ApiKey[] = [];

  constructor(tenant: Tenant, name: string, config?: Partial<Agent>) {
    this.id = randomUUID();
    this.tenant = tenant;
    this.name = name;
    this.providerConfig = config?.providerConfig ?? null;
    this.systemPrompt = config?.systemPrompt ?? null;
    this.skills = config?.skills ?? null;
    this.mcpEndpoints = config?.mcpEndpoints ?? null;
    this.mergePolicies = config?.mergePolicies ?? {
      system_prompt: 'prepend',
      skills: 'merge',
      mcp_endpoints: 'merge',
    };
    this.availableModels = config?.availableModels ?? null;
    this.conversationsEnabled = config?.conversationsEnabled ?? false;
    this.conversationTokenLimit = config?.conversationTokenLimit ?? 4000;
    this.conversationSummaryModel = config?.conversationSummaryModel ?? null;
    this.createdAt = new Date();
    this.updatedAt = null;
    this.apiKeys = [];
  }

  createApiKey(name: string): { entity: ApiKey; rawKey: string } {
    const apiKey = new ApiKey(this, name);
    this.apiKeys.push(apiKey);
    return { entity: apiKey, rawKey: apiKey.rawKey };
  }

  enableConversations(tokenLimit: number, summaryModel?: string): void {
    this.conversationsEnabled = true;
    this.conversationTokenLimit = tokenLimit;
    this.conversationSummaryModel = summaryModel ?? null;
  }

  disableConversations(): void {
    this.conversationsEnabled = false;
  }

  resolveProviderConfig(tenantChain: Tenant[]): any {
    if (this.providerConfig) return this.providerConfig;
    for (const t of tenantChain) {
      if (t.providerConfig) return t.providerConfig;
    }
    return null;
  }
}
