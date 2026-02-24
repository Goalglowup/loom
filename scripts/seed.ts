import 'dotenv/config';
import pg from 'pg';
import { createHash, randomBytes } from 'node:crypto';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://loom:loom_dev_password@localhost:5432/loom',
});

function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find or create tenant "dev"
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM tenants WHERE name = 'dev' LIMIT 1`,
    );

    let tenantId: string;
    if (existing.rows.length > 0) {
      tenantId = existing.rows[0].id;
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO tenants (id, name, created_at)
         VALUES (gen_random_uuid(), 'dev', NOW())
         RETURNING id`,
      );
      tenantId = inserted.rows[0].id;
    }

    // Generate a random API key: loom-dev-<8 hex chars>
    const rawKey = `loom-dev-${randomBytes(4).toString('hex')}`;
    const keyHash = hashApiKey(rawKey);

    // Replace any existing key for this tenant, then insert the new one
    await client.query(`DELETE FROM api_keys WHERE tenant_id = $1`, [tenantId]);
    await client.query(
      `INSERT INTO api_keys (id, tenant_id, key_hash, created_at)
       VALUES (gen_random_uuid(), $1, $2, NOW())`,
      [tenantId, keyHash],
    );

    await client.query('COMMIT');

    console.log('\n✅  Dev seed complete');
    console.log(`\n   Tenant : dev (${tenantId})`);
    console.log(`   API key: ${rawKey}\n`);
    console.log('   Copy this key into the chat app or set it as LOOM_API_KEY.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
