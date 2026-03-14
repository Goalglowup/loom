/**
 * Add default embedder configuration columns to settings table.
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumns('settings', {
    default_embedder_provider: {
      type: 'varchar(50)',
      notNull: false,
    },
    default_embedder_model: {
      type: 'varchar(255)',
      notNull: false,
    },
    default_embedder_api_key: {
      type: 'text',
      notNull: false,
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('settings', [
    'default_embedder_provider',
    'default_embedder_model',
    'default_embedder_api_key',
  ]);
};
