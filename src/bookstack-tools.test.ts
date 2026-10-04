import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

test('MCP page ordering reaches BookStack and rate limits reach the caller', async () => {
  const updates: any[] = [];
  let limitedAttempts = 0;
  const api = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/books/99') {
      limitedAttempts++;
      res.writeHead(429, { 'Retry-After': '0' });
      res.end('{}');
    } else if (req.method === 'PUT' && req.url === '/api/pages/1') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      updates.push(data);
      res.end(JSON.stringify({ id: 1, book_id: 2, slug: 'page', markdown: '', ...data }));
    } else {
      res.end(JSON.stringify({ data: [{ id: 2, slug: 'book' }], total: 1 }));
    }
  });
  await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
  const port = (api.address() as any).port;
  const client = new Client({ name: 'bookstack-regression', version: '1' });
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', fileURLToPath(new URL('./index.ts', import.meta.url))],
    env: {
      ...env, MCP_TRANSPORT: 'stdio', MCP_OAUTH_ENABLE: 'false',
      BOOKSTACK_BASE_URL: `http://127.0.0.1:${port}`,
      BOOKSTACK_TOKEN_ID: 'test', BOOKSTACK_TOKEN_SECRET: 'test',
      BOOKSTACK_ENABLE_WRITE: 'true', BOOKSTACK_RETRY_TIMEOUT_MS: '1000'
    },
    stderr: 'pipe'
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    for (const name of ['list_images', 'create_image', 'delete_image']) {
      assert.ok(tools.tools.some(tool => tool.name === name));
    }
    const result = await client.callTool({ name: 'update_page', arguments: { id: '1', priority: '0' } });
    assert.notEqual(result.isError, true);
    assert.deepEqual(updates, [{ priority: 0 }]);
    for (const priority of [-1, 1.5]) {
      const invalid = await client.callTool({ name: 'update_page', arguments: { id: 1, priority } });
      assert.equal(invalid.isError, true);
    }
    assert.equal(updates.length, 1, 'invalid ordering must not reach BookStack');
    const limited = await client.callTool({ name: 'get_book', arguments: { id: 99 } });
    assert.equal(limited.isError, true);
    assert.match(JSON.stringify(limited.content), /BookStack rate limited.*HTTP 429.*Try again later/);
    assert.equal(limitedAttempts, 6);
  } finally {
    await client.close();
    await transport.close();
    await new Promise<void>(resolve => api.close(() => resolve()));
  }
});
