const API_BASE = '';  // same origin

export interface ApiError {
  error: string;
  details?: string;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
  return data as T;
}

export const api = {
  signup: (body: { tenantName?: string; email: string; password: string; inviteToken?: string }) =>
    request<{ token: string; user: User; tenant: Tenant; apiKey?: string; tenants?: TenantMembership[] }>('POST', '/v1/portal/auth/signup', body),

  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: User; tenant: Tenant; tenants: TenantMembership[] }>('POST', '/v1/portal/auth/login', body),

  me: (token: string) =>
    request<{ user: User; tenant: TenantDetail; tenants: TenantMembership[] }>('GET', '/v1/portal/me', undefined, token),

  switchTenant: (token: string, body: { tenantId: string }) =>
    request<{ token: string; user: User; tenant: Tenant; tenants: TenantMembership[] }>('POST', '/v1/portal/auth/switch-tenant', body, token),

  updateSettings: (token: string, body: ProviderConfig) =>
    request<{ providerConfig: ProviderConfigSafe }>('PATCH', '/v1/portal/settings', body, token),

  listApiKeys: (token: string) =>
    request<{ apiKeys: ApiKeyEntry[] }>('GET', '/v1/portal/api-keys', undefined, token),

  createApiKey: (token: string, body: { name: string }) =>
    request<ApiKeyCreated>('POST', '/v1/portal/api-keys', body, token),

  revokeApiKey: (token: string, id: string) =>
    request<void>('DELETE', `/v1/portal/api-keys/${id}`, undefined, token),

  // Invites
  getInviteInfo: (inviteToken: string) =>
    request<InviteInfo>('GET', `/v1/portal/invites/${inviteToken}/info`),

  listInvites: (token: string) =>
    request<{ invites: Invite[] }>('GET', '/v1/portal/invites', undefined, token),

  createInvite: (token: string, body: { maxUses?: number; expiresInHours?: number }) =>
    request<Invite>('POST', '/v1/portal/invites', body, token),

  revokeInvite: (token: string, id: string) =>
    request<void>('DELETE', `/v1/portal/invites/${id}`, undefined, token),

  // Members
  listMembers: (token: string) =>
    request<{ members: Member[] }>('GET', '/v1/portal/members', undefined, token),

  updateMemberRole: (token: string, userId: string, body: { role: string }) =>
    request<Member>('PATCH', `/v1/portal/members/${userId}`, body, token),

  removeMember: (token: string, userId: string) =>
    request<void>('DELETE', `/v1/portal/members/${userId}`, undefined, token),
};

export interface User { id: string; email: string; role: string; }
export interface Tenant { id: string; name: string; }
export interface TenantDetail extends Tenant {
  providerConfig: ProviderConfigSafe;
}
export interface TenantMembership { id: string; name: string; role: string; }
export interface ProviderConfig {
  provider: 'openai' | 'azure' | 'ollama';
  apiKey?: string;
  baseUrl?: string;
  deployment?: string;
  apiVersion?: string;
}
export interface ProviderConfigSafe {
  provider: string | null;
  baseUrl: string | null;
  deployment: string | null;
  apiVersion: string | null;
  hasApiKey: boolean;
}
export interface ApiKeyEntry {
  id: string;
  name: string;
  keyPrefix: string;
  status: 'active' | 'revoked';
  createdAt: string;
  revokedAt: string | null;
}
export interface ApiKeyCreated extends ApiKeyEntry { key: string; }
export interface InviteInfo {
  tenantName: string;
  expiresAt: string;
  isValid: boolean;
}
export interface Invite {
  id: string;
  token: string;
  inviteUrl: string;
  maxUses: number | null;
  useCount: number;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  createdBy?: { id: string; email: string };
  isActive?: boolean;
}
export interface Member {
  id: string;
  email: string;
  role: string;
  joinedAt: string;
  lastLogin: string | null;
}
