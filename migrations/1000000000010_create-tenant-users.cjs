exports.up = (pgm) => {
  pgm.createTable('tenant_users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: '"tenants"', onDelete: 'CASCADE' },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    role: { type: 'varchar(50)', notNull: true, default: "'owner'" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_login: { type: 'timestamptz' }
  });
  pgm.createIndex('tenant_users', 'tenant_id');
  pgm.createIndex('tenant_users', 'email');
};
exports.down = (pgm) => { pgm.dropTable('tenant_users'); };
