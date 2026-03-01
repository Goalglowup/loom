import { randomUUID } from 'node:crypto';
import { Agent } from './Agent.js';
import { TenantMembership } from './TenantMembership.js';
import { Invite } from './Invite.js';
import type { User } from './User.js';

export class Tenant {
  id!: string;
  name!: string;
  parentId!: string | null;
  providerConfig!: any | null;
  systemPrompt!: string | null;
  skills!: any[] | null;
  mcpEndpoints!: any[] | null;
  status!: string;
  availableModels!: any[] | null;
  updatedAt!: Date | null;
  createdAt!: Date;

  agents: Agent[] = [];
  members: TenantMembership[] = [];
  invites: Invite[] = [];

  constructor(owner: User, name: string) {
    this.id = randomUUID();
    this.name = name;
    this.parentId = null;
    this.providerConfig = null;
    this.systemPrompt = null;
    this.skills = null;
    this.mcpEndpoints = null;
    this.status = 'active';
    this.availableModels = null;
    this.updatedAt = null;
    this.createdAt = new Date();
    this.agents = [];
    this.members = [];
    this.invites = [];
    this.addMembership(owner, 'owner');
  }

  createAgent(name: string, config?: Partial<Agent>): Agent {
    const agent = new Agent(this, name, config);
    this.agents.push(agent);
    return agent;
  }

  createInvite(createdBy: User, maxUses?: number, expiresInDays = 7): Invite {
    const invite = new Invite(this, createdBy, maxUses ?? null, expiresInDays);
    this.invites.push(invite);
    return invite;
  }

  addMembership(user: User, role: string): TenantMembership {
    const membership = new TenantMembership(this, user, role);
    this.members.push(membership);
    return membership;
  }

  createSubtenant(name: string): Tenant {
    const child = Object.assign(Object.create(Tenant.prototype) as Tenant, {
      id: randomUUID(),
      name,
      parentId: this.id,
      providerConfig: null,
      systemPrompt: null,
      skills: null,
      mcpEndpoints: null,
      status: 'active',
      availableModels: null,
      updatedAt: null,
      createdAt: new Date(),
      agents: [],
      members: [],
      invites: [],
    });
    // Inherit parent member list
    for (const m of this.members) {
      child.addMembership(m.user, m.role);
    }
    return child;
  }
}
