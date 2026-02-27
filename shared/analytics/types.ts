export type WindowHours = 1 | 6 | 24 | 168;

export const BUCKET_MINUTES: Record<WindowHours, number> = {
  1: 5,
  6: 30,
  24: 60,
  168: 360,
};

export interface SummaryData {
  totalRequests: number;
  totalTokens: number;
  estimatedCostUSD: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errorRate: number;
}

export interface TimeseriesData {
  bucket: string;
  requests: number;
  tokens: number;
  costUSD: number;
  avgLatencyMs: number;
}

export interface Tenant {
  id: string;
  name: string;
}
