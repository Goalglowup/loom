/**
 * Script to reset admin password in dev environment
 * Usage: DATABASE_URL="..." tsx scripts/reset-admin-password.ts <username> <new-password>
 */
import { scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

async function resetAdminPassword(username: string, newPassword: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log(`[reset-password] Connected to database`);

    // Hash the new password
    const passwordHash = await hashPassword(newPassword);
    console.log(`[reset-password] Password hashed`);

    // Update the admin user
    const result = await client.query(
      `UPDATE admin_users
       SET password_hash = $1, must_change_password = false
       WHERE username = $2
       RETURNING id, username`,
      [passwordHash, username]
    );

    if (result.rowCount === 0) {
      throw new Error(`Admin user '${username}' not found`);
    }

    console.log(`[reset-password] ✓ Password reset for user '${username}'`);
    console.log(`[reset-password] User ID: ${result.rows[0].id}`);

  } finally {
    await client.end();
  }
}

const [username, newPassword] = process.argv.slice(2);

if (!username || !newPassword) {
  console.error('Usage: tsx scripts/reset-admin-password.ts <username> <new-password>');
  console.error('Example: DATABASE_URL="..." tsx scripts/reset-admin-password.ts admin myNewPassword123');
  process.exit(1);
}

resetAdminPassword(username, newPassword)
  .then(() => {
    console.log('[reset-password] Done');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[reset-password] Error:', err.message);
    process.exit(1);
  });
