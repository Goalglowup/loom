import type { EntityManager } from '@mikro-orm/core';
import { AdminUser } from '../entities/AdminUser.js';

export class AdminUserRepository {
  constructor(private readonly em: EntityManager) {}

  async findByUsername(username: string): Promise<AdminUser | null> {
    return this.em.findOne(AdminUser, { username });
  }

  async findById(id: string): Promise<AdminUser | null> {
    return this.em.findOne(AdminUser, { id });
  }
}
