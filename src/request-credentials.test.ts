import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseRequestCredentials } from './request-credentials.js';

test('credential headers are opt-in, require both values and reject duplicate values', () => {
  assert.equal(parseRequestCredentials({ 'x-bookstack-token-id': 'one' }, false), undefined);
  assert.equal(parseRequestCredentials({}, true), undefined);
  for (const headers of [
    { 'x-bookstack-token-id': 'one' },
    { 'x-bookstack-token-id': 'one', 'x-bookstack-token-secret': '' },
    { 'x-bookstack-token-id': 'one,two', 'x-bookstack-token-secret': 'secret' }
  ]) assert.throws(() => parseRequestCredentials(headers, true), /Supply both/);
});

test('HTTP session resolves each request identity with isolated caches and environment fallback', async () => {
  const api = createServer((req, res) => {
    const identity = String(req.headers.authorization).split(' ')[1].split(':')[0];
    res.setHeader('Content-Type', 'application/json');
    if (req.url!.startsWith('/api/books')) {
      res.end(JSON.stringify({ data: [{ id: 2, slug: identity }], total: 1 }));
    } else {
      res.end(JSON.stringify({ id: 1, book_id: 2, slug: 'page', markdown: identity }));
    }
  });
  await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
  const apiPort = (api.address() as any).port;
  const port = 8413;
  const base = `http://127.0.0.1:${port}`;
  const processServer = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./index.ts', import.meta.url))], {
    stdio: 'ignore',
    env: { ...process.env, MCP_TRANSPORT: 'http', MCP_HTTP_HOST: '127.0.0.1', MCP_HTTP_PORT: String(port),
      MCP_OAUTH_ENABLE: 'false', BOOKSTACK_BASE_URL: `http://127.0.0.1:${apiPort}`,
      BOOKSTACK_TOKEN_ID: 'service', BOOKSTACK_TOKEN_SECRET: 'secret', BOOKSTACK_ALLOW_REQUEST_CREDENTIALS: 'true' }
  });
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  let id = 0;
  try {
    let ready = false;
    for (let retry = 0; retry < 100; retry++) {
      try { ready = (await fetch(`${base}/health`)).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready);
    const initialized = await fetch(`${base}/mcp`, { method: 'POST', headers, body: JSON.stringify({
      jsonrpc: '2.0', id: ++id, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }
    }) });
    await initialized.text();
    const session = initialized.headers.get('mcp-session-id');
    assert.ok(session);
    const call = async (identity?: string) => {
      const response = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...headers, 'mcp-session-id': session,
        ...(identity ? { 'X-Bookstack-Token-Id': identity, 'X-Bookstack-Token-Secret': 'secret' } : {})
      }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name: 'get_page', arguments: { id: 1 } } }) });
      const text = await response.text();
      assert.equal(response.status, 200, text);
      const message = JSON.parse(text.split('\n').find(line => line.startsWith('data: '))!.slice(6));
      assert.notEqual(message.result.isError, true);
      return JSON.parse(message.result.content[0].text);
    };
    for (const identity of ['alice', 'bob', undefined, 'alice']) {
      const page = await call(identity);
      assert.equal(page.content, identity ?? 'service');
      assert.match(page.url, new RegExp(`/books/${identity ?? 'service'}/page/page$`));
    }
    const pages = await Promise.all(['alice', 'bob'].map(call));
    assert.deepEqual(pages.map(page => page.content), ['alice', 'bob']);
    const partial = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...headers, 'mcp-session-id': session, 'X-Bookstack-Token-Id': 'alice' }, body: '{}' });
    assert.equal(partial.status, 400);
    await partial.text();
  } finally {
    const exited = new Promise(resolve => processServer.once('exit', resolve));
    processServer.kill('SIGTERM');
    await exited;
    await new Promise<void>(resolve => api.close(() => resolve()));
  }
});
