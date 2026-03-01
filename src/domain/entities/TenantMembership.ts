import { randomUUID } from 'node:crypto';
import type { Tenant } from './Tenant.js';
import type { User } from './User.js';

export class TenantMembership {
  id!: string;
  tenant!: Tenant;
  user!: User;
  role!: string;
  joinedAt!: Date;

  constructor(tenant: Tenant, user: User, role: string) {
    this.id = randomUUID();
    this.tenant = tenant;
    this.user = user;
    this.role = role;
    this.joinedAt = new Date();
  }
}
