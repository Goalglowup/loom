import { createHash } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/core';
import { ApiKey } from '../entities/ApiKey.js';

export class ApiKeyRepository {
  constructor(private readonly em: EntityManager) {}

  async findByKeyHash(rawKey: string): Promise<ApiKey | null> {
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    return this.em.findOne(ApiKey, { keyHash, status: 'active' }, { populate: ['agent', 'tenant'] });
  }

  async findById(id: string): Promise<ApiKey | null> {
    return this.em.findOne(ApiKey, { id }, { populate: ['agent', 'tenant'] });
  }

  async findByTenantId(tenantId: string): Promise<ApiKey[]> {
    return this.em.find(ApiKey, { tenant: tenantId }, { populate: ['agent'] });
  }
}
