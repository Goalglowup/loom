import { EntitySchema } from '@mikro-orm/core';
import { SmokeTestRun } from '../entities/SmokeTestRun.js';

export const SmokeTestRunSchema = new EntitySchema<SmokeTestRun>({
  class: SmokeTestRun,
  tableName: 'smoke_test_runs',
  properties: {
    id: { type: 'uuid', primary: true },
    status: { type: 'text' },
    triggeredBy: { type: 'text', fieldName: 'triggered_by' },
    total: { type: 'integer', nullable: true },
    passed: { type: 'integer', nullable: true },
    failed: { type: 'integer', nullable: true },
    skipped: { type: 'integer', nullable: true },
    durationMs: { type: 'integer', fieldName: 'duration_ms', nullable: true },
    results: { type: 'json', nullable: true },
    errorMessage: { type: 'text', fieldName: 'error_message', nullable: true },
    startedAt: { type: 'Date', fieldName: 'started_at', onCreate: () => new Date() },
    completedAt: { type: 'Date', fieldName: 'completed_at', nullable: true },
    createdAt: { type: 'Date', fieldName: 'created_at', onCreate: () => new Date() },
  },
});
