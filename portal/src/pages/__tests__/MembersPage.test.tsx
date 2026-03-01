import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MembersPage from '../MembersPage';

vi.mock('../../lib/api', () => ({
  api: {
    listMembers: vi.fn(),
    listInvites: vi.fn(),
    createInvite: vi.fn(),
    revokeInvite: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
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

const mockMembers = [
  { id: 'u1', email: 'alice@example.com', role: 'owner', joinedAt: '2024-01-01T00:00:00Z' },
  { id: 'u2', email: 'bob@example.com', role: 'member', joinedAt: '2024-01-02T00:00:00Z' },
];

const mockInvites = [
  { id: 'i1', token: 'abc123', inviteUrl: 'http://example.com/invite/abc123', maxUses: null, useCount: 0, expiresAt: '2024-12-31T00:00:00Z', revokedAt: null, isActive: true },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <MembersPage />
    </MemoryRouter>
  );
}

describe('MembersPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getToken).mockReturnValue('tok');
    vi.mocked(useAuth).mockReturnValue({ currentRole: 'owner', user: { id: 'u1', email: 'alice@example.com' } } as any);
  });

  it('shows loading state initially', () => {
    vi.mocked(api.listMembers).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.listInvites).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0);
  });

  it('renders members list on success', async () => {
    vi.mocked(api.listMembers).mockResolvedValue({ members: mockMembers });
    vi.mocked(api.listInvites).mockResolvedValue({ invites: mockInvites });
    renderPage();
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeInTheDocument());
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('renders invites list for owner', async () => {
    vi.mocked(api.listMembers).mockResolvedValue({ members: mockMembers });
    vi.mocked(api.listInvites).mockResolvedValue({ invites: mockInvites });
    renderPage();
    await waitFor(() => expect(screen.getByText(/…abc123/)).toBeInTheDocument());
  });

  it('shows error message on fetch failure', async () => {
    vi.mocked(api.listMembers).mockRejectedValue(new Error('Fetch failed'));
    vi.mocked(api.listInvites).mockResolvedValue({ invites: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Fetch failed')).toBeInTheDocument());
  });

  it('creates invite when form is submitted', async () => {
    vi.mocked(api.listMembers).mockResolvedValue({ members: mockMembers });
    vi.mocked(api.listInvites).mockResolvedValue({ invites: [] });
    vi.mocked(api.createInvite).mockResolvedValue({
      id: 'i2',
      token: 'newtoken',
      inviteUrl: 'http://example.com/invite/newtoken',
      maxUses: null,
      useCount: 0,
      expiresAt: '2024-12-31T00:00:00Z',
      revokedAt: null,
      isActive: true,
    });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /\+ Create Invite/i })).toBeInTheDocument());
    
    await user.click(screen.getByRole('button', { name: /\+ Create Invite/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^create link$/i })).toBeInTheDocument());
    
    await user.click(screen.getByRole('button', { name: /^create link$/i }));
    
    await waitFor(() => expect(api.createInvite).toHaveBeenCalled());
  });

  it('revokes invite when revoke button is clicked', async () => {
    vi.mocked(api.listMembers).mockResolvedValue({ members: mockMembers });
    vi.mocked(api.listInvites).mockResolvedValue({ invites: mockInvites });
    vi.mocked(api.revokeInvite).mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText(/…abc123/)).toBeInTheDocument());
    
    const revokeButton = screen.getByRole('button', { name: /revoke/i });
    await user.click(revokeButton);
    
    await waitFor(() => expect(api.revokeInvite).toHaveBeenCalledWith('tok', 'i1'));
  });

  it('does not show invites section for non-owner', async () => {
    vi.mocked(useAuth).mockReturnValue({ currentRole: 'member', user: { id: 'u2', email: 'bob@example.com' } } as any);
    vi.mocked(api.listMembers).mockResolvedValue({ members: mockMembers });
    renderPage();
    await waitFor(() => expect(screen.getByText(/you don't have permission/i)).toBeInTheDocument());
    expect(screen.queryByText(/create invite/i)).not.toBeInTheDocument();
  });
});
