import pg from 'pg';

const { Client } = pg;

export interface TestDatabaseConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}

export class TestDatabaseFixture {
  private config: Required<TestDatabaseConfig>;
  private client: pg.Client | null = null;

  constructor(config: TestDatabaseConfig = {}) {
    this.config = {
      host: config.host || process.env.TEST_DB_HOST || 'localhost',
      port: config.port || Number(process.env.TEST_DB_PORT) || 5432,
      user: config.user || process.env.TEST_DB_USER || 'postgres',
      password: config.password || process.env.TEST_DB_PASSWORD || 'postgres',
      database: config.database || process.env.TEST_DB_NAME || 'loom_test'
    };
  }

  async connect(): Promise<void> {
    this.client = new Client(this.config);
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }

  async createSchema(): Promise<void> {
    if (!this.client) throw new Error('Database not connected');

    await this.client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        api_key VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.client.query(`
      CREATE TABLE IF NOT EXISTS traces (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        trace_id VARCHAR(255) NOT NULL,
        request_id VARCHAR(255),
        provider VARCHAR(50) NOT NULL,
        model VARCHAR(255) NOT NULL,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        latency_ms INTEGER,
        cost_usd DECIMAL(10, 6),
        status VARCHAR(50),
        error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.client.query(`
      CREATE INDEX IF NOT EXISTS idx_traces_tenant_id ON traces(tenant_id)
    `);

    await this.client.query(`
      CREATE INDEX IF NOT EXISTS idx_traces_created_at ON traces(created_at)
    `);
  }

  async seed(): Promise<void> {
    if (!this.client) throw new Error('Database not connected');

    await this.client.query(`
      INSERT INTO tenants (name, api_key) VALUES
        ('test-tenant-1', 'test-key-1'),
        ('test-tenant-2', 'test-key-2')
      ON CONFLICT (name) DO NOTHING
    `);
  }

  async teardown(): Promise<void> {
    if (!this.client) throw new Error('Database not connected');

    await this.client.query('DROP TABLE IF EXISTS traces CASCADE');
    await this.client.query('DROP TABLE IF EXISTS tenants CASCADE');
  }

  async clean(): Promise<void> {
    if (!this.client) throw new Error('Database not connected');

    await this.client.query('DELETE FROM traces');
    await this.client.query('DELETE FROM tenants');
  }

  async query(sql: string, params?: any[]): Promise<pg.QueryResult> {
    if (!this.client) throw new Error('Database not connected');
    return this.client.query(sql, params);
  }

  getClient(): pg.Client {
    if (!this.client) throw new Error('Database not connected');
    return this.client;
  }
}
