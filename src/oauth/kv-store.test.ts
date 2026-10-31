import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { InMemoryKvStore, RedisKvStore } from './kv-store.js';

test('in-memory consume is single-use under concurrency and respects TTL', async t => {
  t.mock.timers.enable({ apis: ['Date'] });
  const store = new InMemoryKvStore('test:');
  const expected = { value: randomUUID() };
  try {
    await store.set('code', expected, 100);
    const consumed = await Promise.all(Array.from({ length: 30 }, () => store.take('code')));
    assert.deepEqual(consumed.filter(Boolean), [expected]);
    await store.set('expired', expected, 100);
    t.mock.timers.tick(100);
    assert.equal(await store.take('expired'), undefined);
    assert.equal(await store.get('expired'), undefined);
  } finally { store.dispose(); }
});

test('Redis consume uses one atomic script instead of separate network operations', async () => {
  const expected = { value: randomUUID() };
  let value: string | null = JSON.stringify(expected);
  let calls = 0;
  const store = new RedisKvStore({
    get: async () => { throw new Error('non-atomic GET must not be used'); },
    del: async () => { throw new Error('non-atomic DEL must not be used'); },
    set: async () => {}, quit: async () => {},
    eval: async (script, numKeys, key) => {
      assert.match(script, /redis.call\('GET', KEYS\[1\]\)/);
      assert.match(script, /redis.call\('DEL', KEYS\[1\]\)/);
      assert.equal(numKeys, 1);
      assert.equal(key, 'test:code');
      calls++;
      const result = value;
      value = null;
      return result;
    }
  }, 'test:');
  assert.deepEqual((await Promise.all([store.take('code'), store.take('code')])).filter(Boolean), [expected]);
  assert.equal(calls, 2);
});
