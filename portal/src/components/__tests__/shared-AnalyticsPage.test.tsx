import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AnalyticsPage from '@shared/analytics/AnalyticsPage';
import type { SummaryData, TimeseriesData, ModelBreakdown, Tenant } from '@shared/analytics/types';

const mockSummary: SummaryData = {
  totalRequests: 100,
  totalTokens: 5000,
  estimatedCostUSD: 0.01,
  avgLatencyMs: 100,
  p95LatencyMs: 200,
  p99LatencyMs: 300,
  errorRate: 0.02,
  avgOverheadMs: 10,
  avgTtfbMs: 20,
};

const mockTimeseries: TimeseriesData[] = [
  {
    bucket: '2024-01-01T00:00:00Z',
    requests: 10,
    tokens: 500,
    costUSD: 0.001,
    avgLatencyMs: 100,
    errorRate: 0.01,
    avgOverheadMs: 5,
    avgTtfbMs: 10,
  },
];

const mockModels: ModelBreakdown[] = [
  {
    model: 'gpt-4o',
    requests: 50,
    errorRate: 0.01,
    avgLatencyMs: 120,
    totalTokens: 2500,
    estimatedCostUSD: 0.005,
  },
];

const mockTenants: Tenant[] = [
  { id: 'tenant-1', name: 'Acme Corp' },
  { id: 'tenant-2', name: 'Beta Inc' },
];

describe('AnalyticsPage', () => {
  let fetchSummary: ReturnType<typeof vi.fn>;
  let fetchTimeseries: ReturnType<typeof vi.fn>;
  let fetchModels: ReturnType<typeof vi.fn>;
  let fetchTenants: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSummary = vi.fn().mockResolvedValue(mockSummary);
    fetchTimeseries = vi.fn().mockResolvedValue(mockTimeseries);
    fetchModels = vi.fn().mockResolvedValue(mockModels);
    fetchTenants = vi.fn().mockResolvedValue(mockTenants);
  });

  it('calls fetchSummary, fetchTimeseries, fetchModels on mount', async () => {
    render(
      <AnalyticsPage
        fetchSummary={fetchSummary}
        fetchTimeseries={fetchTimeseries}
        fetchModels={fetchModels}
      />
    );

    await waitFor(() => {
      expect(fetchSummary).toHaveBeenCalledTimes(1);
      expect(fetchTimeseries).toHaveBeenCalledTimes(1);
      expect(fetchModels).toHaveBeenCalledTimes(1);
    });
  });

  it('shows loading state initially', () => {
    fetchSummary.mockReturnValue(new Promise(() => {})); // Never resolves
    render(
      <AnalyticsPage
        fetchSummary={fetchSummary}
        fetchTimeseries={fetchTimeseries}
        fetchModels={fetchModels}
      />
    );

    const skeletons = document.querySelectorAll('.skeleton-card');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders data from fetch functions when resolved', async () => {
    render(
      <AnalyticsPage
        fetchSummary={fetchSummary}
        fetchTimeseries={fetchTimeseries}
        fetchModels={fetchModels}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('100')).toBeInTheDocument(); // totalRequests
    });

    expect(screen.getByText('gpt-4o')).toBeInTheDocument(); // model name
  });

  it('window change triggers re-fetch', async () => {
    const user = userEvent.setup();
    render(
      <AnalyticsPage
        fetchSummary={fetchSummary}
        fetchTimeseries={fetchTimeseries}
        fetchModels={fetchModels}
      />
    );

    await waitFor(() => expect(fetchSummary).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText('1h'));

    await waitFor(() => {
      expect(fetchSummary).toHaveBeenCalledTimes(2);
      expect(fetchTimeseries).toHaveBeenCalledTimes(2);
      expect(fetchModels).toHaveBeenCalledTimes(2);
    });
  });

  it('in admin mode, calls fetchTenants', async () => {
    render(
      <AnalyticsPage
        isAdmin
        fetchSummary={fetchSummary}
        fetchTimeseries={fetchTimeseries}
        fetchModels={fetchModels}
        fetchTenants={fetchTenants}
      />
    );

    await waitFor(() => {
      expect(fetchTenants).toHaveBeenCalledTimes(1);
    });
  });

  it('in admin mode, renders tenant selector with options', async () => {
    render(
      <AnalyticsPage
        isAdmin
        fetchSummary={fetchSummary}
        fetchTimeseries={fetchTimeseries}
        fetchModels={fetchModels}
        fetchTenants={fetchTenants}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Tenant')).toBeInTheDocument();
    });

    expect(screen.getByRole('option', { name: 'Acme Corp' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Beta Inc' })).toBeInTheDocument();
  });

  it('tenant change triggers re-fetch', async () => {
    const user = userEvent.setup();
    render(
      <AnalyticsPage
        isAdmin
        fetchSummary={fetchSummary}
        fetchTimeseries={fetchTimeseries}
        fetchModels={fetchModels}
        fetchTenants={fetchTenants}
      />
    );

    await waitFor(() => expect(fetchSummary).toHaveBeenCalledTimes(1));

    const select = screen.getByLabelText('Tenant');
    await user.selectOptions(select, 'tenant-1');

    await waitFor(() => {
      expect(fetchSummary).toHaveBeenCalledTimes(2);
      expect(fetchSummary).toHaveBeenLastCalledWith('tenant-1', '24');
    });
  });

  it('does not render tenant selector when not in admin mode', () => {
    render(
      <AnalyticsPage
        fetchSummary={fetchSummary}
        fetchTimeseries={fetchTimeseries}
        fetchModels={fetchModels}
      />
    );

    expect(screen.queryByLabelText('Tenant')).not.toBeInTheDocument();
  });
});
