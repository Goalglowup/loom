import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TestDatabaseFixture } from '../fixtures/test-database';

describe('Test Database Fixture', () => {
  let db: TestDatabaseFixture;
  const skipDbTests = !process.env.TEST_DB_ENABLED;

  beforeAll(async () => {
    if (skipDbTests) return;
    
    db = new TestDatabaseFixture();
    await db.connect();
    await db.createSchema();
  });

  afterAll(async () => {
    if (skipDbTests) return;
    
    await db.teardown();
    await db.disconnect();
  });

  beforeEach(async () => {
    if (skipDbTests) return;
    await db.clean();
  });

  it.skipIf(skipDbTests)('should connect to test database', () => {
    expect(db.getClient()).toBeDefined();
  });

  it.skipIf(skipDbTests)('should create schema with tenants and traces tables', async () => {
    const result = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('tenants', 'traces')
    `);
    
    expect(result.rows).toHaveLength(2);
    const tableNames = result.rows.map(row => row.table_name);
    expect(tableNames).toContain('tenants');
    expect(tableNames).toContain('traces');
  });

  it.skipIf(skipDbTests)('should seed test tenants', async () => {
    await db.seed();
    
    const result = await db.query('SELECT * FROM tenants ORDER BY id');
    
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe('test-tenant-1');
    expect(result.rows[0].api_key).toBe('test-key-1');
    expect(result.rows[1].name).toBe('test-tenant-2');
    expect(result.rows[1].api_key).toBe('test-key-2');
  });

  it.skipIf(skipDbTests)('should insert and query traces', async () => {
    await db.seed();
    
    const tenantResult = await db.query(
      'SELECT id FROM tenants WHERE name = $1',
      ['test-tenant-1']
    );
    const tenantId = tenantResult.rows[0].id;

    await db.query(`
      INSERT INTO traces 
        (tenant_id, trace_id, provider, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, status)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [tenantId, 'trace-123', 'openai', 'gpt-4', 10, 5, 15, 250, 'success']);

    const result = await db.query('SELECT * FROM traces WHERE trace_id = $1', ['trace-123']);
    
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].trace_id).toBe('trace-123');
    expect(result.rows[0].provider).toBe('openai');
    expect(result.rows[0].model).toBe('gpt-4');
    expect(result.rows[0].total_tokens).toBe(15);
    expect(result.rows[0].latency_ms).toBe(250);
  });

  it.skipIf(skipDbTests)('should clean test data', async () => {
    await db.seed();
    await db.clean();
    
    const tenantsResult = await db.query('SELECT * FROM tenants');
    const tracesResult = await db.query('SELECT * FROM traces');
    
    expect(tenantsResult.rows).toHaveLength(0);
    expect(tracesResult.rows).toHaveLength(0);
  });
});
