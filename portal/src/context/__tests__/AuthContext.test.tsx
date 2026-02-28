import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';

// Mock api and auth lib
vi.mock('../../lib/api', () => ({
  api: {
    me: vi.fn(),
    switchTenant: vi.fn(),
  },
}));

vi.mock('../../lib/auth', () => ({
  getToken: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
  getStoredTenants: vi.fn().mockReturnValue([]),
  setStoredTenants: vi.fn(),
}));

import { api } from '../../lib/api';
import { getToken, clearToken, setToken, getStoredTenants } from '../../lib/auth';

function ConsumerComponent() {
  const auth = useAuth();
  if (auth.loading) return <div>loading</div>;
  return (
    <div>
      <span data-testid="user">{auth.user?.email ?? 'no-user'}</span>
      <span data-testid="tenant">{auth.tenant?.name ?? 'no-tenant'}</span>
      <span data-testid="role">{auth.currentRole ?? 'no-role'}</span>
      <button onClick={auth.logout}>logout</button>
    </div>
  );
}

describe('AuthContext / AuthProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getStoredTenants).mockReturnValue([]);
  });

  it('shows loading initially then resolves with user data', async () => {
    vi.mocked(getToken).mockReturnValue('tok-123');
    vi.mocked(api.me).mockResolvedValue({
      user: { id: '1', email: 'alice@example.com', role: 'admin' },
      tenant: { id: 't1', name: 'Acme', providerConfig: null },
      tenants: [{ id: 't1', name: 'Acme', role: 'owner' }],
    });

    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>
    );

    // Initially loading
    expect(screen.getByText('loading')).toBeInTheDocument();

    // Then resolves
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('alice@example.com'));
    expect(screen.getByTestId('tenant')).toHaveTextContent('Acme');
  });

  it('resolves with no user when no token', async () => {
    vi.mocked(getToken).mockReturnValue(null);

    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('no-user'));
    expect(api.me).not.toHaveBeenCalled();
  });

  it('clears token on api.me failure', async () => {
    vi.mocked(getToken).mockReturnValue('bad-token');
    vi.mocked(api.me).mockRejectedValue(new Error('Unauthorized'));

    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('no-user'));
    expect(clearToken).toHaveBeenCalled();
  });

  it('logout clears auth state', async () => {
    vi.mocked(getToken).mockReturnValue('tok-123');
    vi.mocked(api.me).mockResolvedValue({
      user: { id: '1', email: 'alice@example.com', role: 'admin' },
      tenant: { id: 't1', name: 'Acme', providerConfig: null },
      tenants: [],
    });

    const { getByRole } = render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('alice@example.com'));

    getByRole('button', { name: /logout/i }).click();

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('no-user'));
    expect(clearToken).toHaveBeenCalled();
  });

  it('throws when useAuth used outside AuthProvider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ConsumerComponent />)).toThrow('useAuth must be used inside AuthProvider');
    consoleSpy.mockRestore();
  });

  it('exposes currentRole from tenants list', async () => {
    vi.mocked(getToken).mockReturnValue('tok');
    vi.mocked(api.me).mockResolvedValue({
      user: { id: '1', email: 'alice@example.com', role: 'admin' },
      tenant: { id: 't1', name: 'Acme', providerConfig: null },
      tenants: [{ id: 't1', name: 'Acme', role: 'owner' }],
    });

    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('owner'));
  });

  it('setLoginData updates state with provided values', async () => {
    vi.mocked(getToken).mockReturnValue(null);

    function SetLoginConsumer() {
      const auth = useAuth();
      if (auth.loading) return <div>loading</div>;
      return (
        <div>
          <span data-testid="user">{auth.user?.email ?? 'no-user'}</span>
          <button
            onClick={() =>
              auth.setLoginData('new-token', { id: '2', email: 'bob@example.com', role: 'user' }, null, [])
            }
          >
            login
          </button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <SetLoginConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('no-user'));

    screen.getByRole('button', { name: /login/i }).click();

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('bob@example.com'));
    expect(setToken).toHaveBeenCalledWith('new-token');
  });
});
