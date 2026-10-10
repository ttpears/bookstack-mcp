import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

// What BookStack stores (raw_html) versus what it renders for readers (html): the
// render step resolves {{@id}} includes and runs the configurable content filter.
const RAW_HTML = '<p data-start="1"><a href="https://example.com" target="_blank" rel="noopener">Link</a></p>\r\n<p>{{@7#bkmrk-intro}}</p>';
const RENDERED_HTML = '<p><a href="https://example.com" target="_blank">Link</a></p>\n<p id="bkmrk-intro">Included text</p>';

test('get_page returns the stored editor HTML with the raw format', async () => {
  const api = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/pages/1') {
      res.end(JSON.stringify({
        id: 1, book_id: 2, slug: 'page', name: 'Page',
        html: RENDERED_HTML, raw_html: RAW_HTML, markdown: 'Included text', text: 'Included text'
      }));
    } else {
      res.end(JSON.stringify({ data: [{ id: 2, slug: 'book' }], total: 1 }));
    }
  });
  await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
  const port = (api.address() as any).port;
  const client = new Client({ name: 'bookstack-raw-format', version: '1' });
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', fileURLToPath(new URL('./index.ts', import.meta.url))],
    env: {
      ...env, MCP_TRANSPORT: 'stdio', MCP_OAUTH_ENABLE: 'false',
      BOOKSTACK_BASE_URL: `http://127.0.0.1:${port}`,
      BOOKSTACK_TOKEN_ID: 'test', BOOKSTACK_TOKEN_SECRET: 'test'
    },
    stderr: 'pipe'
  });
  const getPage = async (args: Record<string, unknown>) => {
    const result = await client.callTool({ name: 'get_page', arguments: { id: 1, ...args } });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    return JSON.parse((result.content as any)[0].text);
  };
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const getPageTool = tools.tools.find(tool => tool.name === 'get_page');
    assert.ok((getPageTool?.inputSchema.properties?.format as any)?.enum?.includes('raw'));

    const raw = await getPage({ format: 'raw' });
    assert.equal(raw.content_format, 'raw');
    assert.equal(raw.content, RAW_HTML);
    assert.equal(raw.content_total_chars, RAW_HTML.length);
    assert.equal(raw.content_truncated, false);

    // Raw content paginates like every other format.
    const first = await getPage({ format: 'raw', limit: 20 });
    assert.equal(first.content_truncated, true);
    const rest = await getPage({ format: 'raw', offset: first.content_next_offset });
    assert.equal(first.content + rest.content, RAW_HTML);

    // Existing formats are unchanged.
    assert.equal((await getPage({ format: 'html' })).content, RENDERED_HTML);
    assert.equal((await getPage({})).content, 'Included text');

    // raw_html never leaks into page metadata, whatever the format.
    for (const format of ['raw', 'html', 'markdown', 'text']) {
      assert.equal('raw_html' in (await getPage({ format })), false, format);
    }
  } finally {
    await client.close();
    await transport.close();
    await new Promise<void>(resolve => api.close(() => resolve()));
  }
});
