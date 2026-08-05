import test from 'node:test';
import assert from 'node:assert/strict';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SessionRegistry } from './session-registry.js';

// A stand-in for StreamableHTTPServerTransport: registry only ever reads/stores
// the reference, so a minimal object satisfies the type for this test.
const fakeTransport = () => ({}) as StreamableHTTPServerTransport;

test('an abandoned session (onclose never fires) is swept after the idle TTL', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'] });

  const sessions = new SessionRegistry({ idleTtlMs: 30 * 60 * 1000, sweepIntervalMs: 5 * 60 * 1000 });
  sessions.register('abandoned-session', fakeTransport(), { sub: 'user-1', isWriter: false });
  assert.equal(sessions.has('abandoned-session'), true, 'sanity check: session was registered');

  // No `sessions.delete()` is ever called (that only happens from transport.onclose or
  // process shutdown) — advance the clock past the idle TTL and let the sweep tick run.
  t.mock.timers.tick(31 * 60 * 1000);

  assert.equal(
    sessions.has('abandoned-session'),
    false,
    'expected the abandoned session to be swept after the idle TTL'
  );

  sessions.dispose();
});

test('a session touched within the idle TTL survives repeated sweep ticks', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'] });

  const sessions = new SessionRegistry({ idleTtlMs: 30 * 60 * 1000, sweepIntervalMs: 5 * 60 * 1000 });
  sessions.register('active-session', fakeTransport());

  // Simulate the ~5-minute SSE reconnect cycle seen in production: touch the session
  // (get(), same as a real request) well inside the TTL window, across several cycles.
  for (let i = 0; i < 5; i++) {
    t.mock.timers.tick(5 * 60 * 1000);
    assert.notEqual(
      sessions.get('active-session'),
      undefined,
      `session should still be alive at minute ${(i + 1) * 5}`
    );
  }

  sessions.dispose();
});

test('registry enforces a hard cap on total sessions', () => {
  const sessions = new SessionRegistry({ maxSessions: 2 });
  try {
    assert.equal(sessions.atCapacity(), false);
    sessions.register('s1', fakeTransport());
    assert.equal(sessions.atCapacity(), false);
    sessions.register('s2', fakeTransport());
    assert.equal(sessions.atCapacity(), true, 'expected at-capacity once maxSessions is reached');
  } finally {
    sessions.dispose();
  }
});

test('constructor starts exactly one sweep timer, and dispose() clears it', (t) => {
  const setIntervalSpy = t.mock.method(global, 'setInterval');
  const clearIntervalSpy = t.mock.method(global, 'clearInterval');

  const sessions = new SessionRegistry();
  assert.equal(setIntervalSpy.mock.callCount(), 1, 'expected the constructor to start exactly one sweep timer');
  const timerHandle = setIntervalSpy.mock.calls[0].result;

  sessions.dispose();
  assert.equal(clearIntervalSpy.mock.callCount(), 1, 'expected dispose() to clear the sweep timer');
  assert.equal(
    clearIntervalSpy.mock.calls[0].arguments[0],
    timerHandle,
    'expected dispose() to clear the same timer the constructor created'
  );
});
