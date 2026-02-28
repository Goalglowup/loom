import type { Tenant } from './Tenant.js';
import type { User } from './User.js';

export class TenantMembership {
  id!: string;
  tenant!: Tenant;
  user!: User;
  role!: string;
  joinedAt!: Date;
}
