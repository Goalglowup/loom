import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import {
  getToken, setToken, clearToken, isAuthenticated,
  getStoredTenants, setStoredTenants,
} from '../auth';

// Provide a functional localStorage mock since jsdom's may be non-standard in this env
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = value; },
  removeItem: (key: string) => { delete localStorageStore[key]; },
  clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); },
};

beforeAll(() => {
  vi.stubGlobal('localStorage', localStorageMock);
});

describe('auth lib', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('getToken returns null when not set', () => {
    expect(getToken()).toBeNull();
  });

  it('setToken / getToken round-trips', () => {
    setToken('my-token');
    expect(getToken()).toBe('my-token');
  });

  it('clearToken removes token', () => {
    setToken('tok');
    clearToken();
    expect(getToken()).toBeNull();
  });

  it('isAuthenticated is false when no token', () => {
    expect(isAuthenticated()).toBe(false);
  });

  it('isAuthenticated is true when token set', () => {
    setToken('tok');
    expect(isAuthenticated()).toBe(true);
  });

  it('getStoredTenants returns empty array when not set', () => {
    expect(getStoredTenants()).toEqual([]);
  });

  it('setStoredTenants / getStoredTenants round-trips', () => {
    const tenants = [{ id: 't1', name: 'Acme', role: 'owner' }];
    setStoredTenants(tenants);
    expect(getStoredTenants()).toEqual(tenants);
  });

  it('clearToken also removes tenants', () => {
    setStoredTenants([{ id: 't1', name: 'Acme', role: 'owner' }]);
    setToken('tok');
    clearToken();
    expect(getStoredTenants()).toEqual([]);
  });

  it('getStoredTenants returns empty array on malformed JSON', () => {
    localStorage.setItem('loom_portal_tenants', 'not-json');
    expect(getStoredTenants()).toEqual([]);
  });
});
