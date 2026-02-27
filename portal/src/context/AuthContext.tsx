import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { User, TenantDetail, TenantMembership } from '../lib/api';
import {
  getToken, setToken, clearToken,
  getStoredTenants, setStoredTenants,
} from '../lib/auth';

interface AuthState {
  token: string | null;
  user: User | null;
  tenant: TenantDetail | null;
  tenants: TenantMembership[];
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  currentRole: string | null;
  setLoginData: (token: string, user: User, tenant: TenantDetail | null, tenants: TenantMembership[]) => void;
  switchTenant: (tenantId: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: getToken(),
    user: null,
    tenant: null,
    tenants: getStoredTenants(),
    loading: true,
  });

  const refresh = useCallback(async () => {
    const tok = getToken();
    if (!tok) {
      setState(s => ({ ...s, loading: false, user: null, tenant: null, tenants: [] }));
      return;
    }
    try {
      const { user, tenant, tenants } = await api.me(tok);
      setStoredTenants(tenants ?? []);
      setState({ token: tok, user, tenant, tenants: tenants ?? [], loading: false });
    } catch {
      clearToken();
      setState({ token: null, user: null, tenant: null, tenants: [], loading: false });
    }
  }, []);

  // Bootstrap on mount
  useEffect(() => { refresh(); }, [refresh]);

  const setLoginData = useCallback(
    (token: string, user: User, tenant: TenantDetail | null, tenants: TenantMembership[]) => {
      setToken(token);
      setStoredTenants(tenants ?? []);
      setState({ token, user, tenant: tenant as TenantDetail, tenants: tenants ?? [], loading: false });
    },
    []
  );

  const switchTenant = useCallback(async (tenantId: string) => {
    const tok = getToken();
    if (!tok) return;
    const result = await api.switchTenant(tok, { tenantId });
    setToken(result.token);
    setStoredTenants(result.tenants ?? []);
    // Refresh full state with new token
    const meResult = await api.me(result.token);
    setState({
      token: result.token,
      user: meResult.user,
      tenant: meResult.tenant,
      tenants: meResult.tenants ?? result.tenants ?? [],
      loading: false,
    });
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setState({ token: null, user: null, tenant: null, tenants: [], loading: false });
  }, []);

  const currentRole = state.tenants.find(t => t.id === state.tenant?.id)?.role
    ?? state.user?.role
    ?? null;

  return (
    <AuthContext.Provider value={{ ...state, currentRole, setLoginData, switchTenant, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
