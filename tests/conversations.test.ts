/**
 * Conversations module unit tests
 *
 * Tests conversationManager methods from src/conversations.ts.
 * Mocks pg.Pool and sets ENCRYPTION_MASTER_KEY for encrypt/decrypt calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { conversationManager } from '../src/conversations.js';

const TEST_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/** Build a mock pool that returns responses in sequence. */
function buildSeqPool(responses: Array<{ rows: unknown[] }>) {
  let idx = 0;
  const queryFn = vi.fn().mockImplementation(() => {
    const resp = responses[idx] ?? { rows: [] };
    idx++;
    return Promise.resolve(resp);
  });
  return { query: queryFn } as unknown as import('pg').Pool;
}

/** Build a mock pool that always rejects. */
function buildErrPool(message = 'DB error') {
  return { query: vi.fn().mockRejectedValue(new Error(message)) } as unknown as import('pg').Pool;
}

describe('conversationManager', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_MASTER_KEY;
  });

  // ── getOrCreateConversation ─────────────────────────────────────────────

  describe('getOrCreateConversation', () => {
    it('returns existing conversation and updates last_active_at', async () => {
      const existingId = 'conv-uuid-existing';
      const pool = buildSeqPool([
        { rows: [{ id: existingId }] }, // SELECT existing
        { rows: [] },                    // UPDATE last_active_at
      ]);

      const result = await conversationManager.getOrCreateConversation(
        pool, 'tenant-1', 'partition-1', 'ext-conv-1', null,
      );

      expect(result).toEqual({ id: existingId, isNew: false });
      expect(pool.query).toHaveBeenCalledTimes(2);
      const selectSql = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(selectSql).toContain('SELECT id FROM conversations');
    });

    it('creates new conversation when none exists', async () => {
      const newId = 'conv-uuid-new';
      const pool = buildSeqPool([
        { rows: [] },               // SELECT returns nothing
        { rows: [{ id: newId }] }, // INSERT RETURNING
      ]);

      const result = await conversationManager.getOrCreateConversation(
        pool, 'tenant-1', null, 'ext-conv-2', 'agent-abc',
      );

      expect(result).toEqual({ id: newId, isNew: true });
      expect(pool.query).toHaveBeenCalledTimes(2);
      const insertSql = (pool.query as ReturnType<typeof vi.fn>).mock.calls[1][0] as string;
      expect(insertSql).toContain('INSERT INTO conversations');
    });

    it('propagates pool errors', async () => {
      await expect(
        conversationManager.getOrCreateConversation(
          buildErrPool('connection refused'), 't1', null, 'ext', null,
        ),
      ).rejects.toThrow('connection refused');
    });
  });

  // ── storeMessages ───────────────────────────────────────────────────────

  describe('storeMessages', () => {
    it('inserts user and assistant messages in one query', async () => {
      const pool = buildSeqPool([{ rows: [] }]);

      await conversationManager.storeMessages(
        pool, 'tenant-1', 'conv-1', 'Hello!', 'Hi there!', 'trace-abc', null,
      );

      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain('INSERT INTO conversation_messages');
      expect(sql).toContain("'user'");
      expect(sql).toContain("'assistant'");
    });

    it('encrypts content before storage (ciphertext differs from plaintext)', async () => {
      const pool = buildSeqPool([{ rows: [] }]);

      await conversationManager.storeMessages(
        pool, 'tenant-1', 'conv-1', 'Secret message', 'Secret reply', null, null,
      );

      const params = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][1] as unknown[];
      // params[1] is userEnc.ciphertext — should not equal the plaintext
      expect(params[1]).not.toBe('Secret message');
      expect(params[5]).not.toBe('Secret reply');
    });

    it('propagates pool errors', async () => {
      await expect(
        conversationManager.storeMessages(
          buildErrPool('insert failed'), 't1', 'c1', 'u', 'a', null, null,
        ),
      ).rejects.toThrow('insert failed');
    });
  });

  // ── loadContext ─────────────────────────────────────────────────────────

  describe('loadContext', () => {
    it('returns empty context when no snapshots or messages exist', async () => {
      const pool = buildSeqPool([
        { rows: [] }, // snapshot query
        { rows: [] }, // messages query
      ]);

      const ctx = await conversationManager.loadContext(pool, 'tenant-1', 'conv-1');

      expect(ctx.messages).toEqual([]);
      expect(ctx.tokenEstimate).toBe(0);
      expect(ctx.latestSnapshotId).toBeNull();
      expect(ctx.latestSnapshotSummary).toBeUndefined();
    });

    it('returns decrypted messages with token estimates', async () => {
      const { encryptTraceBody } = await import('../src/encryption.js');
      const enc = encryptTraceBody('tenant-1', 'Hello world');

      const pool = buildSeqPool([
        { rows: [] }, // no snapshot
        {
          rows: [{
            role: 'user',
            content_encrypted: enc.ciphertext,
            content_iv: enc.iv,
            token_estimate: 7,
          }],
        },
      ]);

      const ctx = await conversationManager.loadContext(pool, 'tenant-1', 'conv-1');

      expect(ctx.messages).toHaveLength(1);
      expect(ctx.messages[0].role).toBe('user');
      expect(ctx.messages[0].content).toBe('Hello world');
      expect(ctx.tokenEstimate).toBe(7);
    });

    it('returns snapshot summary when a snapshot exists', async () => {
      const { encryptTraceBody } = await import('../src/encryption.js');
      const snapEnc = encryptTraceBody('tenant-1', 'Prior conversation summary text');

      const pool = buildSeqPool([
        {
          rows: [{
            id: 'snap-uuid-1',
            summary_encrypted: snapEnc.ciphertext,
            summary_iv: snapEnc.iv,
          }],
        },
        { rows: [] }, // no messages beyond snapshot
      ]);

      const ctx = await conversationManager.loadContext(pool, 'tenant-1', 'conv-1');

      expect(ctx.latestSnapshotId).toBe('snap-uuid-1');
      expect(ctx.latestSnapshotSummary).toBe('Prior conversation summary text');
      expect(ctx.messages).toEqual([]);
    });

    it('propagates pool errors', async () => {
      await expect(
        conversationManager.loadContext(buildErrPool('load failed'), 'tenant-1', 'conv-1'),
      ).rejects.toThrow('load failed');
    });
  });

  // ── buildInjectionMessages ──────────────────────────────────────────────

  describe('buildInjectionMessages', () => {
    it('returns empty array for empty context with no snapshot', () => {
      const result = conversationManager.buildInjectionMessages({
        messages: [],
        tokenEstimate: 0,
        latestSnapshotId: null,
        latestSnapshotSummary: undefined,
      });
      expect(result).toEqual([]);
    });

    it('prepends system summary message when snapshot summary exists', () => {
      const messages = [{ role: 'user', content: 'What is 2+2?' }];
      const result = conversationManager.buildInjectionMessages({
        messages,
        tokenEstimate: 10,
        latestSnapshotId: 'snap-1',
        latestSnapshotSummary: 'User asked about math',
      });

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toContain('User asked about math');
      expect(result[0].content).toContain('Previous conversation summary');
      expect(result[1]).toEqual({ role: 'user', content: 'What is 2+2?' });
    });

    it('returns only messages when no snapshot summary', () => {
      const messages = [
        { role: 'user', content: 'question' },
        { role: 'assistant', content: 'answer' },
      ];
      const result = conversationManager.buildInjectionMessages({
        messages,
        tokenEstimate: 20,
        latestSnapshotId: null,
        latestSnapshotSummary: undefined,
      });
      expect(result).toEqual(messages);
    });

    it('does not prepend system message if snapshot id is set but summary is undefined', () => {
      const result = conversationManager.buildInjectionMessages({
        messages: [{ role: 'user', content: 'hi' }],
        tokenEstimate: 5,
        latestSnapshotId: 'snap-exists',
        latestSnapshotSummary: undefined,
      });
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
    });
  });
});
