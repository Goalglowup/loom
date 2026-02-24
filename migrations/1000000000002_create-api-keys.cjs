exports.up = (pgm) => {
  pgm.createTable('api_keys', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { 
      type: 'uuid', 
      notNull: true,
      references: 'tenants(id)',
      onDelete: 'CASCADE'
    },
    key_hash: { type: 'varchar(255)', notNull: true, unique: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.createIndex('api_keys', 'tenant_id');
  pgm.createIndex('api_keys', 'key_hash');
};

exports.down = (pgm) => {
  pgm.dropTable('api_keys');
};
