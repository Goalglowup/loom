import { OpenAIProvider } from './openai.js';
import { AzureProvider } from './azure.js';
import type { BaseProvider } from './base.js';
import type { TenantContext } from '../auth.js';

// Lazy-initialised provider instances keyed by tenantId.
const providerCache = new Map<string, BaseProvider>();

/**
 * Return the correct provider instance for a tenant based on their
 * provider_config JSONB field.
 *
 * provider_config shape:
 *   { provider: "openai" | "azure", apiKey, baseUrl?, deployment?, apiVersion? }
 *
 * Falls back to an OpenAI provider using OPENAI_API_KEY env var when no
 * provider_config is present.  Instances are cached per tenant (lazy init).
 */
export function getProviderForTenant(tenantCtx: TenantContext): BaseProvider {
  const cached = providerCache.get(tenantCtx.tenantId);
  if (cached) return cached;

  const cfg = tenantCtx.providerConfig;
  let provider: BaseProvider;

  if (cfg?.provider === 'azure') {
    provider = new AzureProvider({
      apiKey:      cfg.apiKey,
      endpoint:    cfg.baseUrl ?? '',
      deployment:  cfg.deployment ?? '',
      apiVersion:  cfg.apiVersion ?? '2024-02-01',
    });
  } else {
    provider = new OpenAIProvider({
      apiKey:   cfg?.apiKey ?? process.env.OPENAI_API_KEY ?? '',
      baseUrl:  cfg?.baseUrl,
    });
  }

  providerCache.set(tenantCtx.tenantId, provider);
  return provider;
}

/**
 * Evict a tenant's cached provider instance.
 * Call this when a tenant's provider_config changes so the next request
 * picks up the new configuration.
 */
export function evictProvider(tenantId: string): void {
  providerCache.delete(tenantId);
}
