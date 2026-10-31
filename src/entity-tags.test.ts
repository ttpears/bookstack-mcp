import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('MCP book and page tag lifecycle preserves content and omitted tags', async () => {
  const writes: { method: string; path: string; body: any }[] = [];
  const entities: Record<string, any> = {};
  const api = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const path = req.url!.split('?')[0];
    if (req.method === 'POST' || req.method === 'PUT') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      writes.push({ method: req.method, path, body: data });
      const key = req.method === 'POST' ? `${path}/1` : path;
      entities[key] = { id: 1, book_id: 2, slug: 'entity', tags: [], ...entities[key], ...data };
      res.end(JSON.stringify(entities[key]));
    } else if (path === '/api/books') {
      res.end(JSON.stringify({ data: [{ id: 2, slug: 'parent-book' }], total: 1 }));
    } else if (entities[path]) {
      res.end(JSON.stringify(entities[path]));
    } else {
      res.writeHead(404).end('{}');
    }
  });
  await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
  const port = (api.address() as any).port;
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const connect = async (enableWrite: boolean) => {
    const client = new Client({ name: 'bookstack-tags', version: '1' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', fileURLToPath(new URL('./index.ts', import.meta.url))],
      env: {
        ...env, MCP_TRANSPORT: 'stdio', MCP_OAUTH_ENABLE: 'false',
        BOOKSTACK_BASE_URL: `http://127.0.0.1:${port}`,
        BOOKSTACK_TOKEN_ID: 'test', BOOKSTACK_TOKEN_SECRET: 'test',
        BOOKSTACK_ENABLE_WRITE: String(enableWrite)
      },
      stderr: 'pipe'
    });
    await client.connect(transport);
    return client;
  };
  const client = await connect(true);
  try {
    const tools = (await client.listTools()).tools;
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args });
      assert.notEqual(result.isError, true, JSON.stringify(result));
      return JSON.parse((result.content as any[])[0].text);
    };
    const initial = [{ name: 'Environment', value: 'Dev' }, { name: 'Reviewed', value: '' }];
    const revised = [{ name: 'Environment', value: 'Production' }, { name: 'Team', value: 'Docs' }];

    for (const entity of ['book', 'page']) {
      for (const action of ['create', 'update']) {
        const tool = tools.find(t => t.name === `${action}_${entity}`);
        assert.ok(tool?.inputSchema.properties?.tags, `${action}_${entity} must advertise tags`);
        assert.equal(tool.annotations?.readOnlyHint, false);
      }
      const content = entity === 'page' ? { book_id: 2, markdown: '# Original source' } : {};
      const created = await call(`create_${entity}`, { name: 'New', ...content, tags: initial });
      assert.deepEqual(created.tags, initial);
      assert.deepEqual(writes.at(-1), { method: 'POST', path: `/api/${entity}s`, body: { name: 'New', ...content, tags: initial } });

      // Replace one value, remove one tag, and add another using only the tag list.
      const updated = await call(`update_${entity}`, { id: 1, tags: revised });
      assert.deepEqual(updated.tags, revised);
      assert.deepEqual(writes.at(-1), { method: 'PUT', path: `/api/${entity}s/1`, body: { tags: revised } });
      if (entity === 'page') {
        assert.equal(updated.content, '# Original source');
        assert.equal(entities['/api/pages/1'].markdown, '# Original source');
        assert.equal(entities['/api/pages/1'].html, undefined);
      }

      await call(`update_${entity}`, { id: 1, name: 'Renamed' });
      assert.deepEqual(writes.at(-1)?.body, { name: 'Renamed' });
      const read = await call(`get_${entity}`, { id: 1 });
      assert.deepEqual(read.tags, revised, 'omitting tags must preserve them');
      const cleared = await call(`update_${entity}`, { id: 1, tags: [] });
      assert.deepEqual(cleared.tags, []);
      assert.deepEqual(writes.at(-1)?.body, { tags: [] });

      const beforeInvalid = writes.length;
      for (const tags of [null, 'Reviewed', [{ name: 'x' }], [{ name: 1, value: '' }], [{ name: 'x', value: 1 }], [{ name: 'x', value: '', unexpected: true }]]) {
        for (const action of ['create', 'update']) {
          const invalid = await client.callTool({ name: `${action}_${entity}`, arguments: { id: 1, name: 'New', ...content, tags } });
          assert.equal(invalid.isError, true, `${action}_${entity} must reject ${JSON.stringify(tags)}`);
        }
      }
      assert.equal(writes.length, beforeInvalid, 'invalid tags must not reach BookStack');
    }

    // HTML-authored pages must also keep their source on a tag-only update.
    entities['/api/pages/1'] = { id: 1, book_id: 2, slug: 'entity', html: '<p data-keep="true">Original</p>', markdown: '', tags: [] };
    await call('update_page', { id: 1, tags: initial });
    assert.equal(entities['/api/pages/1'].html, '<p data-keep="true">Original</p>');
    assert.deepEqual(writes.at(-1)?.body, { tags: initial });

    const readOnly = await connect(false);
    try {
      const names = (await readOnly.listTools()).tools.map(tool => tool.name);
      const beforeReadOnly = writes.length;
      for (const entity of ['book', 'page']) {
        assert.ok(!names.includes(`update_${entity}`));
        const denied = await readOnly.callTool({ name: `update_${entity}`, arguments: { id: 1, tags: [] } });
        assert.equal(denied.isError, true);
      }
      assert.equal(writes.length, beforeReadOnly, 'read-only clients must not write tags');
    } finally {
      await readOnly.close();
    }
  } finally {
    await client.close();
    await new Promise<void>(resolve => api.close(() => resolve()));
  }
});
