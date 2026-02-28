import { EntitySchema } from '@mikro-orm/core';
import { Conversation } from '../entities/Conversation.js';
import { Tenant } from '../entities/Tenant.js';
import { Agent } from '../entities/Agent.js';
import { Partition } from '../entities/Partition.js';
import { ConversationMessage } from '../entities/ConversationMessage.js';
import { ConversationSnapshot } from '../entities/ConversationSnapshot.js';

export const ConversationSchema = new EntitySchema<Conversation>({
  class: Conversation,
  tableName: 'conversations',
  properties: {
    id: { type: 'uuid', primary: true },
    tenant: { kind: 'm:1', entity: () => Tenant, fieldName: 'tenant_id' },
    agent: { kind: 'm:1', entity: () => Agent, fieldName: 'agent_id', nullable: true },
    partition: { kind: 'm:1', entity: () => Partition, fieldName: 'partition_id', nullable: true },
    externalId: { type: 'string', columnType: 'varchar(255)', fieldName: 'external_id' },
    createdAt: { type: 'Date', fieldName: 'created_at', onCreate: () => new Date() },
    lastActiveAt: { type: 'Date', fieldName: 'last_active_at' },
    messages: { kind: '1:m', entity: () => ConversationMessage, mappedBy: 'conversation', eager: false },
    snapshots: { kind: '1:m', entity: () => ConversationSnapshot, mappedBy: 'conversation', eager: false },
  },
});
