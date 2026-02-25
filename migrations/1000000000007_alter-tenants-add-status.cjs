/**
 * Migration F-MT1: Add status and updated_at columns to tenants table.
 * Supports multi-tenant lifecycle management (active/inactive tenants).
 */
exports.up = (pgm) => {
  pgm.addColumns('tenants', {
    status: { 
      type: 'varchar(20)', 
      notNull: true, 
      default: 'active' 
    },
    updated_at: { 
      type: 'timestamptz', 
      notNull: true, 
      default: pgm.func('now()') 
    }
  });

  pgm.createIndex('tenants', 'status');
};

exports.down = (pgm) => {
  pgm.dropIndex('tenants', 'status');
  pgm.dropColumns('tenants', ['status', 'updated_at']);
};
