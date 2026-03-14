/**
 * Add tenant availability controls for gateway providers.
 * - `tenant_available` boolean on providers table (available to ALL tenants when true)
 * - `provider_tenant_access` junction table for per-tenant access grants
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  // Add tenant_available flag to providers
  pgm.addColumns('providers', {
    tenant_available: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });

  // Create junction table for per-tenant access
  pgm.createTable('provider_tenant_access', {
    provider_id: {
      type: 'uuid',
      notNull: true,
      references: '"providers"',
      onDelete: 'CASCADE',
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: '"tenants"',
      onDelete: 'CASCADE',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.addConstraint('provider_tenant_access', 'provider_tenant_access_pkey', {
    primaryKey: ['provider_id', 'tenant_id'],
  });

  pgm.createIndex('provider_tenant_access', 'tenant_id', {
    name: 'idx_provider_tenant_access_tenant',
  });
};

exports.down = (pgm) => {
  pgm.dropTable('provider_tenant_access');
  pgm.dropColumns('providers', ['tenant_available']);
};
