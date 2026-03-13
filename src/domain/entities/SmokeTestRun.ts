import { randomUUID } from 'node:crypto';

export type SmokeTestStatus = 'running' | 'passed' | 'failed' | 'error';
export type SmokeTestTrigger = 'startup' | 'manual';

export interface SmokeTestResult {
  name: string;
  suite: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  error?: string;
}

export class SmokeTestRun {
  id!: string;
  status!: SmokeTestStatus;
  triggeredBy!: SmokeTestTrigger;
  total!: number | null;
  passed!: number | null;
  failed!: number | null;
  skipped!: number | null;
  durationMs!: number | null;
  results!: SmokeTestResult[] | null;
  errorMessage!: string | null;
  startedAt!: Date;
  completedAt!: Date | null;
  createdAt!: Date;

  constructor(triggeredBy: SmokeTestTrigger = 'startup') {
    this.id = randomUUID();
    this.status = 'running';
    this.triggeredBy = triggeredBy;
    this.total = null;
    this.passed = null;
    this.failed = null;
    this.skipped = null;
    this.durationMs = null;
    this.results = null;
    this.errorMessage = null;
    this.startedAt = new Date();
    this.completedAt = null;
    this.createdAt = new Date();
  }

  complete(results: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
    results: SmokeTestResult[];
  }): void {
    this.status = results.failed > 0 ? 'failed' : 'passed';
    this.total = results.total;
    this.passed = results.passed;
    this.failed = results.failed;
    this.skipped = results.skipped;
    this.durationMs = results.durationMs;
    this.results = results.results;
    this.completedAt = new Date();
  }

  fail(errorMessage: string): void {
    this.status = 'error';
    this.errorMessage = errorMessage;
    this.completedAt = new Date();
  }
}
