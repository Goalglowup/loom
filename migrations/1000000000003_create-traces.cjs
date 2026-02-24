exports.up = (pgm) => {
  // Create parent table for partitioning
  pgm.sql(`
    CREATE TABLE traces (
      id uuid DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      request_id varchar(255) NOT NULL,
      model varchar(255) NOT NULL,
      provider varchar(100) NOT NULL,
      endpoint varchar(255) NOT NULL,
      request_body jsonb NOT NULL,
      response_body jsonb,
      latency_ms integer,
      ttfb_ms integer,
      gateway_overhead_ms integer,
      prompt_tokens integer,
      completion_tokens integer,
      total_tokens integer,
      estimated_cost_usd numeric(10, 6),
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at);
  `);

  // Create indexes
  pgm.createIndex('traces', 'tenant_id');
  pgm.createIndex('traces', 'request_id');
  pgm.createIndex('traces', 'created_at');
  pgm.createIndex('traces', 'model');
  pgm.createIndex('traces', 'provider');

  // Create initial partitions for current and next 3 months
  const now = new Date();
  for (let i = 0; i < 4; i++) {
    const partitionDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const nextPartitionDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    
    const year = partitionDate.getFullYear();
    const month = String(partitionDate.getMonth() + 1).padStart(2, '0');
    const partitionName = `traces_${year}_${month}`;
    
    const fromDate = partitionDate.toISOString().split('T')[0];
    const toDate = nextPartitionDate.toISOString().split('T')[0];
    
    pgm.sql(`
      CREATE TABLE ${partitionName} PARTITION OF traces
      FOR VALUES FROM ('${fromDate}') TO ('${toDate}');
    `);
  }
};

exports.down = (pgm) => {
  pgm.dropTable('traces', { cascade: true });
};
