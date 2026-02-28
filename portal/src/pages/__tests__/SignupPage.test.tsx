import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../lib/api', () => ({
  api: {
    signup: vi.fn(),
    getInviteInfo: vi.fn(),
  },
}));

const mockSetLoginData = vi.fn();

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ setLoginData: mockSetLoginData }),
}));

import { api } from '../../lib/api';
import SignupPage from '../SignupPage';

function renderPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/signup${search}`]}>
      <SignupPage />
    </MemoryRouter>
  );
}

describe('SignupPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('normal signup (no invite)', () => {
    it('renders org name, email, and password fields', () => {
      renderPage();
      expect(screen.getByPlaceholderText(/Acme Corp/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/you@example\.com/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/min\. 8 characters/i)).toBeInTheDocument();
    });

    it('renders Create account button', () => {
      renderPage();
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });

    it('shows error on failed signup', async () => {
      vi.mocked(api.signup).mockRejectedValue(new Error('Email already taken'));
      const user = userEvent.setup();
      renderPage();
      await user.type(screen.getByPlaceholderText(/Acme Corp/i), 'My Org');
      await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'test@example.com');
      await user.type(screen.getByPlaceholderText(/min\. 8 characters/i), 'password123');
      await user.click(screen.getByRole('button', { name: /create account/i }));
      expect(await screen.findByText('Email already taken')).toBeInTheDocument();
    });

    it('shows ApiKeyReveal and calls setLoginData on successful signup with apiKey', async () => {
      vi.mocked(api.signup).mockResolvedValue({
        token: 'tok-abc',
        user: { id: '1', email: 'test@example.com', role: 'owner' },
        tenants: [],
        apiKey: 'loom_sk_testkey123',
      });
      const user = userEvent.setup();
      renderPage();
      await user.type(screen.getByPlaceholderText(/Acme Corp/i), 'My Org');
      await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'test@example.com');
      await user.type(screen.getByPlaceholderText(/min\. 8 characters/i), 'password123');
      await user.click(screen.getByRole('button', { name: /create account/i }));
      await waitFor(() => expect(screen.getByText('loom_sk_testkey123')).toBeInTheDocument());
      expect(mockSetLoginData).toHaveBeenCalledWith('tok-abc', expect.any(Object), null, []);
    });

    it('navigates to /app when signup succeeds without apiKey', async () => {
      vi.mocked(api.signup).mockResolvedValue({
        token: 'tok-abc',
        user: { id: '1', email: 'test@example.com', role: 'owner' },
        tenants: [],
        apiKey: undefined,
      });
      const user = userEvent.setup();
      renderPage();
      await user.type(screen.getByPlaceholderText(/Acme Corp/i), 'My Org');
      await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'test@example.com');
      await user.type(screen.getByPlaceholderText(/min\. 8 characters/i), 'password123');
      await user.click(screen.getByRole('button', { name: /create account/i }));
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/app'));
    });
  });

  describe('invite mode', () => {
    it('shows loading state while validating invite', () => {
      vi.mocked(api.getInviteInfo).mockImplementation(() => new Promise(() => {}));
      renderPage('?invite=tok123');
      expect(screen.getByText(/validating invite/i)).toBeInTheDocument();
    });

    it('shows error when invite is invalid', async () => {
      vi.mocked(api.getInviteInfo).mockResolvedValue({ isValid: false });
      renderPage('?invite=bad-token');
      await waitFor(() => expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument());
    });

    it('hides org name field in invite mode', async () => {
      vi.mocked(api.getInviteInfo).mockResolvedValue({ isValid: true, tenantName: 'Partner Co' });
      renderPage('?invite=good-token');
      await waitFor(() => expect(screen.getAllByText(/Join Partner Co/i).length).toBeGreaterThan(0));
      expect(screen.queryByPlaceholderText(/Acme Corp/i)).not.toBeInTheDocument();
    });

    it('shows join button with tenant name in invite mode', async () => {
      vi.mocked(api.getInviteInfo).mockResolvedValue({ isValid: true, tenantName: 'Partner Co' });
      renderPage('?invite=good-token');
      await waitFor(() => expect(screen.getByRole('button', { name: /Join Partner Co/i })).toBeInTheDocument());
    });

    it('navigates to /app/traces on successful invite signup', async () => {
      vi.mocked(api.getInviteInfo).mockResolvedValue({ isValid: true, tenantName: 'Partner Co' });
      vi.mocked(api.signup).mockResolvedValue({
        token: 'tok',
        user: { id: '2', email: 'member@example.com', role: 'user' },
        tenants: [{ id: 't1', name: 'Partner Co', role: 'member' }],
      });
      const user = userEvent.setup();
      renderPage('?invite=good-token');
      await waitFor(() => expect(screen.getByRole('button', { name: /Join Partner Co/i })).toBeInTheDocument());
      await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'member@example.com');
      await user.type(screen.getByPlaceholderText(/min\. 8 characters/i), 'password123');
      await user.click(screen.getByRole('button', { name: /Join Partner Co/i }));
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/app/traces'));
    });
  });
});
