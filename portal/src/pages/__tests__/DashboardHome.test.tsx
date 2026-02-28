import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DashboardHome from '../DashboardHome';

vi.mock('../../lib/api', () => ({
  api: {
    me: vi.fn(),
  },
}));

vi.mock('../../lib/auth', () => ({
  getToken: vi.fn(),
}));

import { api } from '../../lib/api';
import { getToken } from '../../lib/auth';

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardHome />
    </MemoryRouter>
  );
}

describe('DashboardHome', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows loading state initially', () => {
    vi.mocked(getToken).mockReturnValue('tok');
    vi.mocked(api.me).mockImplementation(() => new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows welcome message with tenant name on success', async () => {
    vi.mocked(getToken).mockReturnValue('tok');
    vi.mocked(api.me).mockResolvedValue({
      user: { id: '1', email: 'alice@example.com', role: 'admin' },
      tenant: { id: 't1', name: 'Acme Corp', providerConfig: null },
      tenants: [],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/Welcome, Acme Corp/i)).toBeInTheDocument());
    expect(screen.getByText(/Signed in as alice@example\.com/i)).toBeInTheDocument();
  });

  it('shows provider not configured warning when no provider', async () => {
    vi.mocked(getToken).mockReturnValue('tok');
    vi.mocked(api.me).mockResolvedValue({
      user: { id: '1', email: 'alice@example.com', role: 'admin' },
      tenant: { id: 't1', name: 'Acme', providerConfig: null },
      tenants: [],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/not configured/i)).toBeInTheDocument());
    expect(screen.getByText(/configure a provider/i)).toBeInTheDocument();
  });

  it('shows provider configured when provider is set', async () => {
    vi.mocked(getToken).mockReturnValue('tok');
    vi.mocked(api.me).mockResolvedValue({
      user: { id: '1', email: 'alice@example.com', role: 'admin' },
      tenant: {
        id: 't1',
        name: 'Acme',
        providerConfig: { provider: 'openai', baseUrl: null, deployment: null, apiVersion: null, hasApiKey: true },
      },
      tenants: [],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/openai configured/i)).toBeInTheDocument());
  });

  it('shows error message when api.me fails', async () => {
    vi.mocked(getToken).mockReturnValue('tok');
    vi.mocked(api.me).mockRejectedValue(new Error('Unauthorized'));
    renderPage();
    await waitFor(() => expect(screen.getByText('Unauthorized')).toBeInTheDocument());
  });

  it('renders quick links to settings and api-keys', async () => {
    vi.mocked(getToken).mockReturnValue('tok');
    vi.mocked(api.me).mockResolvedValue({
      user: { id: '1', email: 'alice@example.com', role: 'admin' },
      tenant: { id: 't1', name: 'Acme', providerConfig: null },
      tenants: [],
    });
    renderPage();
    await waitFor(() => expect(screen.getByRole('link', { name: /provider settings/i })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /api keys/i })).toBeInTheDocument();
  });
});
