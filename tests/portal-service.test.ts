/**
 * Unit tests for PortalService — available_models provider chain fallback.
 *
 * Covers: listAgents and getAgent resolution through agent provider →
 * tenant default provider, and gatewayProviderId preservation in
 * sanitized providerConfig responses.
 *
 * PR #189 / Copilot review comment 3344769707 (line 185)
 */
import { describe, it, expect, vi } from 'vitest';
import type { EntityManager } from '@mikro-orm/core';
import { PortalService } from '../src/application/services/PortalService.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMockEm(overrides: Record<string, any> = {}): EntityManager {
  return {
    find: vi.fn(),
    findOne: vi.fn(),
    findOneOrFail: vi.fn(),
    persist: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    removeAndFlush: vi.fn().mockResolvedValue(undefined),
    persistAndFlush: vi.fn().mockResolvedValue(undefined),
    // Default: tenant chain is empty (no parent tenants)
    getKnex: () => ({ raw: vi.fn().mockResolvedValue({ rows: [] }) }),
    ...overrides,
  } as unknown as EntityManager;
}

/** Minimal agent-shaped plain object. Pass overrides to customise. */
function makeAgent(overrides: Record<string, any> = {}) {
  return {
    id: 'agent-1',
    tenant: 'tenant-1',
    name: 'Test Agent',
    providerConfig: null,
    providerId: null,
    availableModels: null,
    conversationsEnabled: false,
    conversationTokenLimit: null,
    conversationSummaryModel: null,
    systemPrompt: null,
    skills: null,
    mcpEndpoints: null,
    mergePolicies: null,
    knowledgeBaseRef: null,
    createdAt: new Date(),
    updatedAt: null,
    ...overrides,
  };
}

/** Minimal TenantMembership-shaped object. */
function makeMembership(overrides: Record<string, any> = {}) {
  return {
    id: 'mem-1',
    tenant: { id: 'tenant-1' },
    user: { id: 'user-1' },
    role: 'owner',
    joinedAt: new Date(),
    ...overrides,
  };
}

/** A tenant chain row (result of the recursive CTE in loadTenantChain). */
function makeTenantChainRow(overrides: Record<string, any> = {}) {
  return {
    id: 'tenant-1',
    name: 'Test Tenant',
    provider_config: null,
    default_provider_id: null,
    system_prompt: null,
    skills: null,
    mcp_endpoints: null,
    depth: 0,
    ...overrides,
  };
}

/** A provider-shaped plain object (OpenAI / Azure / Ollama all share this shape). */
function makeProvider(id: string, availableModels: string[]) {
  return { id, availableModels };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PortalService.listAgents — available_models fallback', () => {
  it('uses agent provider models when agent has no own available_models', async () => {
    // Agent points to a gateway provider via providerId.
    // Provider has models → agent should inherit them.
    const agent = makeAgent({ providerId: 'prov-1' });

    const em = buildMockEm({
      find: vi.fn()
        .mockResolvedValueOnce([agent])                                         // Agent.find
        .mockResolvedValueOnce([makeProvider('prov-1', ['gpt-4o', 'gpt-4t'])]) // OpenAIProvider.find
        .mockResolvedValueOnce([])                                              // AzureProvider.find
        .mockResolvedValueOnce([]),                                             // OllamaProvider.find
    });

    const svc = new PortalService(em);
    const result = await svc.listAgents('tenant-1');

    expect(result).toHaveLength(1);
    expect(result[0].available_models).toEqual(['gpt-4o', 'gpt-4t']);
  });

  it('falls back to tenant default provider models when agent has no provider and no own models', async () => {
    // Agent has no providerId and no providerConfig.gatewayProviderId.
    // Tenant chain has default_provider_id → models come from there.
    const agent = makeAgent({ providerId: null, providerConfig: null });
    const tenantRow = makeTenantChainRow({ default_provider_id: 'tenant-prov' });
    const mockRaw = vi.fn().mockResolvedValue({ rows: [tenantRow] });

    const em = buildMockEm({
      getKnex: () => ({ raw: mockRaw }),
      find: vi.fn()
        .mockResolvedValueOnce([agent])                                              // Agent.find
        .mockResolvedValueOnce([makeProvider('tenant-prov', ['claude-3-opus'])])     // OpenAIProvider.find
        .mockResolvedValueOnce([])                                                   // AzureProvider.find
        .mockResolvedValueOnce([]),                                                  // OllamaProvider.find
    });

    const svc = new PortalService(em);
    const result = await svc.listAgents('tenant-1');

    expect(result).toHaveLength(1);
    expect(result[0].available_models).toEqual(['claude-3-opus']);
  });

  it('uses agent own available_models directly without querying the provider chain', async () => {
    // Agent already has its own list — no DB round-trips for providers.
    const agent = makeAgent({ availableModels: ['own-model-a', 'own-model-b'] });
    const mockRaw = vi.fn();

    const em = buildMockEm({
      getKnex: () => ({ raw: mockRaw }),
      find: vi.fn().mockResolvedValueOnce([agent]), // Agent.find only
    });

    const svc = new PortalService(em);
    const result = await svc.listAgents('tenant-1');

    expect(result[0].available_models).toEqual(['own-model-a', 'own-model-b']);
    // No tenant chain query and no extra find calls
    expect(mockRaw).not.toHaveBeenCalled();
    expect(em.find).toHaveBeenCalledTimes(1);
  });
});

