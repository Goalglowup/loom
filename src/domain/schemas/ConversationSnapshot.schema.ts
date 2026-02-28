import { EntitySchema } from '@mikro-orm/core';
import { ConversationSnapshot } from '../entities/ConversationSnapshot.js';
import { Conversation } from '../entities/Conversation.js';

export const ConversationSnapshotSchema = new EntitySchema<ConversationSnapshot>({
  class: ConversationSnapshot,
  tableName: 'conversation_snapshots',
  properties: {
    id: { type: 'uuid', primary: true },
    conversation: { kind: 'm:1', entity: () => Conversation, fieldName: 'conversation_id' },
    summaryEncrypted: { type: 'text', fieldName: 'summary_encrypted' },
    summaryIv: { type: 'string', columnType: 'varchar(24)', fieldName: 'summary_iv' },
    messagesArchived: { type: 'integer', fieldName: 'messages_archived' },
    createdAt: { type: 'Date', fieldName: 'created_at', onCreate: () => new Date() },
  },
});
