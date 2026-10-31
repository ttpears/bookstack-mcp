import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { IncomingMessage } from 'node:http';
import { HttpBodyError, readRequestBody } from './http-body.js';

function request(headers: Record<string, string> = {}) {
  return Object.assign(new PassThrough(), { headers, aborted: false }) as unknown as IncomingMessage;
}

test('body byte limit accepts the exact boundary and rejects chunked overflow', async () => {
  const accepted = request();
  const result = readRequestBody(accepted, { maxBytes: 4 });
  accepted.emit('data', Buffer.from('é'));
  accepted.emit('data', Buffer.from('é'));
  accepted.emit('end');
  assert.equal(await result, 'éé');

  const overflow = request();
  const failed = assert.rejects(readRequestBody(overflow, { maxBytes: 4 }),
    error => error instanceof HttpBodyError && error.status === 413);
  overflow.emit('data', Buffer.from('123'));
  overflow.emit('data', Buffer.from('45'));
  overflow.emit('error', new Error('late socket reset'));
  await failed;
  assert.equal(overflow.listenerCount('data'), 0, 'oversized bodies must stop buffering');
});

test('oversized Content-Length is rejected before any body arrives', async () => {
  const req = request({ 'content-length': '5' });
  await assert.rejects(readRequestBody(req, { maxBytes: 4 }),
    error => error instanceof HttpBodyError && error.status === 413);
  assert.equal(req.listenerCount('data'), 0);
});

test('slow and interrupted request bodies release their buffers', async () => {
  const slow = request();
  const failed = assert.rejects(readRequestBody(slow, { maxBytes: 4, timeoutMs: 10 }),
    error => error instanceof HttpBodyError && error.status === 408);
  // Keep the test alive while the reader's deliberately unref'd timer fires.
  await new Promise(resolve => setTimeout(resolve, 20));
  await failed;
  assert.equal(slow.listenerCount('data'), 0);
  const aborted = request();
  const interrupted = assert.rejects(readRequestBody(aborted, { maxBytes: 4 }),
    error => error instanceof HttpBodyError && error.status === 400);
  aborted.emit('aborted');
  await interrupted;
});
