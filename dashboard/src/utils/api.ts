export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

export function getApiKey(): string | null {
  return localStorage.getItem('loom_api_key');
}

export function setApiKey(key: string): void {
  localStorage.setItem('loom_api_key', key);
}

export function authHeaders(): Record<string, string> {
  const key = getApiKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}
