import test from 'node:test';
import assert from 'node:assert/strict';
import { Semaphore } from './semaphore.js';

test('constructor rejects max < 1', () => {
  assert.throws(() => new Semaphore(0), /max/);
});

test('allows up to `max` holders concurrently and queues the rest', async () => {
  const sem = new Semaphore(2);
  await sem.acquire();
  await sem.acquire(); // 2 held, 0 free

  let third = false;
  const p = sem.acquire().then(() => { third = true; });

  // Give the microtask queue a chance; the third acquire must still be blocked.
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(third, false, 'third acquire should block while 2 are held');

  sem.release();            // hands the permit directly to the waiter
  await p;
  assert.equal(third, true, 'third acquire should resolve after a release');
});

test('run() releases the permit even when fn throws', async () => {
  const sem = new Semaphore(1);
  await assert.rejects(sem.run(async () => { throw new Error('boom'); }), /boom/);
  // If the permit leaked, this second run would hang forever.
  const result = await sem.run(async () => 42);
  assert.equal(result, 42);
});

test('bounds real concurrency under a burst', async () => {
  const sem = new Semaphore(3);
  let active = 0;
  let peak = 0;
  const task = () => sem.run(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
  });
  await Promise.all(Array.from({ length: 20 }, task));
  assert.ok(peak <= 3, `peak concurrency ${peak} must not exceed 3`);
});
