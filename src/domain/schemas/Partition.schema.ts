import { EntitySchema } from '@mikro-orm/core';
import { Partition } from '../entities/Partition.js';
import { Tenant } from '../entities/Tenant.js';

export const PartitionSchema = new EntitySchema<Partition>({
  class: Partition,
  tableName: 'partitions',
  properties: {
    id: { type: 'uuid', primary: true },
    tenant: { kind: 'm:1', entity: () => Tenant, fieldName: 'tenant_id' },
    parentId: { type: 'uuid', fieldName: 'parent_id', nullable: true },
    externalId: { type: 'string', columnType: 'varchar(255)', fieldName: 'external_id' },
    titleEncrypted: { type: 'text', fieldName: 'title_encrypted', nullable: true },
    titleIv: { type: 'string', columnType: 'varchar(24)', fieldName: 'title_iv', nullable: true },
    createdAt: { type: 'Date', fieldName: 'created_at', onCreate: () => new Date() },
  },
});
