import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/core';
import { Partition } from '../entities/Partition.js';
import { Tenant } from '../entities/Tenant.js';

export class PartitionRepository {
  constructor(private readonly em: EntityManager) {}

  async findOrCreateRoot(tenantId: string, externalId: string): Promise<{ partition: Partition; isNew: boolean }> {
    const existing = await this.em.findOne(Partition, {
      tenant: tenantId,
      externalId,
      parentId: null,
    });
    if (existing) return { partition: existing, isNew: false };

    const partition = new Partition();
    partition.id = randomUUID();
    partition.tenant = this.em.getReference(Tenant, tenantId);
    partition.externalId = externalId;
    partition.parentId = null;
    partition.titleEncrypted = null;
    partition.titleIv = null;
    partition.createdAt = new Date();
    this.em.persist(partition);
    return { partition, isNew: true };
  }
}
