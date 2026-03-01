import { randomUUID } from 'node:crypto';
import type { TenantMembership } from './TenantMembership.js';

export class User {
  id!: string;
  email!: string;
  passwordHash!: string;
  createdAt!: Date;
  lastLogin!: Date | null;

  memberships!: TenantMembership[];

  constructor(email: string, passwordHash: string) {
    this.id = randomUUID();
    this.email = email.toLowerCase();
    this.passwordHash = passwordHash;
    this.createdAt = new Date();
    this.lastLogin = null;
  }
}
