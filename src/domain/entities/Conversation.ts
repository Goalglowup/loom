import { randomUUID } from 'node:crypto';
import type { Tenant } from './Tenant.js';
import type { Agent } from './Agent.js';
import type { Partition } from './Partition.js';
import { ConversationMessage } from './ConversationMessage.js';
import { ConversationSnapshot } from './ConversationSnapshot.js';

export class Conversation {
  id!: string;
  tenant!: Tenant;
  agent!: Agent | null;
  partition!: Partition | null;
  externalId!: string;
  createdAt!: Date;
  lastActiveAt!: Date;

  messages: ConversationMessage[] = [];
  snapshots: ConversationSnapshot[] = [];

  addMessage(
    role: string,
    contentEncrypted: string,
    contentIv: string,
    tokenEstimate?: number,
  ): ConversationMessage {
    const msg = new ConversationMessage();
    msg.id = randomUUID();
    msg.conversation = this;
    msg.role = role;
    msg.contentEncrypted = contentEncrypted;
    msg.contentIv = contentIv;
    msg.tokenEstimate = tokenEstimate ?? null;
    msg.traceId = null;
    msg.snapshotId = null;
    msg.createdAt = new Date();
    this.messages.push(msg);
    this.lastActiveAt = msg.createdAt;
    return msg;
  }

  createSnapshot(
    summaryEncrypted: string,
    summaryIv: string,
    messagesArchived: number,
  ): ConversationSnapshot {
    const snap = new ConversationSnapshot();
    snap.id = randomUUID();
    snap.conversation = this;
    snap.summaryEncrypted = summaryEncrypted;
    snap.summaryIv = summaryIv;
    snap.messagesArchived = messagesArchived;
    snap.createdAt = new Date();
    this.snapshots.push(snap);
    return snap;
  }

  needsSnapshot(tokenLimit: number): boolean {
    const total = this.messages.reduce((sum, m) => sum + (m.tokenEstimate ?? 0), 0);
    return total >= tokenLimit;
  }
}
