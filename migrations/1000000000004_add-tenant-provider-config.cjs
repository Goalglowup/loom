/**
 * Add provider_config JSONB column to tenants.
 * Stores per-tenant provider routing config (provider, apiKey, deployment, etc.)
 * Nullable — if absent, the gateway falls back to environment-variable defaults.
 */
exports.up = (pgm) => {
  pgm.addColumns('tenants', {
    provider_config: {
      type: 'jsonb',
      notNull: false,
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('tenants', ['provider_config']);
};
