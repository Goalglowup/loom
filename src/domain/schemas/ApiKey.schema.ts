import { EntitySchema } from '@mikro-orm/core';
import { ApiKey } from '../entities/ApiKey.js';
import { Tenant } from '../entities/Tenant.js';
import { Agent } from '../entities/Agent.js';

export const ApiKeySchema = new EntitySchema<ApiKey>({
  class: ApiKey,
  tableName: 'api_keys',
  properties: {
    id: { type: 'uuid', primary: true },
    tenant: { kind: 'm:1', entity: () => Tenant, fieldName: 'tenant_id' },
    agent: { kind: 'm:1', entity: () => Agent, fieldName: 'agent_id' },
    keyHash: { type: 'string', columnType: 'varchar(255)', fieldName: 'key_hash', unique: true },
    keyPrefix: { type: 'string', columnType: 'varchar(20)', fieldName: 'key_prefix' },
    name: { type: 'string', columnType: 'varchar(255)', default: 'Default Key' },
    status: { type: 'string', columnType: 'varchar(20)', default: 'active' },
    revokedAt: { type: 'Date', fieldName: 'revoked_at', nullable: true },
    createdAt: { type: 'Date', fieldName: 'created_at', onCreate: () => new Date() },
  },
});