describe('PortalService.getAgent — available_models fallback', () => {
  it('resolves through agent provider then tenant default provider when both exist but agent provider has no models', async () => {
    // Agent has a provider but that provider has no models.
    // Tenant chain has a default provider with models → should use those.
    //
    // resolveAgentAvailableModels batch-loads via em.find (same as listAgents):
    //   providerIds = ['agent-prov', 'tenant-prov']
    //   em.find(OpenAIProvider, { id: { $in: providerIds } }) → [tenant-prov with models]
    //   em.find(AzureProvider, ...)  → []
    //   em.find(OllamaProvider, ...) → []
    //   providerModelsMap = { 'tenant-prov' → ['tenant-model'] }
    //   agentProvider not in map → skip; tenantProvider in map → return ['tenant-model']
    const agent = makeAgent({ providerId: 'agent-prov', tenant: 'tenant-1' });
    const membership = makeMembership();
    const tenantRow = makeTenantChainRow({ default_provider_id: 'tenant-prov' });
    const mockRaw = vi.fn().mockResolvedValue({ rows: [tenantRow] });

    const em = buildMockEm({
      getKnex: () => ({ raw: mockRaw }),
      findOne: vi.fn()
        .mockResolvedValueOnce(agent)       // Agent lookup
        .mockResolvedValueOnce(membership), // TenantMembership lookup
      // resolveAgentAvailableModels batch-loads providers via em.find
      find: vi.fn()
        // Only tenant-prov returns models; agent-prov is absent (no rows for it)
        .mockResolvedValueOnce([makeProvider('tenant-prov', ['tenant-model'])]) // OpenAIProvider
        .mockResolvedValueOnce([])                                              // AzureProvider
        .mockResolvedValueOnce([]),                                             // OllamaProvider
    });

    const svc = new PortalService(em);
    const result = await svc.getAgent('agent-1', 'user-1');

    expect(result).not.toBeNull();
    expect(result!.available_models).toEqual(['tenant-model']);
  });

  it('preserves gatewayProviderId in the provider_config response field', async () => {
    // Regression: ensure gatewayProviderId is not stripped when returning providerConfig.
    // resolveAgentAvailableModels returns early because agent has own models →
    // no em.find calls needed.
    const agent = makeAgent({
      availableModels: ['gpt-4o'],
      providerConfig: { gatewayProviderId: 'gw-prov-123', model: 'gpt-4o' },
    });
    const membership = makeMembership();

    const em = buildMockEm({
      findOne: vi.fn()
        .mockResolvedValueOnce(agent)       // Agent lookup
        .mockResolvedValueOnce(membership), // TenantMembership lookup
      find: vi.fn(),                        // not called — agent has own models
    });

    const svc = new PortalService(em);
    const result = await svc.getAgent('agent-1', 'user-1');

    expect(result).not.toBeNull();
    expect(result!.provider_config).toMatchObject({ gatewayProviderId: 'gw-prov-123' });
    expect(result!.provider_config).toMatchObject({ model: 'gpt-4o' });
    // Verify no provider DB queries were made (agent had own models)
    expect(em.find).not.toHaveBeenCalled();
  });
});
