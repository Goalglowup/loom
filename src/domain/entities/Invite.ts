import { randomUUID, randomBytes } from 'node:crypto';
import type { Tenant } from './Tenant.js';
import type { User } from './User.js';

export class Invite {
  id!: string;
  tenant!: Tenant;
  token!: string;
  createdByUser!: User;
  maxUses!: number | null;
  useCount!: number;
  expiresAt!: Date;
  revokedAt!: Date | null;
  createdAt!: Date;

  constructor(tenant: Tenant, createdBy: User, maxUses: number | null = null, expiresInDays = 7) {
    this.id = randomUUID();
    this.tenant = tenant;
    this.token = randomBytes(32).toString('base64url');
    this.createdByUser = createdBy;
    this.maxUses = maxUses;
    this.useCount = 0;
    this.expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);
    this.revokedAt = null;
    this.createdAt = new Date();
  }
}
