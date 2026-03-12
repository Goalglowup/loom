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
  requestIv!: string | null;
  responseBody!: any | null;
  responseIv!: string | null;
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
  // RAG fields
  knowledgeBaseId!: string | null;
  embeddingAgentId!: string | null;
  ragRetrievalLatencyMs!: number | null;
  embeddingLatencyMs!: number | null;
  vectorSearchLatencyMs!: number | null;
  retrievedChunkCount!: number | null;
  topChunkSimilarity!: number | null;
  avgChunkSimilarity!: number | null;
  contextTokensAdded!: number | null;
  ragOverheadTokens!: number | null;
  ragCostOverheadUsd!: number | null;
  ragStageFailed!: string | null;
  fallbackToNoRag!: boolean | null;
}
