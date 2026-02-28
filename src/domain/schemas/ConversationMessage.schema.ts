import { EntitySchema } from '@mikro-orm/core';
import { ConversationMessage } from '../entities/ConversationMessage.js';
import { Conversation } from '../entities/Conversation.js';

export const ConversationMessageSchema = new EntitySchema<ConversationMessage>({
  class: ConversationMessage,
  tableName: 'conversation_messages',
  properties: {
    id: { type: 'uuid', primary: true },
    conversation: { kind: 'm:1', entity: () => Conversation, fieldName: 'conversation_id' },
    role: { type: 'string', columnType: 'varchar(50)' },
    contentEncrypted: { type: 'text', fieldName: 'content_encrypted' },
    contentIv: { type: 'string', columnType: 'varchar(24)', fieldName: 'content_iv' },
    tokenEstimate: { type: 'integer', fieldName: 'token_estimate', nullable: true },
    traceId: { type: 'uuid', fieldName: 'trace_id', nullable: true },
    snapshotId: { type: 'uuid', fieldName: 'snapshot_id', nullable: true },
    createdAt: { type: 'Date', fieldName: 'created_at', onCreate: () => new Date() },
  },
});
