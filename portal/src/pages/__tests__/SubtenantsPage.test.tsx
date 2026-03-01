import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SubtenantsPage from '../SubtenantsPage';

vi.mock('../../lib/api', () => ({
  api: {
    listSubtenants: vi.fn(),
    createSubtenant: vi.fn(),
  },
}));

vi.mock('../../lib/auth', () => ({
  getToken: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { api } from '../../lib/api';
import { getToken } from '../../lib/auth';
import { useAuth } from '../../context/AuthContext';

const mockSubtenants = [
  { id: 'st1', name: 'Engineering', status: 'active' as const, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'st2', name: 'Sales', status: 'active' as const, createdAt: '2024-01-02T00:00:00Z' },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <SubtenantsPage />
    </MemoryRouter>
  );
}

describe('SubtenantsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getToken).mockReturnValue('tok');
    vi.mocked(useAuth).mockReturnValue({ currentRole: 'owner', user: { id: 'u1', email: 'alice@example.com' } } as any);
  });

  it('shows loading state initially', () => {
    vi.mocked(api.listSubtenants).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders subtenants list on success', async () => {
    vi.mocked(api.listSubtenants).mockResolvedValue({ subtenants: mockSubtenants });
    renderPage();
    await waitFor(() => expect(screen.getByText('Engineering')).toBeInTheDocument());
    expect(screen.getByText('Sales')).toBeInTheDocument();
  });

  it('shows empty state when no subtenants', async () => {
    vi.mocked(api.listSubtenants).mockResolvedValue({ subtenants: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no subtenants yet/i)).toBeInTheDocument());
  });

  it('shows error message on fetch failure', async () => {
    vi.mocked(api.listSubtenants).mockRejectedValue(new Error('Network error'));
    renderPage();
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
  });

  it('shows create button for owners', async () => {
    vi.mocked(api.listSubtenants).mockResolvedValue({ subtenants: [] });
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /\+ Create Subtenant/i })).toBeInTheDocument());
  });

  it('does not show create button for non-owners', async () => {
    vi.mocked(useAuth).mockReturnValue({ currentRole: 'member', user: { id: 'u2', email: 'bob@example.com' } } as any);
    vi.mocked(api.listSubtenants).mockResolvedValue({ subtenants: mockSubtenants });
    renderPage();
    await waitFor(() => expect(screen.getByText('Engineering')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /\+ Create Subtenant/i })).not.toBeInTheDocument();
  });

  it('creates subtenant when form is submitted', async () => {
    vi.mocked(api.listSubtenants).mockResolvedValue({ subtenants: [] });
    vi.mocked(api.createSubtenant).mockResolvedValue({
      subtenant: { id: 'st3', name: 'Marketing', status: 'active', createdAt: '2024-01-03T00:00:00Z' },
    });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /\+ Create Subtenant/i })).toBeInTheDocument());
    
    await user.click(screen.getByRole('button', { name: /\+ Create Subtenant/i }));
    await waitFor(() => expect(screen.getByPlaceholderText(/e\.g\. engineering team/i)).toBeInTheDocument());
    
    await user.type(screen.getByPlaceholderText(/e\.g\. engineering team/i), 'Marketing');
    await user.click(screen.getByRole('button', { name: /^create$/i }));
    
    await waitFor(() => expect(api.createSubtenant).toHaveBeenCalledWith('tok', 'Marketing'));
  });
});
