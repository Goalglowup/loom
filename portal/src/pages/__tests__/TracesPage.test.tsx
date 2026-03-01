import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TracesPage from '../TracesPage';

vi.mock('../../lib/auth', () => ({
  getToken: vi.fn(),
}));

import { getToken } from '../../lib/auth';

const mockTraces = [
  {
    id: 't1',
    model: 'gpt-4o',
    provider: 'openai',
    status_code: 200,
    latency_ms: 1234,
    prompt_tokens: 100,
    completion_tokens: 50,
    created_at: '2024-01-01T12:00:00Z',
  },
  {
    id: 't2',
    model: 'gpt-4o-mini',
    provider: 'openai',
    status_code: 500,
    latency_ms: 5678,
    prompt_tokens: 200,
    completion_tokens: 75,
    created_at: '2024-01-02T12:00:00Z',
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <TracesPage />
    </MemoryRouter>
  );
}

describe('TracesPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getToken).mockReturnValue('tok');
    global.fetch = vi.fn();
  });

  it('shows loading state initially', () => {
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Traces')).toBeInTheDocument();
  });

  it('renders traces list on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ traces: mockTraces, nextCursor: null }),
    } as Response);
    renderPage();
    await waitFor(() => expect(screen.getByText('gpt-4o')).toBeInTheDocument());
    expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument();
    expect(screen.getByText('1,234 ms')).toBeInTheDocument();
  });

  it('shows empty state when no traces', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ traces: [], nextCursor: null }),
    } as Response);
    renderPage();
    await waitFor(() => expect(screen.getByText(/no traces yet/i)).toBeInTheDocument());
  });

  it('shows error message on fetch failure', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);
    renderPage();
    await waitFor(() => expect(screen.getByText(/HTTP 500/i)).toBeInTheDocument());
  });

  it('loads more traces when Load more button is clicked', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ traces: mockTraces, nextCursor: 'cursor123' }),
    } as Response).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ traces: [], nextCursor: null }),
    } as Response);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument());
    
    await user.click(screen.getByRole('button', { name: /load more/i }));
    
    await waitFor(() => {
      const calls = vi.mocked(global.fetch).mock.calls;
      expect(calls[1][0]).toContain('cursor=cursor123');
    });
  });

  it('opens detail panel when trace row is clicked', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ traces: mockTraces, nextCursor: null }),
    } as Response);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('gpt-4o')).toBeInTheDocument());
    
    const row = screen.getByText('gpt-4o').closest('tr')!;
    await user.click(row);
    
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText('Trace details')).toBeInTheDocument();
  });

  it('fetches with cursor pagination parameter', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ traces: mockTraces, nextCursor: null }),
    } as Response);
    renderPage();
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/portal/traces?limit=50'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        })
      );
    });
  });
});
