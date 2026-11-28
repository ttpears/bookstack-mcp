import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { validateBearer, OAuthConfig } from './entra-proxy.js';

const ISSUER = 'https://identity.example/tenant/v2.0';
const SERVICE_APP = 'service-app-id';

const cfg = (over: Partial<OAuthConfig> = {}): OAuthConfig => ({
  serverUrl: 'https://mcp.example', tenantId: 'tenant', clientId: 'application',
  clientSecret: 'unused', audience: 'api://application', scopes: 'openid',
  writeRole: 'Writer', serviceRole: 'Service.Read', serviceAppIds: [SERVICE_APP],
  trustProxy: false, authorizeEndpoint: 'https://identity.example/authorize',
  tokenEndpoint: 'https://identity.example/token', issuers: [ISSUER],
  jwksUri: 'https://identity.example/keys', ...over,
});

async function keys() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  const sign = (claims: Record<string, unknown>) => new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(ISSUER)
    .setAudience('application').setSubject('subject-1').setIssuedAt()
    .setExpirationTime('5m').sign(privateKey);
  return { jwks: createLocalJWKSet({ keys: [jwk] }), sign };
}

const req = (token: string) => ({ headers: { authorization: `Bearer ${token}` } }) as IncomingMessage;

test('delegated user tokens keep today\'s behavior, including write by role', async () => {
  const { jwks, sign } = await keys();
  const reader = await validateBearer(req(await sign({ scp: 'user_impersonation' })), cfg(), jwks);
  assert.deepEqual([reader.ok, reader.isWriter, reader.service], [true, false, undefined]);
  const writer = await validateBearer(
    req(await sign({ scp: 'user_impersonation', roles: ['Writer'] })), cfg(), jwks);
  assert.equal(writer.isWriter, true);
});

test('an app-only token with no role is refused, whatever app sent it', async () => {
  const { jwks, sign } = await keys();
  for (const claims of [{ azp: 'some-tenant-app' }, { azp: SERVICE_APP }, { appid: SERVICE_APP, idtyp: 'app' }]) {
    const r = await validateBearer(req(await sign(claims)), cfg(), jwks);
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /service role/);
  }
});

test('an app-only token needs the service role and an allowed app, and never writes', async () => {
  const { jwks, sign } = await keys();
  const ok = await validateBearer(
    req(await sign({ azp: SERVICE_APP, roles: ['Service.Read', 'Writer'] })), cfg(), jwks);
  assert.deepEqual([ok.ok, ok.service, ok.isWriter, ok.sub], [true, true, false, 'subject-1']);
  const v1 = await validateBearer(
    req(await sign({ appid: SERVICE_APP, idtyp: 'app', roles: ['Service.Read'] })), cfg(), jwks);
  assert.equal(v1.ok, true);
  const other = await validateBearer(
    req(await sign({ azp: 'another-app', roles: ['Service.Read'] })), cfg(), jwks);
  assert.deepEqual([other.ok, other.error], [false, 'app-only token from an app that is not allowed']);
});

test('with no service role configured every app-only token is refused', async () => {
  const { jwks, sign } = await keys();
  const r = await validateBearer(req(await sign({ azp: SERVICE_APP, roles: ['Service.Read'] })),
    cfg({ serviceRole: '', serviceAppIds: [] }), jwks);
  assert.equal(r.ok, false);
});

test('an empty scp counts as app-only', async () => {
  const { jwks, sign } = await keys();
  const r = await validateBearer(req(await sign({ scp: ' ', azp: 'x' })), cfg(), jwks);
  assert.equal(r.ok, false);
});
