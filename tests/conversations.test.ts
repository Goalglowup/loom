/**
 * ConversationManagementService unit tests
 *
 * Tests the MikroORM-based ConversationManagementService.
 * Mocks EntityManager and sets ENCRYPTION_MASTER_KEY for encrypt/decrypt calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConversationManagementService } from '../src/application/services/ConversationManagementService.js';
import { encryptTraceBody } from '../src/encryption.js';

const TEST_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function buildMockEm(overrides: Partial<Record<string, any>> = {}) {
  const mockEm: any = {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    persist: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    fork: vi.fn(),
    nativeUpdate: vi.fn().mockResolvedValue(0),
    getReference: vi.fn((_Entity: any, id: string) => ({
      id,
      addMessage: vi.fn((role: string, ct: string, iv: string, est: number) => {
        const msg = { id: 'msg-' + role, conversation: { id }, role, contentEncrypted: ct, contentIv: iv, tokenEstimate: est, traceId: null, snapshotId: null, createdAt: new Date() };
        return msg;
      }),
      createSnapshot: vi.fn((ct: string, iv: string, count: number) => {
        const snap = { id: 'snap-new', conversation: { id }, summaryEncrypted: ct, summaryIv: iv, messagesArchived: count, createdAt: new Date() };
        return snap;
      }),
    })),
    ...overrides,
  };
  // fork returns a clone with the same mocks
  mockEm.fork.mockReturnValue(mockEm);
  return mockEm;
}

describe('ConversationManagementService', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_MASTER_KEY;
  });

  // ── getOrCreateConversation ─────────────────────────────────────────────

  describe('getOrCreateConversation', () => {
    it('returns existing conversation and updates lastActiveAt', async () => {
      const existingConv = { id: 'conv-uuid-existing', lastActiveAt: new Date('2020-01-01') };
      const em = buildMockEm({
        findOne: vi.fn().mockResolvedValue(existingConv),
      });

      const svc = new ConversationManagementService(em);
      const result = await svc.getOrCreateConversation(
        'tenant-1', 'partition-1', 'ext-conv-1', null,
      );

      expect(result).toEqual({ id: 'conv-uuid-existing', isNew: false });
      // lastActiveAt should have been updated
      expect(existingConv.lastActiveAt.getTime()).toBeGreaterThan(new Date('2020-01-01').getTime());
      expect(em.flush).toHaveBeenCalled();
    });

    it('creates new conversation when none exists', async () => {
      const em = buildMockEm({
        findOne: vi.fn().mockResolvedValue(null),
      });

      const svc = new ConversationManagementService(em);
      const result = await svc.getOrCreateConversation(
        'tenant-1', null, 'ext-conv-2', 'agent-abc',
      );

      expect(result.isNew).toBe(true);
      expect(result.id).toBeDefined();
      expect(em.persist).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
    });

    it('propagates errors', async () => {
      const em = buildMockEm({
        findOne: vi.fn().mockRejectedValue(new Error('connection refused')),
      });
      const svc = new ConversationManagementService(em);

      await expect(
        svc.getOrCreateConversation('t1', null, 'ext', null),
      ).rejects.toThrow('connection refused');
    });
  });

  // ── storeMessages ───────────────────────────────────────────────────────

  describe('storeMessages', () => {
    it('persists user and assistant messages via forked EM', async () => {
      const em = buildMockEm();

      const svc = new ConversationManagementService(em);
      await svc.storeMessages(
        'tenant-1', 'conv-1', 'Hello!', 'Hi there!', 'trace-abc', null,
      );

      expect(em.fork).toHaveBeenCalled();
      // Two messages persisted
      expect(em.persist).toHaveBeenCalledTimes(2);
      expect(em.flush).toHaveBeenCalled();
    });

    it('encrypts content before storage (ciphertext differs from plaintext)', async () => {
      const messages: any[] = [];
      const em = buildMockEm({
        persist: vi.fn((msg: any) => messages.push(msg)),
      });

      const svc = new ConversationManagementService(em);
      await svc.storeMessages(
        'tenant-1', 'conv-1', 'Secret message', 'Secret reply', null, null,
      );

      // The encrypted content should not equal the plaintext
      const userMsg = messages.find((m: any) => m.role === 'user');
      const assistantMsg = messages.find((m: any) => m.role === 'assistant');
      expect(userMsg).toBeDefined();
      expect(assistantMsg).toBeDefined();
      expect(userMsg.contentEncrypted).not.toBe('Secret message');
      expect(assistantMsg.contentEncrypted).not.toBe('Secret reply');
    });

    it('propagates errors', async () => {
      const em = buildMockEm({
        flush: vi.fn().mockRejectedValue(new Error('insert failed')),
      });
      const svc = new ConversationManagementService(em);

      await expect(
        svc.storeMessages('t1', 'c1', 'u', 'a', null, null),
      ).rejects.toThrow('insert failed');
    });
  });

  // ── loadContext ─────────────────────────────────────────────────────────

  describe('loadContext', () => {
    it('returns empty context when no snapshots or messages exist', async () => {
      const em = buildMockEm({
        findOne: vi.fn().mockResolvedValue(null),
        find: vi.fn().mockResolvedValue([]),
      });

      const svc = new ConversationManagementService(em);
      const ctx = await svc.loadContext('tenant-1', 'conv-1');

      expect(ctx.messages).toEqual([]);
      expect(ctx.tokenEstimate).toBe(0);
      expect(ctx.latestSnapshotId).toBeNull();
      expect(ctx.latestSnapshotSummary).toBeUndefined();
    });

    it('returns decrypted messages with token estimates', async () => {
      const enc = encryptTraceBody('tenant-1', 'Hello world');

      const em = buildMockEm({
        findOne: vi.fn().mockResolvedValue(null), // no snapshot
        find: vi.fn().mockResolvedValue([
          {
            role: 'user',
            contentEncrypted: enc.ciphertext,
            contentIv: enc.iv,
            tokenEstimate: 7,
          },
        ]),
      });

      const svc = new ConversationManagementService(em);
      const ctx = await svc.loadContext('tenant-1', 'conv-1');

      expect(ctx.messages).toHaveLength(1);
      expect(ctx.messages[0].role).toBe('user');
      expect(ctx.messages[0].content).toBe('Hello world');
      expect(ctx.tokenEstimate).toBe(7);
    });

    it('returns snapshot summary when a snapshot exists', async () => {
      const snapEnc = encryptTraceBody('tenant-1', 'Prior conversation summary text');

      const em = buildMockEm({
        findOne: vi.fn().mockResolvedValue({
          id: 'snap-uuid-1',
          summaryEncrypted: snapEnc.ciphertext,
          summaryIv: snapEnc.iv,
        }),
        find: vi.fn().mockResolvedValue([]), // no messages beyond snapshot
      });

      const svc = new ConversationManagementService(em);
      const ctx = await svc.loadContext('tenant-1', 'conv-1');

      expect(ctx.latestSnapshotId).toBe('snap-uuid-1');
      expect(ctx.latestSnapshotSummary).toBe('Prior conversation summary text');
      expect(ctx.messages).toEqual([]);
    });

    it('propagates errors', async () => {
      const em = buildMockEm({
        findOne: vi.fn().mockRejectedValue(new Error('load failed')),
      });
      const svc = new ConversationManagementService(em);

      await expect(
        svc.loadContext('tenant-1', 'conv-1'),
      ).rejects.toThrow('load failed');
    });
  });

  // ── createSnapshot ────────────────────────────────────────────────────

  describe('createSnapshot', () => {
    it('creates snapshot and archives messages', async () => {
      const em = buildMockEm();
      const svc = new ConversationManagementService(em);

      const snapId = await svc.createSnapshot('tenant-1', 'conv-1', 'Summary text', 5);

      expect(snapId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(em.persist).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
      expect(em.nativeUpdate).toHaveBeenCalledWith(
        expect.anything(), // ConversationMessage class
        { conversation: 'conv-1', snapshotId: null },
        { snapshotId: snapId },
      );
    });
  });

  // ── buildInjectionMessages ──────────────────────────────────────────────

  describe('buildInjectionMessages', () => {
    it('returns empty array for empty context with no snapshot', () => {
      const em = buildMockEm();
      const svc = new ConversationManagementService(em);
      const result = svc.buildInjectionMessages({
        messages: [],
        tokenEstimate: 0,
        latestSnapshotId: null,
        latestSnapshotSummary: undefined,
      });
      expect(result).toEqual([]);
    });

    it('prepends system summary message when snapshot summary exists', () => {
      const em = buildMockEm();
      const svc = new ConversationManagementService(em);
      const messages = [{ role: 'user', content: 'What is 2+2?' }];
      const result = svc.buildInjectionMessages({
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
      const em = buildMockEm();
      const svc = new ConversationManagementService(em);
      const messages = [
        { role: 'user', content: 'question' },
        { role: 'assistant', content: 'answer' },
      ];
      const result = svc.buildInjectionMessages({
        messages,
        tokenEstimate: 20,
        latestSnapshotId: null,
        latestSnapshotSummary: undefined,
      });
      expect(result).toEqual(messages);
    });

    it('does not prepend system message if snapshot id is set but summary is undefined', () => {
      const em = buildMockEm();
      const svc = new ConversationManagementService(em);
      const result = svc.buildInjectionMessages({
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
