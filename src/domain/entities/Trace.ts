import type { Agent } from './Agent.js';
import type { Tenant } from './Tenant.js';

export class Trace {
  id!: string;
  tenant!: Tenant;
  agent!: Agent | null;
  requestId!: string;
  model!: string;
  provider!: string;
  endpoint!: string;
  requestBody!: any;
  responseBody!: any | null;
  latencyMs!: number | null;
  ttfbMs!: number | null;
  gatewayOverheadMs!: number | null;
  promptTokens!: number | null;
  completionTokens!: number | null;
  totalTokens!: number | null;
  estimatedCostUsd!: number | null;
  encryptionKeyVersion!: number;
  statusCode!: number | null;
  createdAt!: Date;
}
