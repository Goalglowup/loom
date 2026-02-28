import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../../pages/LoginPage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../lib/api', () => ({
  api: {
    login: vi.fn(),
    me: vi.fn().mockResolvedValue({ user: null, tenant: null, tenants: [] }),
  },
}));

import { api } from '../../lib/api';

const mockSetLoginData = vi.fn();

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ setLoginData: mockSetLoginData }),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders email and password fields', () => {
    renderLogin();
    expect(screen.getByPlaceholderText(/you@example\.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/••••••••/)).toBeInTheDocument();
  });

  it('renders sign in button', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows error message on failed login', async () => {
    vi.mocked(api.login).mockRejectedValue(new Error('Invalid credentials'));
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'bad@example.com');
    await user.type(screen.getByPlaceholderText(/••••••••/), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });

  it('calls setLoginData and navigates on successful login', async () => {
    const fakeResult = {
      token: 'tok-abc',
      user: { id: '1', email: 'user@example.com', role: 'admin' },
      tenant: { id: 't1', name: 'Acme' },
      tenants: [],
    };
    vi.mocked(api.login).mockResolvedValue(fakeResult);
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'user@example.com');
    await user.type(screen.getByPlaceholderText(/••••••••/), 'correctpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeEnabled();
    expect(mockSetLoginData).toHaveBeenCalledWith('tok-abc', fakeResult.user, null, []);
    expect(mockNavigate).toHaveBeenCalledWith('/app');
  });
});
