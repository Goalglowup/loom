import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AnalyticsPage from '../AnalyticsPage';

vi.mock('../../lib/auth', () => ({
  getToken: vi.fn(),
}));

vi.mock('@shared/analytics', () => ({
  AnalyticsPage: ({ fetchSummary }: any) => (
    <div data-testid="analytics-page">
      <button onClick={() => fetchSummary(undefined, '24')}>Fetch Summary</button>
    </div>
  ),
  BUCKET_MINUTES: { 24: 5, 168: 60 },
}));

import { getToken } from '../../lib/auth';

function renderPage() {
  return render(
    <MemoryRouter>
      <AnalyticsPage />
    </MemoryRouter>
  );
}

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getToken).mockReturnValue('tok');
    global.fetch = vi.fn();
  });

  it('renders shared AnalyticsPage component', () => {
    renderPage();
    expect(screen.getByTestId('analytics-page')).toBeInTheDocument();
  });

  it('renders rollup/org scope toggle', () => {
    renderPage();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /all — roll up/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /this org only/i })).toBeInTheDocument();
  });

  it('passes fetch functions that call portal analytics endpoints', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ totalRequests: 100 }),
    } as Response);

    renderPage();
    const fetchButton = screen.getByRole('button', { name: /fetch summary/i });
    await userEvent.setup().click(fetchButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/portal/analytics/summary'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        })
      );
    });
  });

  it('includes rollup param when rollup scope is selected', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ totalRequests: 100 }),
    } as Response);

    renderPage();
    const fetchButton = screen.getByRole('button', { name: /fetch summary/i });
    await userEvent.setup().click(fetchButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('rollup=true'),
        expect.any(Object)
      );
    });
  });

  it('switches scope when toggle is changed', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ totalRequests: 100 }),
    } as Response);

    const user = userEvent.setup();
    renderPage();
    
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'org');

    const fetchButton = screen.getByRole('button', { name: /fetch summary/i });
    await user.click(fetchButton);

    await waitFor(() => {
      const calls = vi.mocked(global.fetch).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).not.toContain('rollup=true');
    });
  });
});
