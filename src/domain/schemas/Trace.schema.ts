import { EntitySchema } from '@mikro-orm/core';
import { Trace } from '../entities/Trace.js';
import { Tenant } from '../entities/Tenant.js';
import { Agent } from '../entities/Agent.js';

export const TraceSchema = new EntitySchema<Trace>({
  class: Trace,
  tableName: 'traces',
  properties: {
    id: { type: 'uuid', primary: true },
    tenant: { kind: 'm:1', entity: () => Tenant, fieldName: 'tenant_id' },
    agent: { kind: 'm:1', entity: () => Agent, fieldName: 'agent_id', nullable: true },
    requestId: { type: 'string', columnType: 'varchar(255)', fieldName: 'request_id' },
    model: { type: 'string', columnType: 'varchar(255)' },
    provider: { type: 'string', columnType: 'varchar(100)' },
    endpoint: { type: 'string', columnType: 'varchar(255)' },
    requestBody: { type: 'json', fieldName: 'request_body' },
    responseBody: { type: 'json', fieldName: 'response_body', nullable: true },
    latencyMs: { type: 'integer', fieldName: 'latency_ms', nullable: true },
    ttfbMs: { type: 'integer', fieldName: 'ttfb_ms', nullable: true },
    gatewayOverheadMs: { type: 'integer', fieldName: 'gateway_overhead_ms', nullable: true },
    promptTokens: { type: 'integer', fieldName: 'prompt_tokens', nullable: true },
    completionTokens: { type: 'integer', fieldName: 'completion_tokens', nullable: true },
    totalTokens: { type: 'integer', fieldName: 'total_tokens', nullable: true },
    estimatedCostUsd: { type: 'decimal', fieldName: 'estimated_cost_usd', nullable: true },
    encryptionKeyVersion: { type: 'integer', fieldName: 'encryption_key_version', default: 1 },
    statusCode: { type: 'smallint', fieldName: 'status_code', nullable: true },
    createdAt: { type: 'Date', fieldName: 'created_at' },
  },
});
