import { EntitySchema } from '@mikro-orm/core';
import { TenantMembership } from '../entities/TenantMembership.js';
import { Tenant } from '../entities/Tenant.js';
import { User } from '../entities/User.js';

export const TenantMembershipSchema = new EntitySchema<TenantMembership>({
  class: TenantMembership,
  tableName: 'tenant_memberships',
  properties: {
    id: { type: 'uuid', primary: true },
    tenant: { kind: 'm:1', entity: () => Tenant, fieldName: 'tenant_id' },
    user: { kind: 'm:1', entity: () => User, fieldName: 'user_id' },
    role: { type: 'string', columnType: 'varchar(50)' },
    joinedAt: { type: 'Date', fieldName: 'joined_at', onCreate: () => new Date() },
  },
});
