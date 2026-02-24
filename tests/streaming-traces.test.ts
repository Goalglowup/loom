/**
 * H6: Streaming & Trace Recording Tests (issue #16)
 *
 * Covers the full streaming + recording pipeline:
 * - SSE stream pass-through: client receives chunks unchanged
 * - StreamCapture assembles complete response from SSE deltas
 * - traceRecorder.record() called exactly once after stream completes
 * - [DONE] termination signal ends the stream cleanly
 * - Stream failure mid-way: current behavior (no trace recorded on error)
 * - Batch flush: 100 traces trigger immediate flush (mocked query)
 * - Timer flush: traces flush after 5 s even when batch is not full (fake timers)
 * - Fire-and-forget: stream ends without waiting for DB write
 *
 * db.js is always mocked (no real PostgreSQL needed).
 * tracing.js singleton is replaced with spies for SSE tests;
 * the real TraceRecorder class is instantiated directly for batch/timer tests.
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
import { Readable, Writable, PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// ── Module mocks (hoisted by Vitest) ──────────────────────────────────────

vi.mock('../src/db.js', () => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  pool: { end: vi.fn() },
}));

vi.mock('../src/tracing.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/tracing.js')>();
  return {
    // Real class — usable in batch/timer describe blocks
    TraceRecorder: actual.TraceRecorder,
    // Mock singleton — used by createSSEProxy via module import
    traceRecorder: {
      record: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    },
  };
});

// ── Imports (after mocks are declared) ────────────────────────────────────

import { createSSEProxy, type StreamCapture } from '../src/streaming.js';
import { TraceRecorder } from '../src/tracing.js';
import { traceRecorder } from '../src/tracing.js';
import { query } from '../src/db.js';

// ── Helpers ────────────────────────────────────────────────────────────────

const TEST_MASTER_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/** Build a realistic SSE payload from an array of content strings. */
function buildSSEStream(contents: string[], includeDone = true): string {
  const chunks = contents.map((content, i) =>
    `data: ${JSON.stringify({
      id: `chatcmpl-test-${i}`,
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    })}\n\n`
  );
  if (includeDone) {
    chunks.push('data: [DONE]\n\n');
  }
  return chunks.join('');
}

/** Pipe a string through the given Transform and collect output. */
async function pipeThrough(
  transform: ReturnType<typeof createSSEProxy>,
  input: string
): Promise<Buffer> {
  const source = Readable.from([Buffer.from(input, 'utf8')]);
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk);
      cb();
    },
  });

  await pipeline(source, transform, sink);
  return Buffer.concat(chunks);
}

// ── SSE proxy pass-through and capture tests ──────────────────────────────

