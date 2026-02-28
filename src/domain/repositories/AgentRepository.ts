import type { EntityManager } from '@mikro-orm/core';
import { Agent } from '../entities/Agent.js';

export class AgentRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<Agent | null> {
    return this.em.findOne(Agent, { id }, { populate: ['tenant'] });
  }

  async findByTenantId(tenantId: string): Promise<Agent[]> {
    return this.em.find(Agent, { tenant: tenantId });
  }
}
