import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/core';
import { Conversation } from '../entities/Conversation.js';
import { Tenant } from '../entities/Tenant.js';
import { Agent } from '../entities/Agent.js';
import { Partition } from '../entities/Partition.js';

export class ConversationRepository {
  constructor(private readonly em: EntityManager) {}

  async findWithMessages(id: string): Promise<Conversation | null> {
    return this.em.findOne(Conversation, { id }, { populate: ['messages'] });
  }

  async findWithLatestSnapshot(id: string): Promise<Conversation | null> {
    return this.em.findOne(Conversation, { id }, { populate: ['snapshots', 'messages'] });
  }

  async findOrCreate(params: {
    tenantId: string;
    agentId: string | null;
    partitionId: string | null;
    externalId: string;
  }): Promise<Conversation> {
    const existing = await this.em.findOne(Conversation, {
      tenant: params.tenantId,
      externalId: params.externalId,
      ...(params.partitionId ? { partition: params.partitionId } : { partition: null }),
    });
    if (existing) return existing;

    const now = new Date();
    const conv = new Conversation();
    conv.id = randomUUID();
    conv.externalId = params.externalId;
    conv.createdAt = now;
    conv.lastActiveAt = now;
    // Relations are references — assign by id via em.getReference
    conv.tenant = this.em.getReference(Tenant, params.tenantId);
    conv.agent = params.agentId ? this.em.getReference(Agent, params.agentId) : null;
    conv.partition = params.partitionId
      ? this.em.getReference(Partition, params.partitionId)
      : null;
    this.em.persist(conv);
    return conv;
  }
}
