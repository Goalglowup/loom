exports.shorthands = undefined;

exports.up = async (pgm) => {
  // ── Step 1: pgvector extension ────────────────────────────────────────────
  pgm.sql('CREATE EXTENSION IF NOT EXISTS vector');

  // ── Step 2: org_slug on tenants ───────────────────────────────────────────
  pgm.addColumns('tenants', {
    org_slug: {
      type: 'varchar(100)',
      unique: true,
    },
  });

  // ── Step 3: kind on agents ────────────────────────────────────────────────
  pgm.addColumns('agents', {
    kind: {
      type: 'varchar(20)',
      notNull: true,
      default: 'inference',
    },
  });

  // ── Step 4: vector_spaces ─────────────────────────────────────────────────
  pgm.createTable('vector_spaces', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    embedding_agent_id: {
      type: 'uuid',
      references: '"agents"',
    },
    provider: { type: 'varchar(255)', notNull: true },
    model: { type: 'varchar(255)', notNull: true },
    dimensions: { type: 'int', notNull: true },
    preprocessing_hash: { type: 'varchar(64)', notNull: true },
    created_at: { type: 'timestamp', default: pgm.func('now()') },
  });

  // ── Step 5: artifacts ─────────────────────────────────────────────────────
  pgm.createTable('artifacts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: '"tenants"',
      onDelete: 'CASCADE',
    },
    org: { type: 'varchar(100)', notNull: true },
    name: { type: 'varchar(255)', notNull: true },
    version: { type: 'varchar(100)', notNull: true },
    kind: { type: 'varchar(50)', notNull: true },
    sha256: { type: 'varchar(64)', notNull: true, unique: true },
    bundle_data: { type: 'bytea', notNull: true },
    vector_space_id: {
      type: 'uuid',
      references: '"vector_spaces"',
    },
    chunk_count: { type: 'int' },
    metadata: { type: 'jsonb', default: "'{}'" },
    created_at: { type: 'timestamp', default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'artifacts',
    'artifacts_tenant_org_name_version_unique',
    'UNIQUE (tenant_id, org, name, version)',
  );

  // ── Step 6: artifact_tags ─────────────────────────────────────────────────
  pgm.createTable('artifact_tags', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    artifact_id: {
      type: 'uuid',
      notNull: true,
      references: '"artifacts"',
      onDelete: 'CASCADE',
    },
    tag: { type: 'varchar(100)', notNull: true },
    created_at: { type: 'timestamp', default: pgm.func('now()') },
    updated_at: { type: 'timestamp', default: pgm.func('now()') },
  });
  pgm.createIndex('artifact_tags', ['artifact_id', 'tag'], {
    name: 'idx_artifact_tags_lookup',
  });

  // ── Step 7: kb_chunks ─────────────────────────────────────────────────────
  pgm.createTable('kb_chunks', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    artifact_id: {
      type: 'uuid',
      notNull: true,
      references: '"artifacts"',
      onDelete: 'CASCADE',
    },
    chunk_index: { type: 'int', notNull: true },
    content: { type: 'text', notNull: true },
    source_path: { type: 'varchar(500)' },
    token_count: { type: 'int' },
    embedding: { type: 'vector(1536)' },
    metadata: { type: 'jsonb', default: "'{}'" },
    created_at: { type: 'timestamp', default: pgm.func('now()') },
  });
  pgm.createIndex('kb_chunks', ['artifact_id'], {
    name: 'idx_kb_chunks_artifact',
  });
  pgm.sql(
    'CREATE INDEX idx_kb_chunks_embedding ON kb_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)',
  );

  // ── Step 8: deployments ───────────────────────────────────────────────────
  pgm.createTable('deployments', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: '"tenants"',
      onDelete: 'CASCADE',
    },
    artifact_id: {
      type: 'uuid',
      notNull: true,
      references: '"artifacts"',
    },
    environment: { type: 'varchar(50)', notNull: true, default: "'production'" },
    status: { type: 'varchar(50)', notNull: true, default: "'PENDING'" },
    runtime_token: { type: 'text' },
    error_message: { type: 'text' },
    deployed_at: { type: 'timestamp' },
    created_at: { type: 'timestamp', default: pgm.func('now()') },
    updated_at: { type: 'timestamp', default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'deployments',
    'deployments_tenant_artifact_environment_unique',
    'UNIQUE (tenant_id, artifact_id, environment)',
  );

  // ── Step 9: embedding_operations ─────────────────────────────────────────
  pgm.createTable('embedding_operations', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: '"tenants"',
      onDelete: 'CASCADE',
    },
    embedding_agent_id: {
      type: 'uuid',
      references: '"agents"',
    },
    operation_type: { type: 'varchar(20)', notNull: true },
    input_tokens: { type: 'int' },
    latency_ms: { type: 'int' },
    cost_usd: { type: 'numeric(10,6)' },
    status_code: { type: 'int' },
    error_message: { type: 'text' },
    created_at: { type: 'timestamp', default: pgm.func('now()') },
  });
  pgm.createIndex('embedding_operations', ['embedding_agent_id', 'created_at'], {
    name: 'idx_embedding_ops_agent_time',
  });
  pgm.createIndex('embedding_operations', ['tenant_id', 'created_at'], {
    name: 'idx_embedding_ops_tenant_time',
  });

  // ── Step 10: artifact_operations ─────────────────────────────────────────
  pgm.createTable('artifact_operations', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: '"tenants"',
      onDelete: 'CASCADE',
    },
    artifact_id: {
      type: 'uuid',
      references: '"artifacts"',
    },
    operation_type: { type: 'varchar(20)', notNull: true },
    duration_s: { type: 'int' },
    artifact_size_mb: { type: 'numeric(10,2)' },
    chunk_count: { type: 'int' },
    status: { type: 'varchar(20)', notNull: true },
    error_message: { type: 'text' },
    created_at: { type: 'timestamp', default: pgm.func('now()') },
  });
  pgm.createIndex('artifact_operations', ['tenant_id', 'created_at'], {
    name: 'idx_artifact_ops_tenant_time',
  });

  // ── Step 11: Extend traces with RAG fields ────────────────────────────────
  pgm.addColumns('traces', {
    knowledge_base_id: {
      type: 'uuid',
      references: '"artifacts"',
    },
    embedding_agent_id: {
      type: 'uuid',
      references: '"agents"',
    },
    rag_retrieval_latency_ms: { type: 'int' },
    embedding_latency_ms: { type: 'int' },
    vector_search_latency_ms: { type: 'int' },
    retrieved_chunk_count: { type: 'int' },
    top_chunk_similarity: { type: 'numeric(5,4)' },
    avg_chunk_similarity: { type: 'numeric(5,4)' },
    context_tokens_added: { type: 'int' },
    rag_overhead_tokens: { type: 'int' },
    rag_cost_overhead_usd: { type: 'numeric(10,6)' },
    rag_stage_failed: { type: 'varchar(20)' },
    fallback_to_no_rag: { type: 'boolean', default: false },
  });
  pgm.sql(
    'CREATE INDEX idx_traces_kb ON traces(knowledge_base_id) WHERE knowledge_base_id IS NOT NULL',
  );
};

