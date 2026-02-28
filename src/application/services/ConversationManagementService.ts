/**
 * ConversationManagementService — application-layer facade for conversation operations.
 *
 * Provides the service interface used by the gateway and portal routes.
 * Delegates to the lower-level conversationManager (which owns the SQL and
 * encryption details) so that callers never depend on raw pg.Pool directly.
 */
import type { EntityManager } from '@mikro-orm/core';
import { conversationManager, type ChatMessage, type ConversationContext } from '../../conversations.js';

export { type ChatMessage, type ConversationContext };

export class ConversationManagementService {
  constructor(private readonly em: EntityManager) {}

  private get db() {
    const knex = (this.em as any).getKnex();
    return {
      query: async (sql: string, params: unknown[] = []) => {
        const result = await knex.raw(sql, params);
        return { rows: result.rows as any[] };
      },
    };
  }

  getOrCreatePartition(
    tenantId: string,
    externalId: string,
  ): Promise<{ id: string }> {
    return conversationManager.getOrCreatePartition(this.db, tenantId, externalId);
  }

  getOrCreateConversation(
    tenantId: string,
    partitionId: string | null,
    externalId: string,
    agentId: string | null,
  ): Promise<{ id: string; isNew: boolean }> {
    return conversationManager.getOrCreateConversation(
      this.db,
      tenantId,
      partitionId,
      externalId,
      agentId,
    );
  }

  loadContext(tenantId: string, conversationId: string): Promise<ConversationContext> {
    return conversationManager.loadContext(this.db, tenantId, conversationId);
  }

  buildInjectionMessages(context: ConversationContext): ChatMessage[] {
    return conversationManager.buildInjectionMessages(context);
  }

  storeMessages(
    tenantId: string,
    conversationId: string,
    userContent: string,
    assistantContent: string,
    traceId: string | null,
    snapshotId: string | null,
  ): Promise<void> {
    return conversationManager.storeMessages(
      this.db,
      tenantId,
      conversationId,
      userContent,
      assistantContent,
      traceId,
      snapshotId,
    );
  }

  createSnapshot(
    tenantId: string,
    conversationId: string,
    summaryText: string,
    messagesArchived: number,
  ): Promise<string> {
    return conversationManager.createSnapshot(
      this.db,
      tenantId,
      conversationId,
      summaryText,
      messagesArchived,
    );
  }
}
