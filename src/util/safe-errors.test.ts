import test from 'node:test';
import assert from 'node:assert/strict';
import { format } from 'node:util';
import { AxiosError } from 'axios';
import { PublicError, logSafeError, oauthErrorCode, safeError, safeErrorDetails, safeUrlOrigin } from './safe-errors.js';

test('diagnostics and client errors exclude messages, headers, bodies and nested causes', () => {
  const config = { headers: { Authorization: 'Token SYNTHETIC_HEADER_SECRET' }, data: 'SYNTHETIC_REQUEST_BODY' } as any;
  const upstream = new AxiosError('SYNTHETIC_MESSAGE', 'ERR_BAD_RESPONSE', config,
    { _header: 'Bearer SYNTHETIC_WIRE_SECRET' },
    { status: 502, statusText: 'SYNTHETIC_STATUS_TEXT', headers: {}, data: 'SYNTHETIC_RESPONSE_BODY', config });
  const errors = [upstream, new Error('SYNTHETIC_OUTER_MESSAGE', { cause: upstream }), 'SYNTHETIC_NON_ERROR'];
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args) => { lines.push(format(...args)); };
  try {
    for (const error of errors) {
      logSafeError('Request failed', error);
      const publicError = safeError(error);
      assert.doesNotMatch(format(publicError), /SYNTHETIC/);
      assert.equal(publicError.cause, undefined);
      assert.doesNotMatch(JSON.stringify(publicError), /SYNTHETIC/);
    }
  } finally { console.error = original; }
  assert.doesNotMatch(lines.join('\n'), /SYNTHETIC/);
  assert.deepEqual(safeErrorDetails(upstream), { status: 502, code: 'ERR_BAD_RESPONSE' });
  assert.match(safeError(upstream).message, /HTTP 502; ERR_BAD_RESPONSE/);
});

test('only locally authored messages and allowlisted codes are preserved', () => {
  const local = new PublicError('Local image files are disabled for this server.');
  assert.equal(safeError(local), local);
  assert.equal(safeError(new Error('SYNTHETIC_UNKNOWN_MESSAGE')).message, 'Operation failed');
  assert.deepEqual(safeErrorDetails({ code: 'SYNTHETIC_CODE', status: 'SYNTHETIC_STATUS' }), {});
  assert.deepEqual(safeErrorDetails({ get response() { throw new Error('SYNTHETIC_GETTER'); } }), {});
  assert.equal(oauthErrorCode('invalid_grant'), 'invalid_grant');
  assert.equal(oauthErrorCode('SYNTHETIC_UPSTREAM_CODE'), 'server_error');
  assert.equal(oauthErrorCode('ECONNREFUSED'), 'server_error');
});

test('URL diagnostics omit credentials, paths, queries, fragments and invalid input', () => {
  assert.equal(safeUrlOrigin('https://SYNTHETIC_USER:SYNTHETIC_PASSWORD@wiki.example/private?token=SYNTHETIC_QUERY#SYNTHETIC_FRAGMENT'), 'https://wiki.example');
  assert.equal(safeUrlOrigin('http://[::1]:8080/private'), 'http://[::1]:8080');
  assert.equal(safeUrlOrigin('SYNTHETIC_INVALID_URL'), '<invalid URL>');
  assert.equal(safeUrlOrigin('file:///SYNTHETIC_PRIVATE_PATH'), '<invalid URL>');
});
