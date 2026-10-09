import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

test('page changelog messages reach BookStack and invalid ones are rejected', async () => {
  const writes: { method: string; body: any }[] = [];
  const api = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if ((req.method === 'PUT' && req.url === '/api/pages/1') || (req.method === 'POST' && req.url === '/api/pages')) {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      writes.push({ method: req.method, body: data });
      res.end(JSON.stringify({ id: 1, book_id: 2, slug: 'page', markdown: '', ...data }));
    } else {
      res.end(JSON.stringify({ data: [{ id: 2, slug: 'book' }], total: 1 }));
    }
  });
  await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
  const port = (api.address() as any).port;
  const client = new Client({ name: 'bookstack-changelog', version: '1' });
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', fileURLToPath(new URL('./index.ts', import.meta.url))],
    env: {
      ...env, MCP_TRANSPORT: 'stdio', MCP_OAUTH_ENABLE: 'false',
      BOOKSTACK_BASE_URL: `http://127.0.0.1:${port}`,
      BOOKSTACK_TOKEN_ID: 'test', BOOKSTACK_TOKEN_SECRET: 'test',
      BOOKSTACK_ENABLE_WRITE: 'true'
    },
    stderr: 'pipe'
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    for (const name of ['create_page', 'update_page']) {
      const tool = tools.tools.find(t => t.name === name);
      assert.ok(tool?.inputSchema.properties?.changelog, `${name} should accept changelog`);
    }

    const updated = await client.callTool({
      name: 'update_page', arguments: { id: 1, html: '<p>x</p>', changelog: 'Fixed typo in step 2' }
    });
    assert.notEqual(updated.isError, true, JSON.stringify(updated));
    const plain = await client.callTool({ name: 'update_page', arguments: { id: 1, html: '<p>x</p>' } });
    assert.notEqual(plain.isError, true, JSON.stringify(plain));
    const created = await client.callTool({
      name: 'create_page', arguments: { name: 'New', book_id: 2, html: '<p>y</p>', changelog: 'Initial version' }
    });
    assert.notEqual(created.isError, true, JSON.stringify(created));

    assert.deepEqual(writes, [
      { method: 'PUT', body: { html: '<p>x</p>', changelog: 'Fixed typo in step 2' } },
      { method: 'PUT', body: { html: '<p>x</p>' } },
      { method: 'POST', body: { name: 'New', book_id: 2, html: '<p>y</p>', changelog: 'Initial version' } }
    ]);

    // BookStack validates changelog as 1-180 characters; reject before calling the API.
    for (const changelog of ['', 'x'.repeat(181)]) {
      const invalid = await client.callTool({ name: 'update_page', arguments: { id: 1, changelog } });
      assert.equal(invalid.isError, true);
    }
    assert.equal(writes.length, 3, 'invalid changelog must not reach BookStack');
  } finally {
    await client.close();
    await transport.close();
    await new Promise<void>(resolve => api.close(() => resolve()));
  }
});
