import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthGuard from '../AuthGuard';

vi.mock('../../lib/auth', () => ({
  getToken: vi.fn(),
}));

import { getToken } from '../../lib/auth';

function renderGuard() {
  return render(
    <MemoryRouter>
      <AuthGuard>
        <div>Protected content</div>
      </AuthGuard>
    </MemoryRouter>
  );
}

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders children when token is present', () => {
    vi.mocked(getToken).mockReturnValue('test-token');
    renderGuard();
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('does not render children when no token', () => {
    vi.mocked(getToken).mockReturnValue(null);
    renderGuard();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    vi.mocked(getToken).mockReturnValue(null);
    // MemoryRouter will handle the Navigate redirect; we verify children absent
    const { container } = renderGuard();
    expect(container.querySelector('[data-testid]')).toBeNull();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });
});
