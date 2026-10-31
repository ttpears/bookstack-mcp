import { IncomingMessage } from 'node:http';
import { PublicError } from './safe-errors.js';

export class HttpBodyError extends PublicError {
  constructor(readonly status: 400 | 408 | 413, message: string) {
    super(message);
  }
}

/** Bound buffering before JSON/form parsing, including chunked requests. */
export function readRequestBody(
  req: IncomingMessage,
  { maxBytes, timeoutMs = 30000 }: { maxBytes: number; timeoutMs?: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = () => {
      clearTimeout(timer);
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('aborted', onAborted);
    };
    const fail = (error: unknown) => {
      cleanup();
      chunks.length = 0;
      // A client can reset its socket after our early rejection.
      req.once('error', () => {});
      // Discard further bytes without buffering; the caller can still send 413.
      req.resume();
      reject(error);
    };
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) return fail(new HttpBodyError(413, 'Request body too large'));
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks, size).toString('utf8'));
    };
    const onError = (error: Error) => fail(error);
    const onAborted = () => fail(new HttpBodyError(400, 'Request body interrupted'));
    const timer = setTimeout(() => fail(new HttpBodyError(408, 'Request body timed out')), timeoutMs);
    timer.unref?.();
    if (req.aborted) return onAborted();
    const declared = req.headers['content-length'];
    if (typeof declared === 'string' && Number(declared) > maxBytes) {
      return fail(new HttpBodyError(413, 'Request body too large'));
    }
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
  });
}
