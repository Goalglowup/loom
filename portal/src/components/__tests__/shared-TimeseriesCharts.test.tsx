import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TimeseriesCharts from '@shared/analytics/TimeseriesCharts';
import type { TimeseriesData } from '@shared/analytics/types';

const mockData: TimeseriesData[] = [
  {
    bucket: '2024-01-01T00:00:00Z',
    requests: 100,
    tokens: 5000,
    costUSD: 0.01,
    avgLatencyMs: 120,
    errorRate: 0.02,
    avgOverheadMs: 10,
    avgTtfbMs: 20,
  },
  {
    bucket: '2024-01-01T01:00:00Z',
    requests: 150,
    tokens: 7500,
    costUSD: 0.015,
    avgLatencyMs: 130,
    errorRate: 0.01,
    avgOverheadMs: 12,
    avgTtfbMs: 22,
  },
];

// Mock localStorage for chart preferences
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('TimeseriesCharts', () => {
  it('renders without crashing with empty data', () => {
    render(<TimeseriesCharts data={[]} loading={false} win={24} />);
    expect(screen.getAllByText('No data available')).toHaveLength(4); // 4 charts
  });

  it('renders chart titles with valid data', () => {
    render(<TimeseriesCharts data={mockData} loading={false} win={24} />);
    expect(screen.getByText('Requests over Time')).toBeInTheDocument();
    expect(screen.getByText('Avg Latency over Time (ms)')).toBeInTheDocument();
    expect(screen.getByText('Error Rate over Time (%)')).toBeInTheDocument();
    expect(screen.getByText('Estimated Cost over Time ($)')).toBeInTheDocument();
  });

  it('shows loading state when loading is true', () => {
    render(<TimeseriesCharts data={[]} loading={true} win={24} />);
    const loadingCharts = document.querySelectorAll('.chart-loading');
    expect(loadingCharts).toHaveLength(4);
  });

  it('shows no data message when data is empty and not loading', () => {
    render(<TimeseriesCharts data={[]} loading={false} win={24} />);
    const noDataMessages = screen.getAllByText('No data available');
    expect(noDataMessages).toHaveLength(4);
  });

  it('renders drag handles for chart reordering', () => {
    render(<TimeseriesCharts data={mockData} loading={false} win={24} />);
    const dragHandles = document.querySelectorAll('.chart-drag-handle');
    expect(dragHandles).toHaveLength(4);
  });

  it('renders expand/collapse buttons for each chart', () => {
    render(<TimeseriesCharts data={mockData} loading={false} win={24} />);
    const expandButtons = screen.getAllByLabelText(/Expand chart|Collapse chart/);
    expect(expandButtons).toHaveLength(4);
  });
});
