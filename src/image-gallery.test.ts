import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BookStackClient } from './bookstack-client.js';
import { readImageSource } from './image-source.js';

test('gallery uploads send authenticated multipart, list filters, snippets and validation details', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const directory = await mkdtemp(join(tmpdir(), 'bookstack-images-'));
  const imagePath = join(directory, 'pixel.png');
  await writeFile(imagePath, png);
  const uploads: any[] = [];
  const requests: string[] = [];
  const api = createServer(async (req, res) => {
    requests.push(`${req.method} ${req.url}`);
    if (req.url === '/pixel.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(png); return;
    }
    if (req.url === '/redirect.png') {
      res.writeHead(302, { Location: 'http://localhost:9/pixel.png' }); res.end(); return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = new Request('http://localhost/upload', {
        method: 'POST', headers: { 'Content-Type': req.headers['content-type']! }, body: Buffer.concat(chunks)
      });
      const form = await request.formData();
      const file = form.get('image') as File;
      uploads.push({ authorization: req.headers.authorization, type: form.get('type'), page: form.get('uploaded_to'),
        filename: file.name, contentType: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
      if (form.get('name') === 'invalid') {
        res.writeHead(422); res.end(JSON.stringify({ errors: { name: ['Name invalid'] } })); return;
      }
      res.end(JSON.stringify({ id: 3, url: 'https://wiki/images/pixel.png', thumbs: { display: 'thumb' },
        content: { html: '<img src="thumb">', markdown: '![pixel](thumb)' } }));
    } else if (req.method === 'DELETE') {
      res.writeHead(204); res.end();
    } else { res.end(JSON.stringify({ data: [], total: 0 })); }
  });
  await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(api.address() as any).port}`;
  const client = new BookStackClient({ baseUrl, tokenId: 'user', tokenSecret: 'secret', enableWrite: true });
  try {
    const result = await client.createImage({ file_path: imagePath, uploaded_to: 1 });
    assert.equal(result.id, 3);
    assert.equal(result.content.markdown, '![pixel](thumb)');
    await client.createImage({ url: `${baseUrl}/pixel.png`, uploaded_to: 1 });
    for (const upload of uploads) assert.deepEqual(upload, {
      authorization: 'Token user:secret', type: 'gallery', page: '1', filename: 'pixel.png', contentType: 'image/png', bytes: png
    });
    await client.listImages({ uploaded_to: 1, offset: 2, count: 5, sort: '+id' });
    const listing = new URL(requests.find(request => request.startsWith('GET /api/image-gallery'))!.slice(4), baseUrl);
    assert.equal(listing.searchParams.get('filter[uploaded_to]'), '1');
    assert.equal(listing.searchParams.get('offset'), '2');
    assert.equal(listing.searchParams.get('count'), '5');
    assert.deepEqual(await client.deleteImage(3), { deleted: true, id: 3 });
    assert.ok(requests.includes('DELETE /api/image-gallery/3'));
    await assert.rejects(client.createImage({ file_path: imagePath, name: 'invalid', uploaded_to: 1 }), /HTTP 422.*Name invalid/);
    const readonly = new BookStackClient({ baseUrl, tokenId: 'read', tokenSecret: 'secret' });
    await assert.rejects(readonly.createImage({ file_path: imagePath, uploaded_to: 1 }), /disabled/);
    await assert.rejects(readonly.deleteImage(3), /disabled/);
    await assert.rejects(readImageSource({ file_path: imagePath, url: `${baseUrl}/pixel.png` }), /exactly one/);
    await assert.rejects(readImageSource({ file_path: imagePath, allowLocalFiles: false }), /disabled/);
    await assert.rejects(readImageSource({ url: `${baseUrl}/pixel.png`, allowedHosts: [] }), /ALLOWED_HOSTS/);
    await assert.rejects(readImageSource({ url: `${baseUrl}/redirect.png`, allowedHosts: ['127.0.0.1'] }), /ALLOWED_HOSTS/);
    await assert.rejects(readImageSource({ url: 'file:///tmp/pixel.png' }), /HTTP/);
  } finally {
    await new Promise<void>(resolve => api.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
