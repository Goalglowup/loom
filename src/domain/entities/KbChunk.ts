import { randomUUID } from 'node:crypto';
import type { Artifact } from './Artifact.js';

/**
 * 🟢 Thing archetype
 * A discrete chunk extracted from a knowledge base document.
 * Contains text content and optionally a vector embedding for similarity search.
 */
export class KbChunk {
  id!: string;
  artifact!: Artifact;
  chunkIndex!: number;
  content!: string;
  sourcePath!: string | null;
  tokenCount!: number | null;
  /**
   * Vector embedding for similarity search.
   * pgvector column — serialized as JSON for ORM compatibility; raw SQL used for similarity search.
   */
  embedding!: number[] | null;
  metadata!: Record<string, unknown>;
  createdAt!: Date;

  constructor(
    artifact: Artifact,
    chunkIndex: number,
    content: string,
    options?: {
      sourcePath?: string;
      tokenCount?: number;
      embedding?: number[];
      metadata?: Record<string, unknown>;
    },
  ) {
    this.id = randomUUID();
    this.artifact = artifact;
    this.chunkIndex = chunkIndex;
    this.content = content;
    this.sourcePath = options?.sourcePath ?? null;
    this.tokenCount = options?.tokenCount ?? null;
    this.embedding = options?.embedding ?? null;
    this.metadata = options?.metadata ?? {};
    this.createdAt = new Date();
  }
}
