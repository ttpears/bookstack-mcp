import { AxiosAdapter, AxiosError } from 'axios';
import { setTimeout as sleep } from 'node:timers/promises';
import { Semaphore } from './semaphore.js';

const MAX_RETRIES = 5;
const MAX_DELAY_MS = 30000;

export function retryDelay(value: unknown, retry: number): number {
  let delay = 1000 * 2 ** (retry - 1);
  if (typeof value === 'string' && value.trim()) {
    const seconds = Number(value);
    const parsed = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
    if (Number.isFinite(parsed)) delay = parsed;
  }
  return Math.min(MAX_DELAY_MS, Math.max(0, delay));
}

export class BookStackRateLimitError extends Error {
  readonly code = 'BOOKSTACK_RATE_LIMITED';
  readonly status = 429;

  constructor(readonly retryAfterMs: number, cause: unknown) {
    super('BookStack rate limited (HTTP 429): retry budget exhausted. Try again later or reduce parallel tool calls.', { cause });
    this.name = 'BookStackRateLimitError';
  }
}

/** One budget covers queueing, HTTP attempts and backoff. Permits are released
 * during backoff, and cancellation removes queued work instead of leaking it. */
export function rateLimitedAdapter(adapter: AxiosAdapter, limiter: Semaphore, budgetMs: number): AxiosAdapter {
  return async (config) => {
    const controller = new AbortController();
    const originalSignal = config.signal;
    const cancel = () => controller.abort();
    if (originalSignal?.aborted) cancel();
    originalSignal?.addEventListener?.('abort', cancel);
    const deadline = Date.now() + budgetMs;
    const timeoutError = new AxiosError('BookStack request deadline exceeded', 'ETIMEDOUT', config);
    const timer = setTimeout(() => controller.abort(timeoutError), budgetMs);
    let last429: AxiosError | undefined;
    let delay = 0;
    try {
      for (let retry = 0; ; retry++) {
        try {
          return await limiter.run(() => {
            const remaining = Math.max(1, deadline - Date.now());
            return adapter({
              ...config,
              signal: controller.signal,
              timeout: config.timeout > 0 ? Math.min(config.timeout, remaining) : remaining
            });
          }, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) throw error;
          if (!(error instanceof AxiosError) || error.response?.status !== 429) throw error;
          last429 = error;
          delay = retryDelay(error.response.headers?.['retry-after'], retry + 1);
          if (retry >= MAX_RETRIES || delay >= deadline - Date.now()) {
            throw new BookStackRateLimitError(delay, error);
          }
          console.error(`BookStack rate limited (429); retry ${retry + 1}/${MAX_RETRIES} in ${delay}ms`);
          await sleep(delay, undefined, { signal: controller.signal });
        }
      }
    } catch (error) {
      if (controller.signal.aborted && !originalSignal?.aborted) {
        if (last429) throw new BookStackRateLimitError(delay, last429);
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      originalSignal?.removeEventListener?.('abort', cancel);
    }
  };
}
