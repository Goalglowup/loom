import type { Conversation } from './Conversation.js';

export class ConversationSnapshot {
  id!: string;
  conversation!: Conversation;
  summaryEncrypted!: string;
  summaryIv!: string;
  messagesArchived!: number;
  createdAt!: Date;
}
