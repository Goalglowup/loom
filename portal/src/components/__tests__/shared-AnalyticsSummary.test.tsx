import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import AnalyticsSummary from '@shared/analytics/AnalyticsSummary';
import type { SummaryData } from '@shared/analytics/types';

const mockSummary: SummaryData = {
  totalRequests: 1234,
  totalTokens: 567890,
  estimatedCostUSD: 0.0500,
  avgLatencyMs: 120,
  p95LatencyMs: 250,
  p99LatencyMs: 400,
  errorRate: 0.025,
  avgOverheadMs: 15,
  avgTtfbMs: 50,
};

describe('AnalyticsSummary', () => {
  it('shows skeleton cards when loading is true', () => {
    render(<AnalyticsSummary summary={null} loading={true} win={24} onWinChange={vi.fn()} />);
    const skeletons = document.querySelectorAll('.skeleton-card');
    expect(skeletons).toHaveLength(9);
  });

  it('shows empty cards with "—" when summary is null', () => {
    render(<AnalyticsSummary summary={null} loading={false} win={24} onWinChange={vi.fn()} />);
    expect(screen.getByText('Total Requests')).toBeInTheDocument();
    const emptyValues = screen.getAllByText('—');
    expect(emptyValues).toHaveLength(9);
  });

  it('shows empty cards when totalRequests is 0', () => {
    const emptySummary: SummaryData = { ...mockSummary, totalRequests: 0 };
    render(<AnalyticsSummary summary={emptySummary} loading={false} win={24} onWinChange={vi.fn()} />);
    const emptyValues = screen.getAllByText('—');
    expect(emptyValues).toHaveLength(9);
  });

  it('shows data values when summary has data', () => {
    render(<AnalyticsSummary summary={mockSummary} loading={false} win={24} onWinChange={vi.fn()} />);
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('567,890')).toBeInTheDocument();
    expect(screen.getByText('$0.0500')).toBeInTheDocument();
    expect(screen.getByText('120 ms')).toBeInTheDocument();
    expect(screen.getByText('250 ms')).toBeInTheDocument();
    expect(screen.getByText('400 ms')).toBeInTheDocument();
    expect(screen.getByText('2.5%')).toBeInTheDocument();
    expect(screen.getByText('15 ms')).toBeInTheDocument();
    expect(screen.getByText('50 ms')).toBeInTheDocument();
  });

  it('renders window selector with 4 options', () => {
    render(<AnalyticsSummary summary={null} loading={false} win={24} onWinChange={vi.fn()} />);
    expect(screen.getByText('1h')).toBeInTheDocument();
    expect(screen.getByText('6h')).toBeInTheDocument();
    expect(screen.getByText('24h')).toBeInTheDocument();
    expect(screen.getByText('7d')).toBeInTheDocument();
  });

  it('marks active window button with aria-pressed', () => {
    render(<AnalyticsSummary summary={null} loading={false} win={6} onWinChange={vi.fn()} />);
    const btn6h = screen.getByText('6h').closest('button');
    expect(btn6h).toHaveAttribute('aria-pressed', 'true');
    const btn24h = screen.getByText('24h').closest('button');
    expect(btn24h).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onWinChange when window button is clicked', async () => {
    const user = userEvent.setup();
    const onWinChange = vi.fn();
    render(<AnalyticsSummary summary={null} loading={false} win={24} onWinChange={onWinChange} />);
    await user.click(screen.getByText('1h'));
    expect(onWinChange).toHaveBeenCalledWith(1);
  });
});
