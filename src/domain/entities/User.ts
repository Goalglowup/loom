import { randomUUID } from 'node:crypto';
import { Tenant } from './Tenant.js';
import { TenantMembership } from './TenantMembership.js';
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
  ): { user: User; tenant: Tenant; membership: TenantMembership; defaultAgent: Agent } {
    const user = new User();
    user.id = randomUUID();
    user.email = email.toLowerCase();
    user.passwordHash = passwordHash;
    user.createdAt = new Date();
    user.lastLogin = null;

    const tenant = new Tenant();
    tenant.id = randomUUID();
    tenant.name = tenantName ?? `${email}'s Workspace`;
    tenant.parentId = null;
    tenant.providerConfig = null;
    tenant.systemPrompt = null;
    tenant.skills = null;
    tenant.mcpEndpoints = null;
    tenant.status = 'active';
    tenant.availableModels = null;
    tenant.updatedAt = null;
    tenant.createdAt = new Date();
    tenant.agents = [];
    tenant.members = [];
    tenant.invites = [];

    const membership = new TenantMembership();
    membership.id = randomUUID();
    membership.user = user;
    membership.tenant = tenant;
    membership.role = 'owner';
    membership.joinedAt = new Date();

    const defaultAgent = new Agent();
    defaultAgent.id = randomUUID();
    defaultAgent.tenant = tenant;
    defaultAgent.name = 'Default';
    defaultAgent.providerConfig = null;
    defaultAgent.systemPrompt = null;
    defaultAgent.skills = null;
    defaultAgent.mcpEndpoints = null;
    defaultAgent.mergePolicies = {
      system_prompt: 'prepend',
      skills: 'merge',
      mcp_endpoints: 'merge',
    };
    defaultAgent.availableModels = null;
    defaultAgent.conversationsEnabled = false;
    defaultAgent.conversationTokenLimit = 0;
    defaultAgent.conversationSummaryModel = null;
    defaultAgent.createdAt = new Date();
    defaultAgent.updatedAt = null;
    defaultAgent.apiKeys = [];

    return { user, tenant, membership, defaultAgent };
  }
}
