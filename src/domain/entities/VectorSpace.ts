import { randomUUID } from 'node:crypto';
import type { Agent } from './Agent.js';

/**
 * 🔵 Catalog-Entry/Description archetype
 * Describes an embedding configuration fingerprint — provider/model/dimensions/preprocessing.
 * Used to ensure vector compatibility when storing and searching KB chunks.
 */
export class VectorSpace {
  id!: string;
  embeddingAgent!: Agent | null;
  provider!: string;
  model!: string;
  dimensions!: number;
  preprocessingHash!: string;
  createdAt!: Date;

  constructor(
    provider: string,
    model: string,
    dimensions: number,
    preprocessingHash: string,
    embeddingAgent?: Agent,
  ) {
    this.id = randomUUID();
    this.embeddingAgent = embeddingAgent ?? null;
    this.provider = provider;
    this.model = model;
    this.dimensions = dimensions;
    this.preprocessingHash = preprocessingHash;
    this.createdAt = new Date();
  }
}
