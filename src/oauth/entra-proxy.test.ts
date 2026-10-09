import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { format } from 'node:util';
import { handleOAuthRoutes, initOAuthStore, OAuthConfig } from './entra-proxy.js';
import { logSafeError } from '../util/safe-errors.js';

test('OAuth failures omit upstream bodies/descriptions and request values; success still passes tokens', async () => {
  const syntheticToken = () => `SYNTHETIC_${randomUUID()}`;
  const cfg: OAuthConfig = {
    serverUrl: 'https://mcp.example', tenantId: 'tenant', clientId: 'application',
    // Generated for the mocked identity endpoint, never a real credential.
    clientSecret: syntheticToken(), audience: 'audience', scopes: 'openid',
    writeRole: 'Writer', trustProxy: false, authorizeEndpoint: 'https://identity.example/authorize',
    tokenEndpoint: 'https://identity.example/token', issuers: [], jwksUri: 'https://identity.example/keys'
  };
  await initOAuthStore({}, cfg.serverUrl);
  const originalFetch = globalThis.fetch;
  const originalLog = console.error;
  const logs: string[] = [];
  let upstream = () => new Response('{}', { status: 400 });
  globalThis.fetch = (input, options) => String(input) === cfg.tokenEndpoint
    ? Promise.resolve().then(upstream) : originalFetch(input, options);
  console.error = (...args) => { logs.push(format(...args)); };
  const server = createServer(async (req, res) => {
    try {
      if (!await handleOAuthRoutes(req, res, cfg)) { res.writeHead(404); res.end(); }
    } catch (error) {
      logSafeError('HTTP handler error', error); res.writeHead(500); res.end('Internal server error');
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const verifier = 'SYNTHETIC_PKCE_VALUE';
  const registered = await originalFetch(`${base}/register`, { method: 'POST', body: JSON.stringify({ redirect_uris: ['https://client.example/callback'] }) });
  const clientId = (await registered.json() as any).client_id;
  const pending = async () => {
    const query = new URLSearchParams({ client_id: clientId, redirect_uri: 'https://client.example/callback',
      state: 'SYNTHETIC_CLIENT_STATE', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    const response = await originalFetch(`${base}/authorize?${query}`, { redirect: 'manual' });
    return new URL(response.headers.get('location')!).searchParams.get('state')!;
  };
  const callback = async () => originalFetch(`${base}/callback?${new URLSearchParams({ state: await pending(), code: 'SYNTHETIC_AUTH_CODE' })}`, { redirect: 'manual' });
  const refresh = async () => originalFetch(`${base}/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: syntheticToken() }) });
  try {
    for (const makeResponse of [
      () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'SYNTHETIC_IDENTITY_DETAILS', refresh_token: syntheticToken() }), { status: 400 }),
      () => new Response('SYNTHETIC_MALFORMED_RESPONSE', { status: 502 }),
      () => new Response(JSON.stringify({ refresh_token: syntheticToken() }), { status: 200 })
    ]) {
      upstream = makeResponse;
      const response = await callback();
      assert.equal(response.status, 302);
      assert.equal(new URL(response.headers.get('location')!).searchParams.get('error'), 'server_error');
      const failedRefresh = await refresh();
      assert.equal(failedRefresh.status, 400);
      const failureBody = await failedRefresh.text();
      assert.doesNotMatch(failureBody, /SYNTHETIC/);
      assert.equal(JSON.parse(failureBody).error, 'invalid_grant');
    }
    upstream = () => { throw new Error('SYNTHETIC_FETCH_MESSAGE', { cause: new Error('SYNTHETIC_FETCH_CAUSE') }); };
    assert.equal((await callback()).status, 500);
    assert.equal((await refresh()).status, 500);
    const errorState = await pending();
    const callbackError = await originalFetch(`${base}/callback?${new URLSearchParams({ state: errorState, error: 'SYNTHETIC_CALLBACK_ERROR' })}`, { redirect: 'manual' });
    assert.equal(new URL(callbackError.headers.get('location')!).searchParams.get('error'), 'invalid_request');
    const accessToken = syntheticToken();
    upstream = () => new Response(JSON.stringify({ access_token: accessToken, refresh_token: syntheticToken() }), { status: 200 });
    const successfulRefresh = await refresh();
    assert.equal(successfulRefresh.status, 200);
    assert.equal((await successfulRefresh.json() as any).access_token, accessToken);
    const successfulCallback = await callback();
    const code = new URL(successfulCallback.headers.get('location')!).searchParams.get('code')!;
    const mismatch = await originalFetch(`${base}/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: 'SYNTHETIC_CLIENT_ID' }) });
    assert.equal((await mismatch.json() as any).error, 'invalid_client');
    assert.doesNotMatch(logs.join('\n'), /SYNTHETIC/);
    assert.match(logs.join('\n'), /invalid_grant/);
    assert.match(logs.join('\n'), /502/);
  } finally {
    globalThis.fetch = originalFetch; console.error = originalLog;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
