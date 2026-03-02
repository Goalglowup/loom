import { randomUUID } from 'node:crypto';
import type { Tenant } from './Tenant.js';
import type { VectorSpace } from './VectorSpace.js';
import type { KbChunk } from './KbChunk.js';
import type { Deployment } from './Deployment.js';
import type { ArtifactTag } from './ArtifactTag.js';

export type ArtifactKind = 'KnowledgeBase' | 'Agent' | 'EmbeddingAgent';

/**
 * 🟢 Thing archetype
 * A content-addressed bundle (KB, Agent, or EmbeddingAgent config).
 * Immutable once created — new versions create new artifacts.
 */
export class Artifact {
  id!: string;
  tenant!: Tenant;
  org!: string;
  name!: string;
  version!: string;
  kind!: ArtifactKind;
  sha256!: string;
  bundleData!: Buffer;
  vectorSpace!: VectorSpace | null;
  chunkCount!: number | null;
  metadata!: Record<string, unknown>;
  createdAt!: Date;

  chunks: KbChunk[] = [];
  deployments: Deployment[] = [];
  tags: ArtifactTag[] = [];

  constructor(
    tenant: Tenant,
    org: string,
    name: string,
    version: string,
    kind: ArtifactKind,
    sha256: string,
    bundleData: Buffer,
    options?: {
      vectorSpace?: VectorSpace;
      chunkCount?: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    this.id = randomUUID();
    this.tenant = tenant;
    this.org = org;
    this.name = name;
    this.version = version;
    this.kind = kind;
    this.sha256 = sha256;
    this.bundleData = bundleData;
    this.vectorSpace = options?.vectorSpace ?? null;
    this.chunkCount = options?.chunkCount ?? null;
    this.metadata = options?.metadata ?? {};
    this.createdAt = new Date();
    this.chunks = [];
    this.deployments = [];
    this.tags = [];
  }

  addTag(tag: string): ArtifactTag {
    // Lazy import to avoid circular dependency at module load
    const { ArtifactTag } = require('./ArtifactTag.js');
    const artifactTag = new ArtifactTag(this, tag);
    this.tags.push(artifactTag);
    return artifactTag;
  }
}
