/**
 * Migration F-MT2: Add management columns to api_keys table.
 * Supports API key naming, prefix display, and revocation tracking.
 */
exports.up = (pgm) => {
  pgm.addColumns('api_keys', {
    name: { 
      type: 'varchar(255)', 
      notNull: true, 
      default: 'Default Key' 
    },
    key_prefix: { 
      type: 'varchar(20)', 
      notNull: true, 
      default: '' 
    },
    status: { 
      type: 'varchar(20)', 
      notNull: true, 
      default: 'active' 
    },
    revoked_at: { 
      type: 'timestamptz', 
      notNull: false 
    }
  });

  pgm.createIndex('api_keys', 'status');
};

exports.down = (pgm) => {
  pgm.dropIndex('api_keys', 'status');
  pgm.dropColumns('api_keys', ['name', 'key_prefix', 'status', 'revoked_at']);
};
