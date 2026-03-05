export const ADMIN_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export interface AdminTenant {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface AdminApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  status: 'active' | 'revoked';
  created_at: string;
  revoked_at: string | null;
}

export interface AdminProviderConfig {
  provider: 'openai' | 'azure' | 'ollama';
  baseUrl?: string;
  hasApiKey: boolean;
  deployment?: string;
  apiVersion?: string;
}

export interface AdminSettings {
  signupsEnabled: boolean;
  updatedAt: string;
  updatedByAdminId: string | null;
}

export interface AdminBetaSignup {
  id: string;
  email: string;
  name: string | null;
  inviteCode: string | null;
  approvedAt: string | null;
  approvedByAdminId: string | null;
  inviteUsedAt: string | null;
  createdAt: string;
  status: 'pending' | 'approved' | 'used';
}

export function getAdminToken(): string | null {
  return localStorage.getItem('loom_admin_token');
}

export function setAdminToken(token: string): void {
  localStorage.setItem('loom_admin_token', token);
}

export function clearAdminToken(): void {
  localStorage.removeItem('loom_admin_token');
}

export function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getAdminToken();
  
  if (!token && !path.endsWith('/login')) {
    clearAdminToken();
    window.location.href = '/dashboard/admin';
    throw new Error('Admin token missing');
  }

  const url = `${ADMIN_BASE}${path}`;
  const headers: Record<string, string> = {
    ...adminAuthHeaders(),
    ...(options.headers as Record<string, string> || {}),
  };

  // Only set Content-Type if there's a body
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearAdminToken();
    window.location.href = '/dashboard/admin';
    throw new Error('Admin session expired');
  }

  return response;
}

// Settings API
export async function getSettings(): Promise<AdminSettings> {
  const response = await adminFetch('/v1/admin/settings');
  if (!response.ok) {
    throw new Error('Failed to fetch settings');
  }
  return response.json();
}

export async function updateSettings(signupsEnabled: boolean): Promise<AdminSettings> {
  const response = await adminFetch('/v1/admin/settings', {
    method: 'PUT',
    body: JSON.stringify({ signupsEnabled }),
  });
  if (!response.ok) {
    throw new Error('Failed to update settings');
  }
  return response.json();
}

// Beta Signups API
export async function getBetaSignups(): Promise<AdminBetaSignup[]> {
  const response = await adminFetch('/v1/admin/beta/signups');
  if (!response.ok) {
    throw new Error('Failed to fetch beta signups');
  }
  const data = await response.json();
  return data.signups;
}

export async function approveBetaSignup(id: string): Promise<AdminBetaSignup> {
  const response = await adminFetch(`/v1/admin/beta/approve/${id}`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to approve beta signup');
  }
  return response.json();
}
