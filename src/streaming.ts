import { Transform } from 'node:stream';

export interface StreamCapture {
  /** Assembled text content from all delta chunks */
  content: string;
  /** All parsed SSE chunk objects, in order */
  chunks: any[];
  /** Token usage when provided by the provider (typically in the final chunk) */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StreamProxyOptions {
  /** Invoked once when the upstream stream ends with the fully captured data */
  onComplete: (capture: StreamCapture) => void;
}

/**
 * Create an SSE streaming Transform that simultaneously:
 *
 * 1. **Passes every raw chunk to the client immediately** — no buffering, no added latency
 * 2. **Parses SSE events in the background** to accumulate content for trace recording
 *
 * OpenAI / Azure SSE wire format:
 *   data: {"id":"...","choices":[{"delta":{"content":"Hi"},...}]}\n\n
 *   data: [DONE]\n\n
 *
 * The onComplete callback is fired once on stream end with the reconstructed
 * full content and raw chunk array ready for encrypted trace storage.
 *
 * @example
 * ```ts
 * const proxy = createSSEProxy({
 *   onComplete: (capture) => persistTrace({ responseBody: capture.content }),
 * });
 * upstreamStream.pipe(proxy).pipe(reply.raw);
 * ```
 */
export function createSSEProxy(options: StreamProxyOptions): Transform {
  const capture: StreamCapture = { content: '', chunks: [] };
  let parseBuffer = '';

  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      // Forward immediately — this keeps the pass-through latency near zero
      this.push(chunk);

      // Parse asynchronously against the accumulated buffer
      parseBuffer += chunk.toString('utf8');

      // SSE events are separated by \n\n — process all complete events
      let boundary: number;
      while ((boundary = parseBuffer.indexOf('\n\n')) !== -1) {
        const block = parseBuffer.slice(0, boundary);
        parseBuffer = parseBuffer.slice(boundary + 2);

        for (const line of block.split('\n')) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            capture.chunks.push(parsed);

            // Accumulate streamed content deltas
            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === 'string') {
              capture.content += delta;
            }

            // Some providers include usage in the final non-empty chunk
            if (parsed.usage) {
              capture.usage = parsed.usage;
            }
          } catch {
            // Skip malformed lines (shouldn't happen in well-formed SSE)
          }
        }
      }

      callback();
    },

    flush(callback) {
      // Stream has ended — deliver the accumulated capture to the caller
      options.onComplete(capture);
      callback();
    },
  });
}
