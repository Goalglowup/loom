import { EntitySchema } from '@mikro-orm/core';
import { ProviderTenantAccess } from '../entities/ProviderTenantAccess.js';
import { ProviderBase } from '../entities/ProviderBase.js';
import { Tenant } from '../entities/Tenant.js';

export const ProviderTenantAccessSchema = new EntitySchema<ProviderTenantAccess>({
  class: ProviderTenantAccess,
  tableName: 'provider_tenant_access',
  properties: {
    provider: {
      kind: 'm:1',
      entity: () => ProviderBase,
      fieldName: 'provider_id',
      primary: true,
    },
    tenant: {
      kind: 'm:1',
      entity: () => Tenant,
      fieldName: 'tenant_id',
      primary: true,
    },
    createdAt: {
      type: 'Date',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
  },
});
