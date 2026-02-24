/**
 * H7: Encryption-at-Rest Tests (issue #17)
 *
 * Validates that sensitive trace data is encrypted before it reaches the database:
 * - request_body is stored as ciphertext (not plaintext)
 * - response_body is stored as ciphertext (not plaintext)
 * - Two traces from the same tenant use distinct IVs (nonces are unique)
 * - Two traces from different tenants produce distinct ciphertext for identical content
 * - Decryption with the wrong tenant key throws (no silent data corruption)
 * - IV is stored alongside ciphertext in the trace record
 * - Missing ENCRYPTION_MASTER_KEY env var causes encryption calls to fail with a clear error
 *
 * Mocks query() from src/db.js to capture INSERT parameters — no real DB required.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from 'vitest';

// ── Module mock ────────────────────────────────────────────────────────────

vi.mock('../src/db.js', () => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  pool: { end: vi.fn() },
}));

// ── Imports ────────────────────────────────────────────────────────────────

import { TraceRecorder } from '../src/tracing.js';
import { encryptTraceBody, decryptTraceBody } from '../src/encryption.js';
import { query } from '../src/db.js';

// ── Constants ──────────────────────────────────────────────────────────────

const TEST_MASTER_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const TENANT_1 = 'cccccccc-0000-0000-0000-000000000001';
const TENANT_2 = 'dddddddd-0000-0000-0000-000000000002';

const PLAIN_REQUEST = JSON.stringify({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
});

const PLAIN_RESPONSE = JSON.stringify({
  id: 'chatcmpl-xyz',
  choices: [{ message: { role: 'assistant', content: 'Paris.' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Extract INSERT parameters from the first call to the mocked query(). */
function getInsertParams(callIndex = 0): unknown[] {
  const calls = (query as Mock).mock.calls;
  if (calls.length <= callIndex) throw new Error(`query() call[${callIndex}] not found`);
  return calls[callIndex][1] as unknown[];
}

// Parameter indices in the TraceRecorder INSERT statement:
//   $1  tenant_id       → index 0
//   $2  request_id      → index 1
//   $3  model           → index 2
//   $4  provider        → index 3
//   $5  endpoint        → index 4
//   $6  request_body_ct → index 5  (encrypted ciphertext)
//   $7  request_iv      → index 6
//   $8  response_body_ct→ index 7  (encrypted ciphertext)
//   $9  response_iv     → index 8
//   $10 latency_ms      → index 9
const IDX = {
  tenantId: 0,
  requestBodyCt: 5,
  requestIv: 6,
  responseBodyCt: 7,
  responseIv: 8,
} as const;

// ── Tests ──────────────────────────────────────────────────────────────────