exports.down = async (pgm) => {
  // ── Undo traces RAG fields ────────────────────────────────────────────────
  pgm.sql('DROP INDEX IF EXISTS idx_traces_kb');
  pgm.dropColumns('traces', [
    'knowledge_base_id',
    'embedding_agent_id',
    'rag_retrieval_latency_ms',
    'embedding_latency_ms',
    'vector_search_latency_ms',
    'retrieved_chunk_count',
    'top_chunk_similarity',
    'avg_chunk_similarity',
    'context_tokens_added',
    'rag_overhead_tokens',
    'rag_cost_overhead_usd',
    'rag_stage_failed',
    'fallback_to_no_rag',
  ]);

  // ── Drop tables in reverse order ──────────────────────────────────────────
  pgm.dropTable('artifact_operations');
  pgm.dropTable('embedding_operations');
  pgm.dropTable('deployments');
  pgm.dropTable('kb_chunks');
  pgm.dropTable('artifact_tags');
  pgm.dropTable('artifacts');
  pgm.dropTable('vector_spaces');

  // ── Undo agents.kind and tenants.org_slug ─────────────────────────────────
  pgm.dropColumns('agents', ['kind']);
  pgm.dropColumns('tenants', ['org_slug']);

  // ── Drop pgvector extension ───────────────────────────────────────────────
  pgm.sql('DROP EXTENSION IF EXISTS vector');
};
