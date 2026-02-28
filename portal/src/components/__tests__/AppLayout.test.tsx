import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AppLayout from '../AppLayout';

const mockLogout = vi.fn();
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// TenantSwitcher is rendered inside AppLayout; mock it to avoid its own useAuth calls
vi.mock('../TenantSwitcher', () => ({
  default: () => <div data-testid="tenant-switcher" />,
}));

import { useAuth } from '../../context/AuthContext';
import userEvent from '@testing-library/user-event';

const baseAuth = {
  user: { id: '1', email: 'user@example.com', role: 'admin' },
  tenant: { id: 't1', name: 'Acme' },
  tenants: [],
  token: 'tok',
  loading: false,
  currentRole: 'admin',
  logout: mockLogout,
  setLoginData: vi.fn(),
  switchTenant: vi.fn(),
  refresh: vi.fn(),
};

function renderLayout(authOverrides = {}) {
  vi.mocked(useAuth).mockReturnValue({ ...baseAuth, ...authOverrides });
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <AppLayout />
    </MemoryRouter>
  );
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders Loom branding', () => {
    renderLayout();
    expect(screen.getByText(/Loom/)).toBeInTheDocument();
  });

  it('renders nav links', () => {
    renderLayout();
    expect(screen.getByRole('link', { name: /Home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Traces/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /API Keys/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Agents/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sandbox/i })).toBeInTheDocument();
  });

  it('shows user email in footer', () => {
    renderLayout();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  it('shows Members and Subtenants nav links for owner role', () => {
    renderLayout({ currentRole: 'owner' });
    expect(screen.getByRole('link', { name: /Members/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Subtenants/i })).toBeInTheDocument();
  });

  it('hides Members and Subtenants for non-owner role', () => {
    renderLayout({ currentRole: 'admin' });
    expect(screen.queryByRole('link', { name: /Members/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Subtenants/i })).not.toBeInTheDocument();
  });

  it('calls logout and navigates to / on Sign out click', async () => {
    const user = userEvent.setup();
    renderLayout({ logout: mockLogout });
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(mockLogout).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('renders TenantSwitcher', () => {
    renderLayout();
    expect(screen.getByTestId('tenant-switcher')).toBeInTheDocument();
  });
});
