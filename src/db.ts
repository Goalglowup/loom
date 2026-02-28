/**
 * Database query helper — thin shim over the ORM's knex instance.
 * analytics.ts, tracing.ts, and dashboard routes use this for raw SQL.
 * Tests mock this module via vi.mock('../src/db.js').
 */
import { orm } from './orm.js';

export async function query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> {
  const knex = (orm as any).em.getKnex();
  const result = await knex.raw(sql, params ?? []);
  return { rows: result.rows };
}
