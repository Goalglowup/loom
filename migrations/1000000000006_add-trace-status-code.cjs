/**
 * Add status_code column to traces table.
 * Required for F9 dashboard API trace listings.
 */
exports.up = (pgm) => {
  pgm.addColumns('traces', {
    status_code: { type: 'smallint', notNull: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('traces', ['status_code']);
};
