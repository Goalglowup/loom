import { randomUUID, createHash, randomBytes } from 'node:crypto';
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

  /** Raw key — available immediately after construction, never stored in DB */
  readonly rawKey: string;

  constructor(agent: Agent, name: string) {
    const rawKey = 'loom_sk_' + randomBytes(24).toString('base64url');
    this.id = randomUUID();
    this.tenant = agent.tenant;
    this.agent = agent;
    this.keyHash = createHash('sha256').update(rawKey).digest('hex');
    this.keyPrefix = rawKey.slice(0, 12);
    this.name = name;
    this.status = 'active';
    this.revokedAt = null;
    this.createdAt = new Date();
    this.rawKey = rawKey;
  }
}
