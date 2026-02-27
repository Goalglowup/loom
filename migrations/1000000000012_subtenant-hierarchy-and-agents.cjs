/**
 * Migration: Subtenant hierarchy + agents
 *
 * Adds:
 *   - tenants.parent_id   – self-referencing FK for subtenant hierarchy
 *   - tenants.system_prompt, skills, mcp_endpoints – inheritable agent defaults
 *   - agents              – named agent configurations per tenant
 *   - api_keys.agent_id   – each key is bound to exactly one agent
 *   - traces.agent_id     – nullable back-reference for existing rows
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // ── Step 1: hierarchy + agent defaults on tenants ─────────────────────────
  pgm.addColumns('tenants', {
    parent_id:     { type: 'uuid', references: '"tenants"', onDelete: 'CASCADE' },
    system_prompt: { type: 'text' },
    skills:        { type: 'jsonb' },
    mcp_endpoints: { type: 'jsonb' },
  });

  // ── Step 2: agents table ───────────────────────────────────────────────────
  pgm.createTable('agents', {
    id:             { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id:      { type: 'uuid', notNull: true, references: '"tenants"', onDelete: 'CASCADE' },
    name:           { type: 'varchar(255)', notNull: true },
    provider_config: { type: 'jsonb' },
    system_prompt:  { type: 'text' },
    skills:         { type: 'jsonb' },
    mcp_endpoints:  { type: 'jsonb' },
    merge_policies: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func(`'{"system_prompt":"prepend","skills":"merge","mcp_endpoints":"merge"}'`),
    },
    created_at:     { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:     { type: 'timestamptz' },
  });
  pgm.createIndex('agents', 'tenant_id');

  // ── Step 3: seed a "Default" agent for every existing tenant ──────────────
  pgm.sql(`
    INSERT INTO agents (tenant_id, name, provider_config, merge_policies, created_at)
    SELECT id, 'Default', provider_config, '{"system_prompt":"prepend","skills":"merge","mcp_endpoints":"merge"}', now()
    FROM tenants
  `);

  // ── Step 4: agent_id on api_keys ──────────────────────────────────────────
  pgm.addColumns('api_keys', {
    agent_id: { type: 'uuid', references: '"agents"', onDelete: 'CASCADE' },
  });
  pgm.sql(`
    UPDATE api_keys ak
    SET agent_id = a.id
    FROM agents a
    WHERE a.tenant_id = ak.tenant_id AND a.name = 'Default'
  `);
  pgm.alterColumn('api_keys', 'agent_id', { notNull: true });
  pgm.createIndex('api_keys', 'agent_id');

  // ── Step 5: agent_id on traces (nullable for backward compat) ─────────────
  pgm.addColumns('traces', {
    agent_id: { type: 'uuid', references: '"agents"', onDelete: 'SET NULL' },
  });
  pgm.createIndex('traces', 'agent_id');
};

exports.down = (pgm) => {
  // ── Reverse Step 5 ────────────────────────────────────────────────────────
  pgm.dropIndex('traces', 'agent_id');
  pgm.dropColumns('traces', ['agent_id']);

  // ── Reverse Step 4 ────────────────────────────────────────────────────────
  pgm.dropIndex('api_keys', 'agent_id');
  pgm.dropColumns('api_keys', ['agent_id']);

  // ── Reverse Steps 3 + 2 ───────────────────────────────────────────────────
  pgm.dropTable('agents');

  // ── Reverse Step 1 ────────────────────────────────────────────────────────
  pgm.dropColumns('tenants', ['parent_id', 'system_prompt', 'skills', 'mcp_endpoints']);
};
