import test from 'node:test';
import assert from 'node:assert/strict';
import { AxiosAdapter, AxiosError } from 'axios';
import { BookStackRateLimitError, rateLimitedAdapter, retryDelay } from './rate-limit.js';
import { Semaphore } from './semaphore.js';

const config = { timeout: 30000, headers: {} } as any;
function limited(config: any, retryAfter: string): AxiosError {
  return new AxiosError('429', undefined, config, undefined, {
    status: 429, statusText: 'Too Many Requests', headers: { 'retry-after': retryAfter },
    data: {}, config
  });
}

test('Retry-After seconds and dates are capped; invalid headers use backoff', () => {
  assert.equal(retryDelay('999999', 1), 30000);
  assert.equal(retryDelay(new Date(Date.now() + 3600000).toUTCString(), 1), 30000);
  assert.equal(retryDelay('0', 1), 0);
  assert.equal(retryDelay('-1', 1), 0);
  assert.equal(retryDelay('not a date', 3), 4000);
  assert.equal(retryDelay(undefined, 10), 30000);
});

test('retries can recover and do not hold a concurrency permit during backoff', async () => {
  const limiter = new Semaphore(1);
  let attempts = 0;
  const adapter = rateLimitedAdapter(async cfg => {
    if (++attempts === 1) throw limited(cfg, '0.02');
    return { data: 'ok' } as any;
  }, limiter, 1000);
  const request = adapter(config);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(await limiter.run(async () => 'available'), 'available');
  assert.equal((await request).data, 'ok');
  assert.equal(attempts, 2);
});

test('sustained 429s stop after five retries with a distinct caller error', async () => {
  let attempts = 0;
  const adapter = rateLimitedAdapter(async cfg => {
    attempts++;
    throw limited(cfg, '0');
  }, new Semaphore(1), 1000);
  await assert.rejects(adapter(config), error => {
    assert.ok(error instanceof BookStackRateLimitError);
    assert.equal(error.code, 'BOOKSTACK_RATE_LIMITED');
    assert.match(error.message, /HTTP 429.*Try again later/);
    return true;
  });
  assert.equal(attempts, 6);
});

test('does not wait for Retry-After when it cannot fit in the remaining budget', async () => {
  let attempts = 0;
  const adapter = rateLimitedAdapter(async cfg => {
    attempts++;
    throw limited(cfg, '99999');
  }, new Semaphore(1), 100);
  await assert.rejects(adapter(config), BookStackRateLimitError);
  assert.equal(attempts, 1);
});

test('total deadline aborts an in-flight attempt following a 429', async () => {
  let attempts = 0;
  const adapter = rateLimitedAdapter(async cfg => {
    if (++attempts === 1) throw limited(cfg, '0');
    return new Promise((_resolve, reject) => {
      cfg.signal!.addEventListener!('abort', () => reject(new Error('aborted')));
    });
  }, new Semaphore(1), 30);
  await assert.rejects(adapter(config), BookStackRateLimitError);
  assert.equal(attempts, 2);
});

test('deadline removes queued work without sending a late request or leaking permits', async () => {
  const limiter = new Semaphore(1);
  await limiter.acquire();
  let attempts = 0;
  const base: AxiosAdapter = async () => { attempts++; return { data: 'ok' } as any; };
  await assert.rejects(rateLimitedAdapter(base, limiter, 20)(config), { code: 'ETIMEDOUT' });
  limiter.release();
  assert.equal((await rateLimitedAdapter(base, limiter, 1000)(config)).data, 'ok');
  assert.equal(attempts, 1);
});

test('caller cancellation interrupts backoff instead of starting another attempt', async () => {
  const controller = new AbortController();
  let attempts = 0;
  const adapter = rateLimitedAdapter(async cfg => {
    attempts++;
    throw limited(cfg, '0.1');
  }, new Semaphore(1), 1000);
  const request = adapter({ ...config, signal: controller.signal });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(attempts, 1);
});