describe('H7: Encryption-at-Rest', () => {
  let recorder: TraceRecorder;

  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    (query as Mock).mockClear();
    recorder = new TraceRecorder();
  });

  afterEach(() => {
    recorder.stop();
    delete process.env.ENCRYPTION_MASTER_KEY;
  });

  // ── Ciphertext vs plaintext ────────────────────────────────────────────

  it('TraceRecorder stores request_body as ciphertext, not plaintext', async () => {
    recorder.record({
      tenantId: TENANT_1,
      model: 'gpt-4',
      provider: 'openai',
      requestBody: JSON.parse(PLAIN_REQUEST),
      responseBody: null,
      latencyMs: 50,
    });
    await recorder.flush();

    const params = getInsertParams();
    const storedRequestBody = params[IDX.requestBodyCt] as string;

    expect(storedRequestBody).not.toBe(PLAIN_REQUEST);
    expect(storedRequestBody).toMatch(/^[0-9a-f]+$/i); // hex-encoded ciphertext
  });

  it('TraceRecorder stores response_body as ciphertext, not plaintext', async () => {
    recorder.record({
      tenantId: TENANT_1,
      model: 'gpt-4',
      provider: 'openai',
      requestBody: {},
      responseBody: JSON.parse(PLAIN_RESPONSE),
      latencyMs: 120,
    });
    await recorder.flush();

    const params = getInsertParams();
    const storedResponseBody = params[IDX.responseBodyCt] as string;

    expect(storedResponseBody).toBeDefined();
    expect(storedResponseBody).not.toBeNull();
    expect(storedResponseBody).not.toBe(PLAIN_RESPONSE);
    expect(storedResponseBody).toMatch(/^[0-9a-f]+$/i);
  });

  // ── IV uniqueness ──────────────────────────────────────────────────────

  it('two traces from the same tenant use different IVs (nonces are unique)', async () => {
    const traceBase = {
      tenantId: TENANT_1,
      model: 'gpt-4',
      provider: 'openai',
      requestBody: JSON.parse(PLAIN_REQUEST),
      responseBody: null,
      latencyMs: 50,
    };

    recorder.record({ ...traceBase, requestId: 'req-iv-1' });
    recorder.record({ ...traceBase, requestId: 'req-iv-2' });
    await recorder.flush();

    const iv1 = getInsertParams(0)[IDX.requestIv] as string;
    const iv2 = getInsertParams(1)[IDX.requestIv] as string;

    expect(iv1).not.toBe(iv2);
    // IVs must be exactly 12 bytes = 24 hex chars
    expect(iv1).toMatch(/^[0-9a-f]{24}$/i);
    expect(iv2).toMatch(/^[0-9a-f]{24}$/i);
  });

  // ── IV stored alongside ciphertext ────────────────────────────────────

  it('IV is stored alongside ciphertext in the INSERT parameters', async () => {
    recorder.record({
      tenantId: TENANT_1,
      model: 'gpt-4',
      provider: 'openai',
      requestBody: JSON.parse(PLAIN_REQUEST),
      responseBody: JSON.parse(PLAIN_RESPONSE),
      latencyMs: 80,
    });
    await recorder.flush();

    const params = getInsertParams();

    // Both request and response should have their IVs stored
    const requestIv = params[IDX.requestIv] as string;
    const responseIv = params[IDX.responseIv] as string;

    expect(requestIv).toMatch(/^[0-9a-f]{24}$/i);
    expect(responseIv).toMatch(/^[0-9a-f]{24}$/i);
  });

  // ── Cross-tenant ciphertext isolation ─────────────────────────────────

  it('two traces from different tenants produce distinct ciphertext for identical content', async () => {
    recorder.record({
      tenantId: TENANT_1,
      requestId: 'req-tenant1',
      model: 'gpt-4',
      provider: 'openai',
      requestBody: JSON.parse(PLAIN_REQUEST),
      responseBody: null,
      latencyMs: 60,
    });
    recorder.record({
      tenantId: TENANT_2,
      requestId: 'req-tenant2',
      model: 'gpt-4',
      provider: 'openai',
      requestBody: JSON.parse(PLAIN_REQUEST), // identical content
      responseBody: null,
      latencyMs: 60,
    });
    await recorder.flush();

    const ctTenant1 = getInsertParams(0)[IDX.requestBodyCt] as string;
    const ctTenant2 = getInsertParams(1)[IDX.requestBodyCt] as string;

    // Different per-tenant keys produce different ciphertext even for identical plaintext
    expect(ctTenant1).not.toBe(ctTenant2);
  });

  // ── Decryption failure modes ───────────────────────────────────────────

  it('decryption with wrong tenant key throws (no silently wrong data)', () => {
    const { ciphertext, iv } = encryptTraceBody(TENANT_1, PLAIN_REQUEST);

    // TENANT_2 has a different derived key — decryption must fail, not silently return garbage
    expect(() => decryptTraceBody(TENANT_2, ciphertext, iv)).toThrow();
  });

  // ── Missing master key error ───────────────────────────────────────────

  it('missing ENCRYPTION_MASTER_KEY env var causes encryption to fail with a clear error', () => {
    delete process.env.ENCRYPTION_MASTER_KEY;

    expect(() => encryptTraceBody(TENANT_1, 'sensitive data')).toThrow(
      'ENCRYPTION_MASTER_KEY environment variable not set'
    );
  });
});
