import { EntitySchema } from '@mikro-orm/core';
import { Artifact } from '../entities/Artifact.js';
import { Tenant } from '../entities/Tenant.js';
import { VectorSpace } from '../entities/VectorSpace.js';
import { KbChunk } from '../entities/KbChunk.js';
import { Deployment } from '../entities/Deployment.js';
import { ArtifactTag } from '../entities/ArtifactTag.js';

export const ArtifactSchema = new EntitySchema<Artifact>({
  class: Artifact,
  tableName: 'artifacts',
  properties: {
    id: { type: 'uuid', primary: true },
    tenant: { kind: 'm:1', entity: () => Tenant, fieldName: 'tenant_id' },
    org: { type: 'string', columnType: 'varchar(100)' },
    name: { type: 'string', columnType: 'varchar(255)' },
    version: { type: 'string', columnType: 'varchar(100)' },
    kind: { type: 'string', columnType: 'varchar(50)' },
    sha256: { type: 'string', columnType: 'varchar(64)' },
    bundleData: { type: 'Buffer', fieldName: 'bundle_data', columnType: 'bytea' },
    vectorSpace: { kind: 'm:1', entity: () => VectorSpace, fieldName: 'vector_space_id', nullable: true },
    chunkCount: { type: 'integer', fieldName: 'chunk_count', nullable: true },
    metadata: { type: 'json', default: '{}' },
    createdAt: { type: 'Date', fieldName: 'created_at', onCreate: () => new Date() },
    chunks: { kind: '1:m', entity: () => KbChunk, mappedBy: 'artifact', eager: false },
    deployments: { kind: '1:m', entity: () => Deployment, mappedBy: 'artifact', eager: false },
    tags: { kind: '1:m', entity: () => ArtifactTag, mappedBy: 'artifact', eager: false },
  },
});
