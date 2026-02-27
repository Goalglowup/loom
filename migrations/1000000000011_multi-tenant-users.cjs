/**
 * Migration: Multi-user multi-tenant schema
 *
 * Replaces the 1:1 tenant_users table with:
 *   - users           (auth identity, email unique across all tenants)
 *   - tenant_memberships  (junction: user ↔ tenant with role)
 *   - invites         (invite-link tokens per tenant)
 *
 * Existing tenant_users rows are migrated: each becomes a users row +
 * a tenant_memberships row preserving the existing role.
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // ── Step 1: users table ────────────────────────────────────────────────────
  pgm.createTable('users', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email:         { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    created_at:    { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_login:    { type: 'timestamptz' },
  });
  pgm.createIndex('users', 'email');

  // ── Step 2: migrate auth identity from tenant_users → users ───────────────
  pgm.sql(`
    INSERT INTO users (id, email, password_hash, created_at, last_login)
    SELECT id, email, password_hash, created_at, last_login
    FROM tenant_users
  `);

  // ── Step 3: tenant_memberships junction table ──────────────────────────────
  pgm.createTable('tenant_memberships', {
    id:        { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id:   { type: 'uuid', notNull: true, references: '"users"',   onDelete: 'CASCADE' },
    tenant_id: { type: 'uuid', notNull: true, references: '"tenants"', onDelete: 'CASCADE' },
    role:      { type: 'varchar(50)', notNull: true, default: "'member'" },
    joined_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('tenant_memberships', 'uq_tenant_memberships_user_tenant', {
    unique: ['user_id', 'tenant_id'],
  });
  pgm.createIndex('tenant_memberships', 'user_id');
  pgm.createIndex('tenant_memberships', 'tenant_id');

  // ── Step 4: migrate tenant relationships (preserving existing roles) ───────
  pgm.sql(`
    INSERT INTO tenant_memberships (user_id, tenant_id, role, joined_at)
    SELECT id, tenant_id, role, created_at
    FROM tenant_users
  `);

  // ── Step 5: invites table ──────────────────────────────────────────────────
  pgm.createTable('invites', {
    id:         { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:  { type: 'uuid', notNull: true, references: '"tenants"', onDelete: 'CASCADE' },
    token:      { type: 'varchar(64)', notNull: true, unique: true },
    created_by: { type: 'uuid', notNull: true, references: '"users"',   onDelete: 'CASCADE' },
    max_uses:   { type: 'integer' },
    use_count:  { type: 'integer', notNull: true, default: 0 },
    expires_at: { type: 'timestamptz', notNull: true },
    revoked_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('invites', 'token');
  pgm.createIndex('invites', 'tenant_id');
  pgm.createIndex('invites', 'created_by');

  // ── Step 6: drop old table ─────────────────────────────────────────────────
  pgm.dropTable('tenant_users');
};

exports.down = (pgm) => {
  // Recreate tenant_users
  pgm.createTable('tenant_users', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:     { type: 'uuid', notNull: true, references: '"tenants"', onDelete: 'CASCADE' },
    email:         { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    role:          { type: 'varchar(50)', notNull: true, default: "'owner'" },
    created_at:    { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_login:    { type: 'timestamptz' },
  });
  pgm.createIndex('tenant_users', 'tenant_id');
  pgm.createIndex('tenant_users', 'email');

  // Best-effort restore: first membership per user
  pgm.sql(`
    INSERT INTO tenant_users (id, tenant_id, email, password_hash, role, created_at, last_login)
    SELECT DISTINCT ON (u.id)
           u.id, tm.tenant_id, u.email, u.password_hash, tm.role, u.created_at, u.last_login
    FROM users u
    JOIN tenant_memberships tm ON tm.user_id = u.id
    ORDER BY u.id, tm.joined_at ASC
  `);

  pgm.dropTable('invites');
  pgm.dropTable('tenant_memberships');
  pgm.dropTable('users');
};
