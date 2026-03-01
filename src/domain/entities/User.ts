import { randomUUID } from 'node:crypto';
import { Tenant } from './Tenant.js';

export class User {
  id!: string;
  email!: string;
  passwordHash!: string;
  createdAt!: Date;
  lastLogin!: Date | null;

  /** Set during construction; undefined after ORM hydration (not an ORM column). */
  tenant?: Tenant;

  /**
   * Domain invariant: every User has a default personal Tenant and owner TenantMembership.
   */
  constructor(email: string, passwordHash: string, tenantName?: string) {
    this.id = randomUUID();
    this.email = email.toLowerCase();
    this.passwordHash = passwordHash;
    this.createdAt = new Date();
    this.lastLogin = null;

    this.tenant = new Tenant(this, tenantName ?? `${email.split('@')[0]}'s Workspace`);
    this.tenant.createAgent('Default');
  }
}
