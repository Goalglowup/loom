/**
 * Add encryption IV columns and query-pattern indexes to the traces table.
 *
 * IV columns are required by the AES-256-GCM encryption layer added in F7.
 * Indexes cover the three most common dashboard / analytics access patterns.
 */
exports.up = (pgm) => {
  // Encryption IV columns — stored alongside ciphertext in request_body / response_body
  pgm.addColumns('traces', {
    request_iv: { type: 'varchar(24)', notNull: false },
    response_iv: { type: 'varchar(24)', notNull: false },
  });

  // (tenant_id, created_at DESC) — primary dashboard listing query
  pgm.createIndex('traces', ['tenant_id', 'created_at'], {
    name: 'idx_traces_tenant_created',
    method: 'btree',
  });

  // (tenant_id, model) — analytics grouping / model breakdown
  pgm.createIndex('traces', ['tenant_id', 'model'], {
    name: 'idx_traces_tenant_model',
    method: 'btree',
  });

  // created_at alone — partition pruning for retention / time-range scans
  // (migration 1000000000003 already created a plain created_at index, but
  //  on the partitioned parent the index may not be inherited on new partitions
  //  created after the fact; recreating with a stable name makes management easier)
  pgm.createIndex('traces', ['created_at'], {
    name: 'idx_traces_created_at',
    method: 'btree',
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('traces', [], { name: 'idx_traces_tenant_created', ifExists: true });
  pgm.dropIndex('traces', [], { name: 'idx_traces_tenant_model', ifExists: true });
  pgm.dropIndex('traces', [], { name: 'idx_traces_created_at', ifExists: true });
  pgm.dropColumns('traces', ['request_iv', 'response_iv']);
};
