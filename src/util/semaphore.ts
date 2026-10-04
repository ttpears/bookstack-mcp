/**
 * Minimal async counting semaphore. Bounds how many async operations run at
 * once. `release()` hands a permit directly to the next waiter (FIFO) so a
 * burst of `acquire()` calls drains in order rather than thundering.
 */
export class Semaphore {
  private permits: number;
  private readonly waiters: Array<() => void> = [];

  constructor(max: number) {
    if (!Number.isInteger(max) || max < 1) {
      throw new Error(`Semaphore max must be an integer >= 1 (got ${max})`);
    }
    this.permits = max;
  }

  acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const grant = () => {
        signal?.removeEventListener('abort', cancel);
        resolve();
      };
      const cancel = () => {
        const index = this.waiters.indexOf(grant);
        if (index !== -1) this.waiters.splice(index, 1);
        reject(signal.reason);
      };
      this.waiters.push(grant);
      signal?.addEventListener('abort', cancel, { once: true });
    });
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next(); // pass the permit straight to the waiter; permit count unchanged
    } else {
      this.permits++;
    }
  }

  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      if (signal?.aborted) throw signal.reason;
      return await fn();
    } finally {
      this.release();
    }
  }
}
