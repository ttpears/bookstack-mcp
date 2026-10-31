import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryKvStore, RedisKvStore } from './kv-store.js';

test('in-memory consume is single-use under concurrency and respects TTL', async t => {
  t.mock.timers.enable({ apis: ['Date'] });
  const store = new InMemoryKvStore('test:');
  try {
    await store.set('code', { token: 'synthetic' }, 100);
    const consumed = await Promise.all(Array.from({ length: 30 }, () => store.take('code')));
    assert.deepEqual(consumed.filter(Boolean), [{ token: 'synthetic' }]);
    await store.set('expired', { token: 'expired' }, 100);
    t.mock.timers.tick(100);
    assert.equal(await store.take('expired'), undefined);
    assert.equal(await store.get('expired'), undefined);
  } finally { store.dispose(); }
});

test('Redis consume uses one atomic script instead of separate network operations', async () => {
  let value: string | null = JSON.stringify({ token: 'synthetic' });
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
  assert.deepEqual((await Promise.all([store.take('code'), store.take('code')])).filter(Boolean), [{ token: 'synthetic' }]);
  assert.equal(calls, 2);
});
