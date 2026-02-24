import pg from 'pg';

/**
 * Shared PostgreSQL connection pool.
 * Reads DATABASE_URL from the environment; falls back to local dev defaults.
 */
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://loom:loom_dev_password@localhost:5432/loom',
  max: 10,
});

/**
 * Execute a parameterised SQL statement against the shared pool.
 */
export async function query(sql: string, params?: unknown[]): Promise<pg.QueryResult> {
  return pool.query(sql, params as any[]);
}

export { pool };

// Drain the pool cleanly on SIGTERM so in-flight writes can complete.
process.on('SIGTERM', () => {
  pool.end().finally(() => process.exit(0));
});
