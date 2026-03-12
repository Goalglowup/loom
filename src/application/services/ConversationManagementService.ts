/**
 * ConversationManagementService — application-layer facade for conversation operations.
 *
 * Uses MikroORM entities directly instead of raw SQL.
 * All message content and snapshot summaries are encrypted at rest via
 * encryptTraceBody / decryptTraceBody.
 */
import type { EntityManager } from '@mikro-orm/core';
import { encryptTraceBody, decryptTraceBody } from '../../encryption.js';
import { ConversationRepository } from '../../domain/repositories/ConversationRepository.js';
import { PartitionRepository } from '../../domain/repositories/PartitionRepository.js';
import { Conversation } from '../../domain/entities/Conversation.js';
import { ConversationMessage } from '../../domain/entities/ConversationMessage.js';
import { ConversationSnapshot } from '../../domain/entities/ConversationSnapshot.js';

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ConversationContext {
  messages: ChatMessage[];
  tokenEstimate: number;
  latestSnapshotId: string | null;
  latestSnapshotSummary: string | undefined;
}

export class ConversationManagementService {
  constructor(private readonly em: EntityManager) {}

  async getOrCreatePartition(
    tenantId: string,
    externalId: string,
  ): Promise<{ id: string }> {
    const repo = new PartitionRepository(this.em);
    const { partition } = await repo.findOrCreateRoot(tenantId, externalId);
    await this.em.flush();
    return { id: partition.id };
  }

  async getOrCreateConversation(
    tenantId: string,
    partitionId: string | null,
    externalId: string,
    agentId: string | null,
  ): Promise<{ id: string; isNew: boolean }> {
    const repo = new ConversationRepository(this.em);
    const { conversation, isNew } = await repo.findOrCreate({
      tenantId,
      agentId,
      partitionId,
      externalId,
    });
    await this.em.flush();
    return { id: conversation.id, isNew };
  }

  async loadContext(tenantId: string, conversationId: string): Promise<ConversationContext> {
    // Get latest snapshot
    const snap = await this.em.findOne(
      ConversationSnapshot,
      { conversation: conversationId },
      { orderBy: { createdAt: 'DESC' } },
    );

    let latestSnapshotId: string | null = null;
    let latestSnapshotSummary: string | undefined;

    if (snap) {
      latestSnapshotId = snap.id;
      try {
        latestSnapshotSummary = decryptTraceBody(
          tenantId,
          snap.summaryEncrypted,
          snap.summaryIv,
        );
      } catch {
        latestSnapshotSummary = undefined;
      }
    }

    // Get messages not yet covered by any snapshot (snapshotId IS NULL)
    const msgs = await this.em.find(
      ConversationMessage,
      { conversation: conversationId, snapshotId: null },
      { orderBy: { createdAt: 'ASC' } },
    );

    const messages: ChatMessage[] = [];
    let tokenEstimate = 0;

    for (const msg of msgs) {
      try {
        const content = decryptTraceBody(tenantId, msg.contentEncrypted, msg.contentIv);
        messages.push({ role: msg.role, content });
        tokenEstimate += msg.tokenEstimate ?? Math.ceil(content.length / 4);
      } catch {
        // Skip messages that fail decryption (e.g. key rotation edge cases)
      }
    }

    return { messages, tokenEstimate, latestSnapshotId, latestSnapshotSummary };
  }

  buildInjectionMessages(context: ConversationContext): ChatMessage[] {
    const result: ChatMessage[] = [];

    if (context.latestSnapshotSummary) {
      result.push({
        role: 'system',
        content: `Previous conversation summary:\n${context.latestSnapshotSummary}`,
      });
    }

    result.push(...context.messages);
    return result;
  }

  async storeMessages(
    tenantId: string,
    conversationId: string,
    userContent: string,
    assistantContent: string,
    traceId: string | null,
    _snapshotId: string | null, // reserved; new messages always start with snapshot_id = NULL
  ): Promise<void> {
    // Use a forked EM for fire-and-forget safety
    const forkedEm = this.em.fork();
    const conv = forkedEm.getReference(Conversation, conversationId);

    const userEnc = encryptTraceBody(tenantId, userContent);
    const assistantEnc = encryptTraceBody(tenantId, assistantContent);

    const userMsg = conv.addMessage(
      'user',
      userEnc.ciphertext,
      userEnc.iv,
      Math.ceil(userContent.length / 4),
    );
    userMsg.traceId = traceId;

    const assistantMsg = conv.addMessage(
      'assistant',
      assistantEnc.ciphertext,
      assistantEnc.iv,
      Math.ceil(assistantContent.length / 4),
    );
    assistantMsg.traceId = traceId;

    forkedEm.persist(userMsg);
    forkedEm.persist(assistantMsg);
    await forkedEm.flush();
  }

  async createSnapshot(
    tenantId: string,
    conversationId: string,
    summaryText: string,
    messagesArchived: number,
  ): Promise<string> {
    const conv = this.em.getReference(Conversation, conversationId);
    const enc = encryptTraceBody(tenantId, summaryText);

    const snap = conv.createSnapshot(enc.ciphertext, enc.iv, messagesArchived);
    this.em.persist(snap);
    await this.em.flush();

    // Mark all previously un-snapshotted messages as archived under the new snapshot
    await this.em.nativeUpdate(
      ConversationMessage,
      { conversation: conversationId, snapshotId: null },
      { snapshotId: snap.id },
    );

    return snap.id;
  }
}
