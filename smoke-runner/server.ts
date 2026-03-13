import Fastify from 'fastify';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const GATEWAY_URL = process.env.LOOM_BASE_URL ?? 'http://localhost:3000';
const DATABASE_URL = process.env.DATABASE_URL;

let currentStatus: 'idle' | 'running' = 'idle';
let currentRunId: string | null = null;

const fastify = Fastify({ logger: true });

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
fastify.get('/health', async () => ({ status: 'ok' }));

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
fastify.get('/status', async () => ({
  status: currentStatus,
  runId: currentRunId,
}));

// ---------------------------------------------------------------------------
// Trigger test run
// ---------------------------------------------------------------------------
fastify.post('/run', async (request, reply) => {
  if (currentStatus === 'running') {
    return reply.code(409).send({ error: 'A test run is already in progress', runId: currentRunId });
  }

  const runId = randomUUID();
  currentRunId = runId;
  currentStatus = 'running';

  // Run async — return immediately
  runTests(runId, 'manual').catch((err) => {
    fastify.log.error({ err }, 'Test run failed');
  });

  return reply.code(202).send({ runId, status: 'running' });
});

// ---------------------------------------------------------------------------
// Test execution
// ---------------------------------------------------------------------------
interface TestResult {
  name: string;
  suite: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  error?: string;
}

async function runTests(runId: string, triggeredBy: 'startup' | 'manual'): Promise<void> {
  const startedAt = new Date();

  // Insert running row into DB
  await dbExec(
    `INSERT INTO smoke_test_runs (id, status, triggered_by, started_at, created_at)
     VALUES ($1, 'running', $2, $3, $3)`,
    [runId, triggeredBy, startedAt.toISOString()]
  );

  try {
    const { stdout, exitCode } = await spawnVitest();
    const parsed = parseVitestJson(stdout);

    const results: TestResult[] = parsed.testResults.flatMap((file: any) =>
      (file.assertionResults ?? []).map((t: any) => ({
        name: t.fullName ?? t.title ?? 'unknown',
        suite: file.name ?? 'unknown',
        status: t.status === 'passed' ? 'passed' : t.status === 'pending' ? 'skipped' : 'failed',
        duration_ms: t.duration ?? 0,
        ...(t.failureMessages?.length ? { error: t.failureMessages.join('\n') } : {}),
      }))
    );

    const total = results.length;
    const passed = results.filter((r) => r.status === 'passed').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const durationMs = Date.now() - startedAt.getTime();
    const status = failed > 0 || exitCode !== 0 ? 'failed' : 'passed';

    await dbExec(
      `UPDATE smoke_test_runs
       SET status = $1, total = $2, passed = $3, failed = $4, skipped = $5,
           duration_ms = $6, results = $7, completed_at = NOW()
       WHERE id = $8`,
      [status, total, passed, failed, skipped, durationMs, JSON.stringify(results), runId]
    );

    fastify.log.info({ runId, status, total, passed, failed }, 'Test run completed');
  } catch (err: any) {
    await dbExec(
      `UPDATE smoke_test_runs
       SET status = 'error', error_message = $1, completed_at = NOW()
       WHERE id = $2`,
      [err.message ?? String(err), runId]
    );
    fastify.log.error({ err, runId }, 'Test run errored');
  } finally {
    currentStatus = 'idle';
    currentRunId = null;

    // Run cleanup
    try {
      await spawnCleanup();
    } catch (err) {
      fastify.log.warn({ err }, 'Cleanup script failed');
    }
  }
}

// ---------------------------------------------------------------------------
// Spawn vitest with JSON reporter
// ---------------------------------------------------------------------------
function spawnVitest(): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'npx',
      ['vitest', 'run', '--project', 'smoke', '--reporter', 'json'],
      {
        env: { ...process.env, LOOM_BASE_URL: GATEWAY_URL },
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      resolve({ stdout, exitCode: code ?? 1 });
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn vitest: ${err.message}`));
    });

    // 10 minute timeout
    setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Test run timed out after 10 minutes'));
    }, 10 * 60 * 1000);
  });
}

// ---------------------------------------------------------------------------
// Spawn cleanup script
// ---------------------------------------------------------------------------
function spawnCleanup(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', 'scripts/cleanup-smoke-data.ts'], {
      env: process.env as NodeJS.ProcessEnv,
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Cleanup exited with code ${code}`));
    });

    proc.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Parse vitest JSON output (may have non-JSON preamble)
// ---------------------------------------------------------------------------
function parseVitestJson(stdout: string): any {
  // Vitest JSON reporter outputs a JSON object — find the first `{`
  const jsonStart = stdout.indexOf('{');
  if (jsonStart === -1) {
    return { testResults: [] };
  }
  try {
    return JSON.parse(stdout.slice(jsonStart));
  } catch {
    return { testResults: [] };
  }
}

// ---------------------------------------------------------------------------
// Simple DB helper using pg (raw SQL)
// ---------------------------------------------------------------------------
async function dbExec(sql: string, params: any[]): Promise<void> {
  if (!DATABASE_URL) {
    fastify.log.warn('DATABASE_URL not set — skipping DB write');
    return;
  }

  // Dynamic import to handle environments where pg might not be installed
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    await client.query(sql, params);
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// Wait for gateway to be healthy
// ---------------------------------------------------------------------------
async function waitForGateway(maxRetries = 30, delayMs = 2000): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(`${GATEWAY_URL}/health`);
      if (resp.ok) {
        fastify.log.info('Gateway is healthy');
        return;
      }
    } catch {
      // Gateway not ready yet
    }
    fastify.log.info({ attempt: i + 1, maxRetries }, 'Waiting for gateway...');
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Gateway not healthy after ${maxRetries} attempts`);
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function start(): Promise<void> {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  fastify.log.info(`Smoke runner listening on port ${PORT}`);

  // Wait for gateway, then auto-run tests
  try {
    await waitForGateway();
    const runId = randomUUID();
    currentRunId = runId;
    currentStatus = 'running';
    await runTests(runId, 'startup');
  } catch (err) {
    fastify.log.error({ err }, 'Startup test run failed');
  }
}

start().catch((err) => {
  console.error('Failed to start smoke runner:', err);
  process.exit(1);
});
