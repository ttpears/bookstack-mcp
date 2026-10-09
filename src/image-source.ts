import axios from 'axios';
import { open } from 'node:fs/promises';
import { basename, extname, isAbsolute } from 'node:path';
import { PublicError, safeError } from './util/safe-errors.js';

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};
export interface ImageSourceOptions {
  file_path?: string;
  url?: string;
  allowLocalFiles?: boolean;
  allowedHosts?: string[];
}

export async function readImageSource(options: ImageSourceOptions): Promise<{ bytes: Buffer; filename: string; type: string }> {
  try {
    return await loadImageSource(options);
  } catch (error) {
    throw safeError(error, 'Image source read failed');
  }
}

async function loadImageSource(options: ImageSourceOptions): Promise<{ bytes: Buffer; filename: string; type: string }> {
  if (!!options.file_path === !!options.url) throw new PublicError('Provide exactly one of file_path or url.');
  let bytes: Buffer;
  let filename: string;
  let type: string;
  if (options.file_path) {
    if (options.allowLocalFiles === false) throw new PublicError('Local image files are disabled for this server.');
    if (!isAbsolute(options.file_path)) throw new PublicError('file_path must be absolute.');
    filename = basename(options.file_path);
    type = TYPES[extname(filename).toLowerCase()];
    if (!type) throw new PublicError('Supported image formats: PNG, JPEG, GIF, WebP and SVG.');
    const file = await open(options.file_path, 'r');
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) throw new PublicError('Image must be a regular file no larger than 50 MB.');
      bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      bytes = bytes.subarray(0, offset);
    } finally { await file.close(); }
  } else {
    let url = new URL(options.url);
    for (let redirect = 0; ; redirect++) {
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new PublicError('Image URL must use HTTP(S) without embedded credentials.');
      }
      if (options.allowedHosts && !options.allowedHosts.includes(url.hostname.toLowerCase())) {
        throw new PublicError('Image URL host is not in BOOKSTACK_IMAGE_ALLOWED_HOSTS.');
      }
      const response = await axios.get(url.href, {
        responseType: 'arraybuffer', maxContentLength: MAX_IMAGE_BYTES,
        maxRedirects: 0, timeout: 30000,
        validateStatus: status => (status >= 200 && status < 300) || [301, 302, 303, 307, 308].includes(status)
      });
      if (response.status >= 300) {
        if (redirect >= 3 || !response.headers.location) throw new PublicError('Too many image URL redirects or missing Location.');
        url = new URL(response.headers.location, url);
        continue;
      }
      filename = basename(url.pathname) || 'image';
      type = String(response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (!Object.values(TYPES).includes(type)) type = TYPES[extname(filename).toLowerCase()];
      if (!type) throw new PublicError('Supported image formats: PNG, JPEG, GIF, WebP and SVG.');
      bytes = Buffer.from(response.data);
      break;
    }
  }
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new PublicError('Image must contain between 1 byte and 50 MB.');
  return { bytes, filename, type };
}
