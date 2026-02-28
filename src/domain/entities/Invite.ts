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
}
