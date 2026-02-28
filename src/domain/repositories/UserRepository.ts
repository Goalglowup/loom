import type { EntityManager } from '@mikro-orm/core';
import { User } from '../entities/User.js';

export class UserRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<User | null> {
    return this.em.findOne(User, { id });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.em.findOne(User, { email: email.toLowerCase() });
  }
}
