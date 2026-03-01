import { randomUUID } from 'node:crypto';
import { randomBytes } from 'node:crypto';
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
    const agent = new Agent();
    agent.id = randomUUID();
    agent.tenant = this;
    agent.name = name;
    agent.providerConfig = config?.providerConfig ?? null;
    agent.systemPrompt = config?.systemPrompt ?? null;
    agent.skills = config?.skills ?? null;
    agent.mcpEndpoints = config?.mcpEndpoints ?? null;
    agent.mergePolicies = config?.mergePolicies ?? {
      system_prompt: 'prepend',
      skills: 'merge',
      mcp_endpoints: 'merge',
    };
    agent.availableModels = config?.availableModels ?? null;
    agent.conversationsEnabled = config?.conversationsEnabled ?? false;
    agent.conversationTokenLimit = config?.conversationTokenLimit ?? 4000;
    agent.conversationSummaryModel = config?.conversationSummaryModel ?? null;
    agent.createdAt = new Date();
    agent.updatedAt = null;
    agent.apiKeys = [];
    this.agents.push(agent);
    return agent;
  }

  createInvite(createdBy: User, maxUses?: number, expiresInDays = 7): Invite {
    const invite = new Invite();
    invite.id = randomUUID();
    invite.tenant = this;
    invite.token = randomBytes(32).toString('base64url');
    invite.createdByUser = createdBy;
    invite.maxUses = maxUses ?? null;
    invite.useCount = 0;
    invite.expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);
    invite.revokedAt = null;
    invite.createdAt = new Date();
    this.invites.push(invite);
    return invite;
  }

  addMembership(user: User, role: string): TenantMembership {
    const membership = new TenantMembership();
    membership.id = randomUUID();
    membership.tenant = this;
    membership.user = user;
    membership.role = role;
    membership.joinedAt = new Date();
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
