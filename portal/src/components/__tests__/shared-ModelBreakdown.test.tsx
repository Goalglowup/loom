import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ModelBreakdownTable from '@shared/analytics/ModelBreakdown';
import type { ModelBreakdown } from '@shared/analytics/types';

const mockModels: ModelBreakdown[] = [
  {
    model: 'gpt-4o',
    requests: 1000,
    errorRate: 0.01,
    avgLatencyMs: 120,
    totalTokens: 50000,
    estimatedCostUSD: 0.05,
  },
  {
    model: 'gpt-3.5-turbo',
    requests: 2000,
    errorRate: 0.10,
    avgLatencyMs: 80,
    totalTokens: 100000,
    estimatedCostUSD: 0.02,
  },
];

describe('ModelBreakdownTable', () => {
  it('shows skeleton rows when loading', () => {
    render(<ModelBreakdownTable models={null} loading={true} />);
    const skeletons = document.querySelectorAll('.model-skeleton-row');
    expect(skeletons).toHaveLength(4);
  });

  it('shows empty state when models is null', () => {
    render(<ModelBreakdownTable models={null} loading={false} />);
    expect(screen.getByText('No data for this window.')).toBeInTheDocument();
  });

  it('shows empty state when models is empty array', () => {
    render(<ModelBreakdownTable models={[]} loading={false} />);
    expect(screen.getByText('No data for this window.')).toBeInTheDocument();
  });

  it('renders model rows with data', () => {
    render(<ModelBreakdownTable models={mockModels} loading={false} />);
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('gpt-3.5-turbo')).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(screen.getByText('2,000')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(<ModelBreakdownTable models={mockModels} loading={false} />);
    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByText('Requests')).toBeInTheDocument();
    expect(screen.getByText('Error Rate')).toBeInTheDocument();
    expect(screen.getByText('Avg Latency')).toBeInTheDocument();
    expect(screen.getByText('Tokens')).toBeInTheDocument();
    expect(screen.getByText('Est. Cost')).toBeInTheDocument();
  });

  it('formats error rate as percentage', () => {
    render(<ModelBreakdownTable models={mockModels} loading={false} />);
    expect(screen.getByText('1.0%')).toBeInTheDocument(); // 0.01 * 100
    expect(screen.getByText('10.0%')).toBeInTheDocument(); // 0.10 * 100
  });

  it('formats latency with ms suffix', () => {
    render(<ModelBreakdownTable models={mockModels} loading={false} />);
    expect(screen.getByText('120 ms')).toBeInTheDocument();
    expect(screen.getByText('80 ms')).toBeInTheDocument();
  });

  it('formats cost with dollar sign and decimals', () => {
    render(<ModelBreakdownTable models={mockModels} loading={false} />);
    expect(screen.getByText('$0.0500')).toBeInTheDocument();
    expect(screen.getByText('$0.0200')).toBeInTheDocument();
  });

  it('applies error-high class when error rate > 5%', () => {
    render(<ModelBreakdownTable models={mockModels} loading={false} />);
    const highErrorBadge = screen.getByText('10.0%');
    expect(highErrorBadge.classList.contains('error-high')).toBe(true);
  });

  it('applies error-low class when error rate is between 0% and 5%', () => {
    render(<ModelBreakdownTable models={mockModels} loading={false} />);
    const lowErrorBadge = screen.getByText('1.0%');
    expect(lowErrorBadge.classList.contains('error-low')).toBe(true);
  });
});
