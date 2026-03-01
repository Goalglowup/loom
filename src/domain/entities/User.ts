import { randomUUID } from 'node:crypto';
import { Tenant } from './Tenant.js';
import { Agent } from './Agent.js';

export class User {
  id!: string;
  email!: string;
  passwordHash!: string;
  createdAt!: Date;
  lastLogin!: Date | null;

  /**
   * Domain invariant: every User has a default personal Tenant and owner TenantMembership.
   */
  static create(
    email: string,
    passwordHash: string,
    tenantName?: string,
  ): { user: User; tenant: Tenant } {
    const user = new User();
    user.id = randomUUID();
    user.email = email.toLowerCase();
    user.passwordHash = passwordHash;
    user.createdAt = new Date();
    user.lastLogin = null;

    const tenant = new Tenant(user, tenantName ?? `${email.split('@')[0]}'s Workspace`);
    tenant.createAgent('Default');

    return { user, tenant };
  }
}
