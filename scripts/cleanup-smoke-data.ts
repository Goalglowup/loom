/**
 * Deletes all data created by smoke tests (users/tenants with @test.loom.local emails).
 * Safe to run against the dev DB at any time.
 *
 * Usage:
 *   npm run smoke:cleanup
 */
import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://loom:loom_dev_password@localhost:5432/loom',
});

async function cleanupSmokeData() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Identify smoke tenants via their users' emails
    // users.email is unique; tenant link is through tenant_memberships
    const { rows: tenantRows } = await client.query<{ id: string }>(
      `SELECT DISTINCT tm.tenant_id AS id
       FROM users u
       JOIN tenant_memberships tm ON tm.user_id = u.id
       WHERE u.email LIKE '%@test.loom.local'`,
    );
    const smokeIds = tenantRows.map((r) => r.id);

    if (smokeIds.length === 0) {
      console.log('No smoke test data found — nothing to clean up.');
      await client.query('ROLLBACK');
      return;
    }

    console.log(`Found ${smokeIds.length} smoke tenant(s) — deleting...`);

    // Also find any subtenants (parent_id points to a smoke tenant)
    const { rows: subRows } = await client.query<{ id: string }>(
      `WITH RECURSIVE tree AS (
         SELECT id FROM tenants WHERE id = ANY($1::uuid[])
         UNION ALL
         SELECT t.id FROM tenants t JOIN tree ON t.parent_id = tree.id
       )
       SELECT id FROM tree`,
      [smokeIds],
    );
    const allIds = subRows.map((r) => r.id);

    // Delete in FK-safe order
    await client.query(`DELETE FROM traces             WHERE tenant_id = ANY($1::uuid[])`, [allIds]);
    await client.query(`DELETE FROM api_keys           WHERE tenant_id = ANY($1::uuid[])`, [allIds]);
    await client.query(`DELETE FROM agents             WHERE tenant_id = ANY($1::uuid[])`, [allIds]);
    await client.query(`DELETE FROM invites            WHERE tenant_id = ANY($1::uuid[])`, [allIds]);
    await client.query(`DELETE FROM tenant_memberships WHERE tenant_id = ANY($1::uuid[])`, [allIds]);
    // Delete orphaned users (no remaining memberships)
    await client.query(
      `DELETE FROM users WHERE email LIKE '%@test.loom.local'
         AND id NOT IN (SELECT user_id FROM tenant_memberships)`,
    );
    // Delete leaf-first (children before parents) via reverse-depth ordering
    await client.query(
      `WITH RECURSIVE tree AS (
         SELECT id, 0 AS depth FROM tenants WHERE id = ANY($1::uuid[])
         UNION ALL
         SELECT t.id, tree.depth + 1 FROM tenants t JOIN tree ON t.parent_id = tree.id
       )
       DELETE FROM tenants WHERE id IN (SELECT id FROM tree)`,
      [smokeIds],
    );

    await client.query('COMMIT');
    console.log(`✅ Deleted ${allIds.length} tenant(s) and all associated smoke test data.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Cleanup failed — transaction rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupSmokeData();
