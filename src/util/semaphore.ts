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

  acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next(); // pass the permit straight to the waiter; permit count unchanged
    } else {
      this.permits++;
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
