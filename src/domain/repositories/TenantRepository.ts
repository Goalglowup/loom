import type { EntityManager } from '@mikro-orm/core';
import { Tenant } from '../entities/Tenant.js';

export class TenantRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<Tenant | null> {
    return this.em.findOne(Tenant, { id });
  }

  async findByIdWithAgents(id: string): Promise<Tenant | null> {
    return this.em.findOne(Tenant, { id }, { populate: ['agents'] });
  }

  async findAll(): Promise<Tenant[]> {
    return this.em.find(Tenant, {});
  }
}
