import { EntitySchema } from '@mikro-orm/core';
import { ArtifactTag } from '../entities/ArtifactTag.js';
import { Artifact } from '../entities/Artifact.js';

export const ArtifactTagSchema = new EntitySchema<ArtifactTag>({
  class: ArtifactTag,
  tableName: 'artifact_tags',
  properties: {
    id: { type: 'uuid', primary: true },
    artifact: { kind: 'm:1', entity: () => Artifact, fieldName: 'artifact_id' },
    tag: { type: 'string', columnType: 'varchar(100)' },
    createdAt: { type: 'Date', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'Date', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
});
