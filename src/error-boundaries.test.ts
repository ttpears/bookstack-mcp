import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const source = fileURLToPath(new URL('./index.ts', import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
// Generated only for loopback mocks; no stored or real credentials are used.
const syntheticCredential = () => `SYNTHETIC_${randomUUID()}`;
const baseEnv = { ...env, MCP_OAUTH_ENABLE: 'false', BOOKSTACK_TOKEN_ID: 'test',
  BOOKSTACK_TOKEN_SECRET: syntheticCredential(), BOOKSTACK_ENABLE_WRITE: 'true' };
async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

for (const mode of ['stdio', 'http'] as const) {
  test(`${mode} client errors retain statuses/validation but omit upstream content and credentials`, async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    const api = createServer((req, res) => {
      if (req.url?.startsWith('/pixel.png')) { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(png); return; }
      res.writeHead(req.method === 'POST' ? 422 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'SYNTHETIC_REMOTE_BODY', authorization: req.headers.authorization }));
    });
    await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${(api.address() as any).port}`;
    const client = new Client({ name: 'redaction-test', version: '1' });
    let logs = '';
    let child: ReturnType<typeof spawn> | undefined;
    let stdio: StdioClientTransport | undefined;
    let http: StreamableHTTPClientTransport | undefined;
    try {
      if (mode === 'stdio') {
        stdio = new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', source],
          env: { ...baseEnv, MCP_TRANSPORT: 'stdio', BOOKSTACK_BASE_URL: baseUrl }, stderr: 'pipe' });
        stdio.stderr?.on('data', chunk => { logs += chunk.toString(); });
        await client.connect(stdio);
      } else {
        const port = await unusedPort();
        const host = `http://127.0.0.1:${port}`;
        child = spawn(process.execPath, ['--import', 'tsx', source], { stdio: ['ignore', 'ignore', 'pipe'],
          env: { ...baseEnv, MCP_TRANSPORT: 'http', BOOKSTACK_BASE_URL: baseUrl,
            MCP_HTTP_HOST: '127.0.0.1', MCP_HTTP_PORT: String(port), BOOKSTACK_IMAGE_ALLOWED_HOSTS: '127.0.0.1' } });
        child.stderr?.on('data', chunk => { logs += chunk.toString(); });
        let ready = false;
        for (let retry = 0; retry < 150; retry++) {
          try { ready = (await fetch(`${host}/health`)).ok; } catch {}
          if (ready) break;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.ok(ready, 'HTTP test server starts');
        http = new StreamableHTTPClientTransport(new URL(`${host}/mcp`));
        await client.connect(http);
        const malformed = await fetch(`${host}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'SYNTHETIC_MALFORMED_BODY' });
        assert.equal(malformed.status, 500);
        assert.doesNotMatch(await malformed.text(), /SYNTHETIC/);
      }
      const failedRead = await client.callTool({ name: 'get_book', arguments: { id: 1 } });
      assert.equal(failedRead.isError, true);
      assert.match(JSON.stringify(failedRead), /HTTP 503/);
      assert.doesNotMatch(JSON.stringify(failedRead), /SYNTHETIC/);
      await assert.rejects(client.readResource({ uri: 'bookstack://book/1' }), error => {
        assert.match((error as Error).message, /HTTP 503/);
        assert.doesNotMatch((error as Error).message, /SYNTHETIC/);
        return true;
      });
      const upload = await client.callTool({ name: 'create_image', arguments: {
        url: `${baseUrl}/pixel.png?token=SYNTHETIC_IMAGE_QUERY`, uploaded_to: 1
      } });
      assert.equal(upload.isError, true);
      assert.match(JSON.stringify(upload), /HTTP 422/);
      assert.doesNotMatch(JSON.stringify(upload), /SYNTHETIC/);
      const validation = await client.callTool({ name: 'create_image', arguments: { url: 'file:///SYNTHETIC_PATH', uploaded_to: 1 } });
      assert.equal(validation.isError, true);
      assert.match(JSON.stringify(validation), /Image URL must use HTTP\(S\) without embedded credentials/);
      assert.doesNotMatch(JSON.stringify(validation), /SYNTHETIC/);
    } finally {
      await client.close();
      await stdio?.close();
      await http?.close();
      if (child && child.exitCode === null) {
        const exited = new Promise(resolve => child!.once('exit', resolve));
        child.kill('SIGTERM'); await exited;
      }
      await new Promise<void>(resolve => api.close(() => resolve()));
    }
    assert.doesNotMatch(logs, /SYNTHETIC/);
    if (mode === 'http') assert.match(logs, /HTTP handler error/);
  });
}

test('startup diagnostics omit secrets and paths in configured URLs', async () => {
  const client = new Client({ name: 'url-redaction-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', source], stderr: 'pipe',
    env: { ...baseEnv, MCP_TRANSPORT: 'stdio', MCP_OAUTH_ENABLE: 'true',
      BOOKSTACK_BASE_URL: 'https://SYNTHETIC_USER:SYNTHETIC_PASSWORD@wiki.example/SYNTHETIC_PATH?token=SYNTHETIC_QUERY',
      MCP_SERVER_URL: 'https://SYNTHETIC_USER:SYNTHETIC_PASSWORD@mcp.example/SYNTHETIC_PATH?token=SYNTHETIC_QUERY',
      OAUTH_TENANT_ID: 'tenant', OAUTH_CLIENT_ID: 'application', OAUTH_CLIENT_SECRET: syntheticCredential(), REDIS_URL: '' } });
  let logs = '';
  transport.stderr?.on('data', chunk => { logs += chunk.toString(); });
  try { await client.connect(transport); await client.listTools(); }
  finally { await client.close(); await transport.close(); }
  assert.doesNotMatch(logs, /SYNTHETIC/);
  assert.match(logs, /BookStack origin: https:\/\/wiki.example/);
  assert.match(logs, /Public origin: https:\/\/mcp.example/);
});
