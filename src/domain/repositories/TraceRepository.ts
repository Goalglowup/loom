import type { EntityManager } from '@mikro-orm/core';
import { Trace } from '../entities/Trace.js';

export class TraceRepository {
  constructor(private readonly em: EntityManager) {}

  async findByTenantId(
    tenantId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<Trace[]> {
    return this.em.find(
      Trace,
      { tenant: tenantId },
      {
        orderBy: { createdAt: 'DESC' },
        limit: opts.limit ?? 50,
        offset: opts.offset ?? 0,
      },
    );
  }

  async countByTenantId(tenantId: string): Promise<number> {
    return this.em.count(Trace, { tenant: tenantId });
  }
}
