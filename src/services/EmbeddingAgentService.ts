import type { EntityManager } from '@mikro-orm/core';
import { Agent } from '../domain/entities/Agent.js';
import { Tenant } from '../domain/entities/Tenant.js';

export interface EmbeddingAgentConfig {
  provider: string;       // e.g., 'openai'
  model: string;          // e.g., 'text-embedding-3-small'
  dimensions: number;     // e.g., 1536
  apiKey?: string;        // resolved from provider config at runtime
  knowledgeBaseRef?: string;
}

/** Dimensions known per well-known model name. */
const KNOWN_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

function dimensionsForModel(model: string): number {
  return KNOWN_DIMENSIONS[model] ?? 1536;
}

export class EmbeddingAgentService {
  /**
   * Resolve an EmbeddingAgent's config for embedding operations.
   *
   * Resolution order:
   * 1. If agentRef provided: look up agent by name in DB, parse its systemPrompt as JSON config.
   * 2. If no agentRef: fall back to SYSTEM_EMBEDDER_PROVIDER + SYSTEM_EMBEDDER_MODEL env vars.
   * 3. Throw if neither is configured.
   */
  async resolveEmbedder(
    agentRef: string | undefined,
    tenantId: string,
    em: EntityManager,
  ): Promise<EmbeddingAgentConfig> {
    if (agentRef) {
      const agent = await em.findOne(Agent, { name: agentRef, tenant: tenantId, kind: 'embedding' });
      if (!agent) {
        throw new Error(`EmbeddingAgent '${agentRef}' not found for tenant ${tenantId}`);
      }
      if (!agent.systemPrompt) {
        throw new Error(`EmbeddingAgent '${agentRef}' has no config stored in systemPrompt`);
      }
      let parsed: Partial<EmbeddingAgentConfig>;
      try {
        parsed = JSON.parse(agent.systemPrompt);
      } catch {
        throw new Error(`EmbeddingAgent '${agentRef}' systemPrompt is not valid JSON`);
      }
      if (!parsed.provider || !parsed.model) {
        throw new Error(`EmbeddingAgent '${agentRef}' config missing required fields: provider, model`);
      }
      return {
        provider: parsed.provider,
        model: parsed.model,
        dimensions: parsed.dimensions ?? dimensionsForModel(parsed.model),
        apiKey: parsed.apiKey ?? process.env.SYSTEM_EMBEDDER_API_KEY,
        knowledgeBaseRef: parsed.knowledgeBaseRef,
      };
    }

    // Fall back to environment variables
    const provider = process.env.SYSTEM_EMBEDDER_PROVIDER;
    const model = process.env.SYSTEM_EMBEDDER_MODEL;
    if (!provider || !model) {
      throw new Error(
        'No agentRef provided and SYSTEM_EMBEDDER_PROVIDER / SYSTEM_EMBEDDER_MODEL env vars are not set',
      );
    }
    return {
      provider,
      model,
      dimensions: dimensionsForModel(model),
      apiKey: process.env.SYSTEM_EMBEDDER_API_KEY,
    };
  }

  /**
   * Create or update the system-embedder agent for a single tenant.
   * Uses upsert semantics: create if not exists, update systemPrompt if config changed.
   */
  async bootstrapSystemEmbedder(tenantId: string, em: EntityManager): Promise<void> {
    const provider = process.env.SYSTEM_EMBEDDER_PROVIDER;
    const model = process.env.SYSTEM_EMBEDDER_MODEL;
    if (!provider || !model) return;

    const config: EmbeddingAgentConfig = {
      provider,
      model,
      dimensions: dimensionsForModel(model),
    };
    const configJson = JSON.stringify(config);

    const existing = await em.findOne(Agent, { name: 'system-embedder', tenant: tenantId });
    if (existing) {
      if (existing.systemPrompt !== configJson) {
        existing.systemPrompt = configJson;
        existing.updatedAt = new Date();
        await em.flush();
      }
    } else {
      const tenant = await em.findOne(Tenant, { id: tenantId });
      if (!tenant) return;
      const agent = new Agent(tenant, 'system-embedder', {
        kind: 'embedding',
        systemPrompt: configJson,
      });
      em.persist(agent);
      await em.flush();
    }
  }

  /**
   * Bootstrap the system-embedder for ALL active tenants at gateway startup.
   */
  async bootstrapAllTenants(em: EntityManager): Promise<void> {
    const tenants = await em.find(Tenant, { status: 'active' });
    for (const tenant of tenants) {
      await this.bootstrapSystemEmbedder(tenant.id, em);
    }
  }
}
