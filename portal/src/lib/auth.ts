const TOKEN_KEY = 'loom_portal_token';
const TENANTS_KEY = 'loom_portal_tenants';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TENANTS_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export interface StoredTenant { id: string; name: string; role: string; }

export function getStoredTenants(): StoredTenant[] {
  try {
    return JSON.parse(localStorage.getItem(TENANTS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function setStoredTenants(tenants: StoredTenant[]): void {
  localStorage.setItem(TENANTS_KEY, JSON.stringify(tenants));
}
