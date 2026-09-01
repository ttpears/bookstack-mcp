import test from 'node:test';
import assert from 'node:assert/strict';
import {
  basenameOf,
  resolveImageUpload,
  DEFAULT_MAX_UPLOAD_KIB,
  SUPPORTED_IMAGE_EXTENSIONS,
} from './image-upload.js';

const ok = { filePath: '/tmp/shot.png', byteLength: 1024 };

test('derives filename and mime type from the extension', () => {
  const r = resolveImageUpload(ok);
  assert.equal(r.filename, 'shot.png');
  assert.equal(r.mimeType, 'image/png');
});

test('defaults the gallery name to the filename', () => {
  assert.equal(resolveImageUpload(ok).name, 'shot.png');
});

test('an explicit name wins, trimmed', () => {
  assert.equal(resolveImageUpload({ ...ok, name: '  Rack diagram  ' }).name, 'Rack diagram');
});

test('a blank name falls back to the filename rather than uploading an empty name', () => {
  assert.equal(resolveImageUpload({ ...ok, name: '   ' }).name, 'shot.png');
});

test('both jpg and jpeg map to image/jpeg (mimes:jpeg matches either)', () => {
  assert.equal(resolveImageUpload({ ...ok, filePath: 'a.jpg' }).mimeType, 'image/jpeg');
  assert.equal(resolveImageUpload({ ...ok, filePath: 'a.jpeg' }).mimeType, 'image/jpeg');
});

test('accepts avif, which BookStack allows', () => {
  assert.equal(resolveImageUpload({ ...ok, filePath: 'a.avif' }).mimeType, 'image/avif');
});

test('rejects svg, which BookStack does NOT allow for gallery images', () => {
  assert.throws(() => resolveImageUpload({ ...ok, filePath: 'diagram.svg' }), /SVG is not accepted/);
});

test('rejects a file with no extension', () => {
  assert.throws(() => resolveImageUpload({ ...ok, filePath: '/tmp/screenshot' }), /no extension/);
});

test('extension matching is case-insensitive', () => {
  assert.equal(resolveImageUpload({ ...ok, filePath: 'A.PNG' }).mimeType, 'image/png');
});

test('strips directories, including Windows separators', () => {
  assert.equal(basenameOf('/a/b/c.png'), 'c.png');
  assert.equal(basenameOf('C:\\shots\\c.png'), 'c.png');
  assert.equal(basenameOf('c.png'), 'c.png');
});

test('rejects an empty file instead of uploading zero bytes', () => {
  assert.throws(() => resolveImageUpload({ ...ok, byteLength: 0 }), /empty file/);
});

test('rejects a file above the default upload limit', () => {
  const tooBig = (DEFAULT_MAX_UPLOAD_KIB + 1) * 1024;
  assert.throws(() => resolveImageUpload({ ...ok, byteLength: tooBig }), /upload limit/);
});

test('accepts a file exactly at the default upload limit', () => {
  const atLimit = DEFAULT_MAX_UPLOAD_KIB * 1024;
  assert.equal(resolveImageUpload({ ...ok, byteLength: atLimit }).filename, 'shot.png');
});

test('the unsupported-format error names every accepted extension', () => {
  try {
    resolveImageUpload({ ...ok, filePath: 'a.bmp' });
    assert.fail('expected a throw');
  } catch (err) {
    for (const ext of SUPPORTED_IMAGE_EXTENSIONS) {
      assert.ok((err as Error).message.includes(ext), `message should mention ${ext}`);
    }
  }
});
