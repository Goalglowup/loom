import { randomUUID } from 'node:crypto';
import { createHash, randomBytes } from 'node:crypto';
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

  createApiKey(name: string): { entity: ApiKey; rawKey: string } {
    const rawKey = 'loom_sk_' + randomBytes(24).toString('base64url');
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 12);

    const apiKey = new ApiKey();
    apiKey.id = randomUUID();
    apiKey.tenant = this.tenant;
    apiKey.agent = this;
    apiKey.keyHash = keyHash;
    apiKey.keyPrefix = keyPrefix;
    apiKey.name = name;
    apiKey.status = 'active';
    apiKey.revokedAt = null;
    apiKey.createdAt = new Date();

    this.apiKeys.push(apiKey);
    return { entity: apiKey, rawKey };
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
