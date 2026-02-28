import type { Conversation } from './Conversation.js';

export class ConversationMessage {
  id!: string;
  conversation!: Conversation;
  role!: string;
  contentEncrypted!: string;
  contentIv!: string;
  tokenEstimate!: number | null;
  traceId!: string | null;
  snapshotId!: string | null;
  createdAt!: Date;
}