describe('createSSEProxy — pass-through and StreamCapture', () => {
  let capturedResult: StreamCapture | null;

  beforeEach(() => {
    capturedResult = null;
    vi.clearAllMocks();
  });

  it('passes every raw byte to the client unchanged', async () => {
    const input = buildSSEStream(['Hello', ' world', '!']);
    const proxy = createSSEProxy({ onComplete: () => {} });

    const output = await pipeThrough(proxy, input);

    expect(output.toString('utf8')).toBe(input);
  });

  it('StreamCapture assembles complete content from SSE deltas', async () => {
    const words = ['The', ' quick', ' brown', ' fox'];
    const input = buildSSEStream(words);

    const proxy = createSSEProxy({
      onComplete: (capture) => {
        capturedResult = capture;
      },
    });

    await pipeThrough(proxy, input);

    expect(capturedResult).not.toBeNull();
    expect(capturedResult!.content).toBe(words.join(''));
    expect(capturedResult!.chunks).toHaveLength(words.length);
  });

  it('[DONE] termination signal does not add a chunk and ends stream cleanly', async () => {
    const input = buildSSEStream(['Hi'], true);

    const proxy = createSSEProxy({
      onComplete: (capture) => {
        capturedResult = capture;
      },
    });

    await expect(pipeThrough(proxy, input)).resolves.toBeDefined();

    // [DONE] should not be pushed as a parsed chunk
    expect(capturedResult!.chunks).toHaveLength(1);
    expect(capturedResult!.content).toBe('Hi');
  });

  it('traceRecorder.record() is called exactly once when traceContext is provided', async () => {
    const input = buildSSEStream(['Hello', ' there']);

    const proxy = createSSEProxy({
      onComplete: () => {},
      traceContext: {
        tenantId: 'tenant-test-001',
        requestBody: { model: 'gpt-4', messages: [] },
        model: 'gpt-4',
        provider: 'openai',
        startTimeMs: Date.now(),
      },
    });

    await pipeThrough(proxy, input);

    expect((traceRecorder.record as Mock)).toHaveBeenCalledTimes(1);
  });

  it('traceRecorder.record() is NOT called when traceContext is omitted', async () => {
    const input = buildSSEStream(['Hi']);

    const proxy = createSSEProxy({ onComplete: () => {} });
    await pipeThrough(proxy, input);

    expect((traceRecorder.record as Mock)).not.toHaveBeenCalled();
  });

  it('stream failure mid-way: traceRecorder.record() is not called (fire-and-forget safety)', async () => {
    // The Transform flush() is only invoked on clean stream end.
    // On upstream error the flush is skipped, so no partial trace is recorded.
    // TODO: add explicit error-path trace recording for partial streams.
    const proxy = createSSEProxy({
      onComplete: () => {},
      traceContext: {
        tenantId: 'tenant-test-001',
        requestBody: {},
        model: 'gpt-4',
        provider: 'openai',
        startTimeMs: Date.now(),
      },
    });

    const errorSource = new Readable({
      read() {
        this.push(Buffer.from('data: {"id":"c1","choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n'));
        this.destroy(new Error('upstream connection reset'));
      },
    });

    await expect(pipeline(errorSource, proxy, new PassThrough())).rejects.toThrow();
    expect((traceRecorder.record as Mock)).not.toHaveBeenCalled();
  });

  it('fire-and-forget: stream ends without waiting for DB write (record is sync)', async () => {
    // record() is a void sync method — it enqueues without awaiting any I/O.
    // The stream flush callback should complete immediately.
    let recordCalledAt = 0;
    let streamEndedAt = 0;

    (traceRecorder.record as Mock).mockImplementationOnce(() => {
      recordCalledAt = Date.now();
    });

    const input = buildSSEStream(['Done']);
    const proxy = createSSEProxy({
      onComplete: () => {
        streamEndedAt = Date.now();
      },
      traceContext: {
        tenantId: 'tenant-test-001',
        requestBody: {},
        model: 'gpt-4',
        provider: 'openai',
        startTimeMs: Date.now() - 50,
      },
    });

    await pipeThrough(proxy, input);

    // Both onComplete and record() happen synchronously in flush(); neither blocks the other
    expect(streamEndedAt).toBeGreaterThan(0);
    expect(recordCalledAt).toBeGreaterThan(0);
  });
});

// ── TraceRecorder batch and timer flush tests ─────────────────────────────

describe('TraceRecorder — batch flush and timer flush', () => {
  let recorder: TraceRecorder;

  const baseTrace = {
    tenantId: 'batch-tenant-001',
    model: 'gpt-4',
    provider: 'openai',
    requestBody: { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] },
    responseBody: { content: 'hello' },
    latencyMs: 100,
  };

  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    (query as Mock).mockClear();
  });

  afterEach(() => {
    recorder?.stop();
    delete process.env.ENCRYPTION_MASTER_KEY;
    vi.useRealTimers();
  });

  it('batch of 100 traces triggers an immediate flush (mocked query)', async () => {
    recorder = new TraceRecorder();

    for (let i = 0; i < 100; i++) {
      recorder.record({ ...baseTrace, requestId: `req-${i}` });
    }

    // void flush() is fire-and-forget; yield to the microtask queue
    await new Promise((resolve) => setImmediate(resolve));

    expect(query).toHaveBeenCalled();
    // 100 individual INSERT calls expected (one per row in the flush loop)
    expect((query as Mock).mock.calls.length).toBeGreaterThanOrEqual(100);
  });

  it('timer flush: traces are written after 5 s even when batch is not full', async () => {
    vi.useFakeTimers();
    recorder = new TraceRecorder();

    // Add fewer than 100 traces
    for (let i = 0; i < 5; i++) {
      recorder.record({ ...baseTrace, requestId: `req-${i}` });
    }

    expect(query).not.toHaveBeenCalled();

    // Advance fake clock by FLUSH_INTERVAL_MS (5 000 ms)
    await vi.advanceTimersByTimeAsync(5_000);

    expect(query).toHaveBeenCalled();
  });
});
