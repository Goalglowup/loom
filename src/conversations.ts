/**
 * ConversationManager — conversation state management for the Loom gateway.
 *
 * Handles partition resolution, conversation lifecycle, context loading,
 * message storage, and snapshot (summary) creation. All message content
 * and snapshot summaries are encrypted at rest via encryptTraceBody /
 * decryptTraceBody from encryption.ts.
 */
import pg from 'pg';
import { encryptTraceBody, decryptTraceBody } from './encryption.js';

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

export const conversationManager = {
  /**
   * Resolve or create a root partition (parent_id IS NULL) by external_id.
   * Returns the internal UUID.
   */
  async getOrCreatePartition(
    db: pg.Pool,
    tenantId: string,
    externalId: string,
  ): Promise<{ id: string }> {
    // Upsert via partial unique index on (tenant_id, external_id) WHERE parent_id IS NULL
    const upsert = await db.query<{ id: string }>(
      `INSERT INTO partitions (tenant_id, external_id)
       VALUES ($1, $2)
       ON CONFLICT (tenant_id, external_id) WHERE parent_id IS NULL
       DO NOTHING
       RETURNING id`,
      [tenantId, externalId],
    );
    if (upsert.rows.length > 0) return upsert.rows[0];

    const select = await db.query<{ id: string }>(
      `SELECT id FROM partitions WHERE tenant_id = $1 AND external_id = $2 AND parent_id IS NULL`,
      [tenantId, externalId],
    );
    return select.rows[0];
  },

  /**
   * Resolve or create a conversation by (tenant_id, partition_id, external_id).
   * Updates last_active_at on existing conversations.
   */
  async getOrCreateConversation(
    db: pg.Pool,
    tenantId: string,
    partitionId: string | null,
    externalId: string,
    agentId: string | null,
  ): Promise<{ id: string; isNew: boolean }> {
    // Handle both null and non-null partition_id safely
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM conversations
       WHERE tenant_id = $1
         AND partition_id IS NOT DISTINCT FROM $2
         AND external_id = $3`,
      [tenantId, partitionId, externalId],
    );

    if (existing.rows.length > 0) {
      await db.query(
        `UPDATE conversations SET last_active_at = now() WHERE id = $1`,
        [existing.rows[0].id],
      );
      return { id: existing.rows[0].id, isNew: false };
    }

    const inserted = await db.query<{ id: string }>(
      `INSERT INTO conversations (tenant_id, agent_id, partition_id, external_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [tenantId, agentId, partitionId, externalId],
    );
    return { id: inserted.rows[0].id, isNew: true };
  },

  /**
   * Load conversation context for injection into an outgoing request.
   * Returns the latest snapshot summary (if any) plus all messages
   * that have not yet been archived into a snapshot (snapshot_id IS NULL).
   */
  async loadContext(
    db: pg.Pool,
    tenantId: string,
    conversationId: string,
  ): Promise<ConversationContext> {
    // Get latest snapshot
    const snapshotResult = await db.query<{
      id: string;
      summary_encrypted: string;
      summary_iv: string;
    }>(
      `SELECT id, summary_encrypted, summary_iv
       FROM conversation_snapshots
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [conversationId],
    );

    const snap = snapshotResult.rows[0] ?? null;
    let latestSnapshotId: string | null = null;
    let latestSnapshotSummary: string | undefined;

    if (snap) {
      latestSnapshotId = snap.id;
      try {
        latestSnapshotSummary = decryptTraceBody(
          tenantId,
          snap.summary_encrypted,
          snap.summary_iv,
        );
      } catch {
        latestSnapshotSummary = undefined;
      }
    }

    // Get messages not yet covered by any snapshot (snapshot_id IS NULL)
    const msgResult = await db.query<{
      role: string;
      content_encrypted: string;
      content_iv: string;
      token_estimate: number | null;
    }>(
      `SELECT role, content_encrypted, content_iv, token_estimate
       FROM conversation_messages
       WHERE conversation_id = $1 AND snapshot_id IS NULL
       ORDER BY created_at ASC`,
      [conversationId],
    );

    const messages: ChatMessage[] = [];
    let tokenEstimate = 0;

    for (const row of msgResult.rows) {
      try {
        const content = decryptTraceBody(tenantId, row.content_encrypted, row.content_iv);
        messages.push({ role: row.role, content });
        tokenEstimate += row.token_estimate ?? Math.ceil(content.length / 4);
      } catch {
        // Skip messages that fail decryption (e.g. key rotation edge cases)
      }
    }

    return { messages, tokenEstimate, latestSnapshotId, latestSnapshotSummary };
  },

  /**
   * Persist the user and assistant turns for a completed exchange.
   * Both messages are encrypted before storage.
   */
  async storeMessages(
    db: pg.Pool,
    tenantId: string,
    conversationId: string,
    userContent: string,
    assistantContent: string,
    traceId: string | null,
    _snapshotId: string | null, // reserved; new messages always start with snapshot_id = NULL
  ): Promise<void> {
    const userEnc = encryptTraceBody(tenantId, userContent);
    const assistantEnc = encryptTraceBody(tenantId, assistantContent);

    await db.query(
      `INSERT INTO conversation_messages
         (conversation_id, role, content_encrypted, content_iv, token_estimate, trace_id)
       VALUES
         ($1, 'user',      $2, $3, $4, $5),
         ($1, 'assistant', $6, $7, $8, $5)`,
      [
        conversationId,
        userEnc.ciphertext,
        userEnc.iv,
        Math.ceil(userContent.length / 4),
        traceId,
        assistantEnc.ciphertext,
        assistantEnc.iv,
        Math.ceil(assistantContent.length / 4),
      ],
    );
  },

  /**
   * Archive un-snapshotted messages under a new summary snapshot.
   * All messages with snapshot_id IS NULL are tagged with the new snapshot id.
   * Returns the new snapshot UUID.
   */
  async createSnapshot(
    db: pg.Pool,
    tenantId: string,
    conversationId: string,
    summaryText: string,
    messagesArchived: number,
  ): Promise<string> {
    const enc = encryptTraceBody(tenantId, summaryText);

    const insertResult = await db.query<{ id: string }>(
      `INSERT INTO conversation_snapshots
         (conversation_id, summary_encrypted, summary_iv, messages_archived)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [conversationId, enc.ciphertext, enc.iv, messagesArchived],
    );
    const newSnapshotId = insertResult.rows[0].id;

    // Mark all previously un-snapshotted messages as archived under the new snapshot
    await db.query(
      `UPDATE conversation_messages
       SET snapshot_id = $1
       WHERE conversation_id = $2 AND snapshot_id IS NULL`,
      [newSnapshotId, conversationId],
    );

    return newSnapshotId;
  },

  /**
   * Build the array of messages to prepend to the user's request.
   * Prepends a system summary message if a snapshot exists, then appends
   * any post-snapshot messages.
   */
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
  },
};
