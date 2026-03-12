import { EntitySchema } from '@mikro-orm/core';
import { VectorSpace } from '../entities/VectorSpace.js';
import { Agent } from '../entities/Agent.js';

export const VectorSpaceSchema = new EntitySchema<VectorSpace>({
  class: VectorSpace,
  tableName: 'vector_spaces',
  properties: {
    id: { type: 'uuid', primary: true },
    embeddingAgent: { kind: 'm:1', entity: () => Agent, fieldName: 'embedding_agent_id', nullable: true },
    provider: { type: 'string', columnType: 'varchar(255)' },
    model: { type: 'string', columnType: 'varchar(255)' },
    dimensions: { type: 'integer' },
    preprocessingHash: { type: 'string', columnType: 'varchar(64)', fieldName: 'preprocessing_hash' },
    createdAt: { type: 'Date', fieldName: 'created_at', onCreate: () => new Date() },
  },
});
