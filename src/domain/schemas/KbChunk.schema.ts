import { EntitySchema } from '@mikro-orm/core';
import { KbChunk } from '../entities/KbChunk.js';
import { Artifact } from '../entities/Artifact.js';

export const KbChunkSchema = new EntitySchema<KbChunk>({
  class: KbChunk,
  tableName: 'kb_chunks',
  properties: {
    id: { type: 'uuid', primary: true },
    artifact: { kind: 'm:1', entity: () => Artifact, fieldName: 'artifact_id' },
    chunkIndex: { type: 'integer', fieldName: 'chunk_index' },
    content: { type: 'text' },
    sourcePath: { type: 'string', columnType: 'varchar(500)', fieldName: 'source_path', nullable: true },
    tokenCount: { type: 'integer', fieldName: 'token_count', nullable: true },
    embedding: { type: 'json', nullable: true },
    metadata: { type: 'json', default: '{}' },
    createdAt: { type: 'Date', fieldName: 'created_at', onCreate: () => new Date() },
  },
});
