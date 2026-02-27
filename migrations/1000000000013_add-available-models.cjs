exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('tenants', {
    available_models: { type: 'jsonb' },
  });
  pgm.addColumns('agents', {
    available_models: { type: 'jsonb' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('agents', ['available_models']);
  pgm.dropColumns('tenants', ['available_models']);
};
