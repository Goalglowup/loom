import type { ProviderBase } from './ProviderBase.js';
import type { Tenant } from './Tenant.js';

export class ProviderTenantAccess {
  provider!: ProviderBase;
  tenant!: Tenant;
  createdAt!: Date;

  constructor(provider: ProviderBase, tenant: Tenant) {
    this.provider = provider;
    this.tenant = tenant;
    this.createdAt = new Date();
  }
}
