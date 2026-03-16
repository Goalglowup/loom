/**
 * Add API key expiry and rotation support.
 * - expires_at: optional expiration timestamp for API keys
 * - rotated_from_id: links a new key to the key it replaced
 * - Partial index on active keys with expiry for efficient expiry checks
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumns('api_keys', {
    expires_at: {
      type: 'timestamptz',
      notNull: false,
    },
    rotated_from_id: {
      type: 'uuid',
      notNull: false,
      references: 'api_keys(id)',
      onDelete: 'SET NULL',
    },
  });

  pgm.createIndex('api_keys', ['expires_at'], {
    name: 'idx_api_keys_active_expiry',
    where: "status = 'active' AND expires_at IS NOT NULL",
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('api_keys', [], { name: 'idx_api_keys_active_expiry' });
  pgm.dropColumns('api_keys', ['expires_at', 'rotated_from_id']);
};
