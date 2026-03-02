import { randomUUID } from 'node:crypto';
import type { Artifact } from './Artifact.js';

/**
 * 🔵 Catalog-Entry/Description archetype
 * A mutable pointer/label that marks an artifact version (e.g., "latest", "stable").
 * Can be moved to point to different artifact versions over time.
 */
export class ArtifactTag {
  id!: string;
  artifact!: Artifact;
  tag!: string;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(artifact: Artifact, tag: string) {
    this.id = randomUUID();
    this.artifact = artifact;
    this.tag = tag;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  reassign(newArtifact: Artifact): void {
    this.artifact = newArtifact;
    this.updatedAt = new Date();
  }
}
