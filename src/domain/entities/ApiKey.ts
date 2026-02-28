import type { Agent } from './Agent.js';
import type { Tenant } from './Tenant.js';

export class ApiKey {
  id!: string;
  tenant!: Tenant;
  agent!: Agent;
  keyHash!: string;
  keyPrefix!: string;
  name!: string;
  status!: string;
  revokedAt!: Date | null;
  createdAt!: Date;
}
