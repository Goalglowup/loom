/**
 * Migration: Create admin_users table
 * 
 * Admin users are Loom operators (not tenants).
 * Passwords hashed with scrypt.
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('admin_users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    username: {
      type: 'varchar(255)',
      notNull: true,
      unique: true
    },
    password_hash: {
      type: 'varchar(255)',
      notNull: true
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    },
    last_login: {
      type: 'timestamptz'
    }
  });

  pgm.createIndex('admin_users', 'username');

  // Seed default admin user from env vars
  const crypto = require('crypto');
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'changeme';

  // Hash password with scrypt (64-byte salt + 64-byte derived key)
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  const passwordHash = `${salt}:${derivedKey}`;

  pgm.sql(`
    INSERT INTO admin_users (username, password_hash)
    VALUES ('${username}', '${passwordHash}')
    ON CONFLICT (username) DO NOTHING
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('admin_users');
};
