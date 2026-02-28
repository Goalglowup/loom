import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { Tenant } from '../src/domain/entities/Tenant.js';
import { Agent } from '../src/domain/entities/Agent.js';
import { Conversation } from '../src/domain/entities/Conversation.js';
import type { User } from '../src/domain/entities/User.js';

// ── Tenant ──────────────────────────────────────────────────────────────────

describe('Tenant', () => {
  let tenant: Tenant;

  beforeEach(() => {
    tenant = new Tenant();
    tenant.id = 'tenant-1';
    tenant.name = 'Test Tenant';
    tenant.agents = [];
    tenant.members = [];
    tenant.invites = [];
  });

  describe('createAgent', () => {
    it('creates an Agent with correct defaults', () => {
      const agent = tenant.createAgent('My Agent');
      expect(agent.name).toBe('My Agent');
      expect(agent.conversationsEnabled).toBe(false);
      expect(agent.mergePolicies).toEqual({
        system_prompt: 'prepend',
        skills: 'merge',
        mcp_endpoints: 'merge',
      });
    });

    it('sets provided config fields', () => {
      const agent = tenant.createAgent('Configured Agent', {
        systemPrompt: 'You are helpful.',
        skills: [{ name: 'search' }],
        conversationsEnabled: true,
        conversationTokenLimit: 8000,
        conversationSummaryModel: 'gpt-4',
      });
      expect(agent.systemPrompt).toBe('You are helpful.');
      expect(agent.skills).toEqual([{ name: 'search' }]);
      expect(agent.conversationsEnabled).toBe(true);
      expect(agent.conversationTokenLimit).toBe(8000);
      expect(agent.conversationSummaryModel).toBe('gpt-4');
    });

    it('pushes agent to tenant.agents collection', () => {
      expect(tenant.agents).toHaveLength(0);
      const agent = tenant.createAgent('Agent A');
      expect(tenant.agents).toHaveLength(1);
      expect(tenant.agents[0]).toBe(agent);
    });
  });

  describe('createInvite', () => {
    const user = { id: 'user-1' } as User;

    it('creates invite with correct expiresAt (default 7 days) and zero useCount', () => {
      const before = Date.now();
      const invite = tenant.createInvite(user);
      const after = Date.now();
      expect(invite.useCount).toBe(0);
      const expectedMs = 7 * 86_400_000;
      expect(invite.expiresAt.getTime()).toBeGreaterThanOrEqual(before + expectedMs);
      expect(invite.expiresAt.getTime()).toBeLessThanOrEqual(after + expectedMs);
    });

    it('accepts custom maxUses and expiresInDays', () => {
      const before = Date.now();
      const invite = tenant.createInvite(user, 5, 14);
      const after = Date.now();
      expect(invite.maxUses).toBe(5);
      const expectedMs = 14 * 86_400_000;
      expect(invite.expiresAt.getTime()).toBeGreaterThanOrEqual(before + expectedMs);
      expect(invite.expiresAt.getTime()).toBeLessThanOrEqual(after + expectedMs);
    });
  });

  describe('addMember', () => {
    const user = { id: 'user-1' } as User;

    it('creates TenantMembership with correct role', () => {
      const membership = tenant.addMember(user, 'admin');
      expect(membership.role).toBe('admin');
      expect(membership.user).toBe(user);
    });

    it('pushes to tenant.members collection', () => {
      expect(tenant.members).toHaveLength(0);
      const membership = tenant.addMember(user, 'member');
      expect(tenant.members).toHaveLength(1);
      expect(tenant.members[0]).toBe(membership);
    });
  });

  describe('createSubtenant', () => {
    it('creates child with parentId set to parent id and status active', () => {
      const child = tenant.createSubtenant('Child Tenant');
      expect(child.name).toBe('Child Tenant');
      expect(child.parentId).toBe(tenant.id);
      expect(child.status).toBe('active');
    });
  });
});

// ── Agent ───────────────────────────────────────────────────────────────────

