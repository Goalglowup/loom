exports.shorthands = undefined;

exports.up = (pgm) => {
  // ── agents: conversation config columns ───────────────────────────────────
  pgm.addColumns('agents', {
    conversations_enabled: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    conversation_token_limit: {
      type: 'integer',
      notNull: true,
      default: 4000,
    },
    conversation_summary_model: {
      type: 'varchar(255)',
    },
  });

  // ── partitions: tenant-managed hierarchy ──────────────────────────────────
  pgm.createTable('partitions', {
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
    parent_id: {
      type: 'uuid',
      references: '"partitions"',
      onDelete: 'CASCADE',
    },
    external_id: { type: 'varchar(255)', notNull: true },
    title_encrypted: { type: 'text' },
    title_iv: { type: 'varchar(24)' },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
  });
  // Non-null parent_id unique constraint (standard UNIQUE handles this correctly)
  pgm.addConstraint(
    'partitions',
    'partitions_tenant_parent_external_unique',
    'UNIQUE (tenant_id, parent_id, external_id)',
  );
  // Partial unique index for root partitions (parent_id IS NULL) —
  // standard UNIQUE treats two NULLs as non-equal, so a separate index is needed.
  pgm.sql(
    'CREATE UNIQUE INDEX partitions_tenant_root_external_unique ON partitions (tenant_id, external_id) WHERE parent_id IS NULL',
  );
  pgm.createIndex('partitions', ['tenant_id', 'parent_id']);

  // ── conversations ─────────────────────────────────────────────────────────
  pgm.createTable('conversations', {
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
    agent_id: {
      type: 'uuid',
      references: '"agents"',
      onDelete: 'SET NULL',
    },
    partition_id: {
      type: 'uuid',
      references: '"partitions"',
      onDelete: 'SET NULL',
    },
    external_id: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
    last_active_at: { type: 'timestamptz', default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'conversations',
    'conversations_tenant_partition_external_unique',
    'UNIQUE (tenant_id, partition_id, external_id)',
  );
  // Partial unique index for conversations without a partition
  pgm.sql(
    'CREATE UNIQUE INDEX conversations_tenant_root_external_unique ON conversations (tenant_id, external_id) WHERE partition_id IS NULL',
  );
  pgm.createIndex('conversations', ['tenant_id', 'partition_id']);
  pgm.createIndex('conversations', ['tenant_id', 'external_id']);

  // ── conversation_messages: permanent unabridged log ───────────────────────
  pgm.createTable('conversation_messages', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    conversation_id: {
      type: 'uuid',
      notNull: true,
      references: '"conversations"',
      onDelete: 'CASCADE',
    },
    role: { type: 'varchar(50)', notNull: true },
    content_encrypted: { type: 'text', notNull: true },
    content_iv: { type: 'varchar(24)', notNull: true },
    token_estimate: { type: 'integer' },
    trace_id: { type: 'uuid' }, // informational; traces has composite PK so no FK constraint
    snapshot_id: { type: 'uuid' }, // informational only; message is never removed
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
  });
  pgm.createIndex('conversation_messages', ['conversation_id', 'created_at']);

  // ── conversation_snapshots: LLM summaries ─────────────────────────────────
  pgm.createTable('conversation_snapshots', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    conversation_id: {
      type: 'uuid',
      notNull: true,
      references: '"conversations"',
      onDelete: 'CASCADE',
    },
    summary_encrypted: { type: 'text', notNull: true },
    summary_iv: { type: 'varchar(24)', notNull: true },
    messages_archived: { type: 'integer', notNull: true },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
  });
  pgm.createIndex('conversation_snapshots', [{ name: 'conversation_id' }, { name: 'created_at', sort: 'DESC' }]);
};

exports.down = (pgm) => {
  pgm.dropTable('conversation_snapshots');
  pgm.dropTable('conversation_messages');
  pgm.dropTable('conversations');
  pgm.dropTable('partitions');
  pgm.dropColumns('agents', [
    'conversations_enabled',
    'conversation_token_limit',
    'conversation_summary_model',
  ]);
};