describe('Agent', () => {
  let agent: Agent;
  let tenant: Tenant;

  beforeEach(() => {
    tenant = new Tenant();
    tenant.id = 'tenant-1';
    tenant.name = 'Test Tenant';

    agent = new Agent();
    agent.id = 'agent-1';
    agent.tenant = tenant;
    agent.name = 'Test Agent';
    agent.conversationsEnabled = false;
    agent.conversationTokenLimit = 4000;
    agent.conversationSummaryModel = null;
    agent.apiKeys = [];
  });

  describe('enableConversations', () => {
    it('sets conversationsEnabled=true, tokenLimit, and summaryModel', () => {
      agent.enableConversations(8000, 'gpt-4');
      expect(agent.conversationsEnabled).toBe(true);
      expect(agent.conversationTokenLimit).toBe(8000);
      expect(agent.conversationSummaryModel).toBe('gpt-4');
    });

    it('defaults summaryModel to null when not provided', () => {
      agent.enableConversations(4000);
      expect(agent.conversationsEnabled).toBe(true);
      expect(agent.conversationSummaryModel).toBeNull();
    });
  });

  describe('disableConversations', () => {
    it('sets conversationsEnabled=false', () => {
      agent.conversationsEnabled = true;
      agent.disableConversations();
      expect(agent.conversationsEnabled).toBe(false);
    });
  });

  describe('createApiKey', () => {
    it('returns { entity, rawKey } where rawKey starts with loom_sk_', () => {
      const { entity, rawKey } = agent.createApiKey('My Key');
      expect(rawKey).toMatch(/^loom_sk_/);
      expect(entity).toBeDefined();
    });

    it('sets correct keyHash (SHA-256 of rawKey)', () => {
      const { entity, rawKey } = agent.createApiKey('My Key');
      const expectedHash = createHash('sha256').update(rawKey).digest('hex');
      expect(entity.keyHash).toBe(expectedHash);
    });

    it('sets correct keyPrefix (first 12 chars of rawKey)', () => {
      const { entity, rawKey } = agent.createApiKey('My Key');
      expect(entity.keyPrefix).toBe(rawKey.slice(0, 12));
    });

    it('sets status to active', () => {
      const { entity } = agent.createApiKey('My Key');
      expect(entity.status).toBe('active');
    });

    it('pushes to agent.apiKeys collection', () => {
      expect(agent.apiKeys).toHaveLength(0);
      const { entity } = agent.createApiKey('My Key');
      expect(agent.apiKeys).toHaveLength(1);
      expect(agent.apiKeys[0]).toBe(entity);
    });
  });
});

// ── Conversation ─────────────────────────────────────────────────────────────

describe('Conversation', () => {
  let conversation: Conversation;

  beforeEach(() => {
    conversation = new Conversation();
    conversation.id = 'conv-1';
    conversation.externalId = 'ext-1';
    conversation.createdAt = new Date();
    conversation.lastActiveAt = new Date(0);
    conversation.messages = [];
    conversation.snapshots = [];
  });

  describe('addMessage', () => {
    it('creates message with correct role, contentEncrypted, contentIv', () => {
      const msg = conversation.addMessage('user', 'enc-data', 'iv-data');
      expect(msg.role).toBe('user');
      expect(msg.contentEncrypted).toBe('enc-data');
      expect(msg.contentIv).toBe('iv-data');
    });

    it('updates conversation.lastActiveAt', () => {
      const before = Date.now();
      const msg = conversation.addMessage('user', 'enc', 'iv');
      expect(conversation.lastActiveAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(conversation.lastActiveAt).toBe(msg.createdAt);
    });

    it('pushes to conversation.messages', () => {
      expect(conversation.messages).toHaveLength(0);
      const msg = conversation.addMessage('assistant', 'enc', 'iv');
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0]).toBe(msg);
    });
  });

  describe('createSnapshot', () => {
    it('creates snapshot with correct fields and pushes to conversation.snapshots', () => {
      expect(conversation.snapshots).toHaveLength(0);
      const snap = conversation.createSnapshot('sum-enc', 'sum-iv', 10);
      expect(snap.summaryEncrypted).toBe('sum-enc');
      expect(snap.summaryIv).toBe('sum-iv');
      expect(snap.messagesArchived).toBe(10);
      expect(conversation.snapshots).toHaveLength(1);
      expect(conversation.snapshots[0]).toBe(snap);
    });
  });

  describe('needsSnapshot', () => {
    it('returns false when total tokenEstimate < limit', () => {
      conversation.addMessage('user', 'e', 'i', 100);
      conversation.addMessage('assistant', 'e', 'i', 200);
      expect(conversation.needsSnapshot(400)).toBe(false);
    });

    it('returns true when total tokenEstimate >= limit', () => {
      conversation.addMessage('user', 'e', 'i', 200);
      conversation.addMessage('assistant', 'e', 'i', 200);
      expect(conversation.needsSnapshot(400)).toBe(true);
    });
  });
});
