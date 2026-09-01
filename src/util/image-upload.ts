/**
 * Pure helpers for gallery image uploads. Kept free of I/O so the format and
 * size contract can be unit-tested without a BookStack instance or a filesystem.
 */

/**
 * Extensions BookStack's image gallery accepts, mirroring the server's
 * `getImageValidationRules()` (`app/Http/Controller.php`):
 *
 *   ['image_extension', 'mimes:jpeg,png,gif,webp,avif', 'max:' . (config('app.upload_limit') * 1000)]
 *
 * Note SVG is NOT accepted (BookStack rejects it for gallery images) and AVIF
 * is. `jpg` is included because `mimes:jpeg` matches both spellings.
 */
const EXTENSION_MIME_TYPES: ReadonlyMap<string, string> = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['avif', 'image/avif'],
]);

export const SUPPORTED_IMAGE_EXTENSIONS: readonly string[] = [...EXTENSION_MIME_TYPES.keys()];

/**
 * BookStack's default `app.upload_limit` is 50 (MB), which Laravel validates as
 * `max:50000` — kilobytes, i.e. 50000 * 1024 bytes. Instances may raise or lower
 * it, so this is only a fail-fast guard against the obvious case: the server
 * stays authoritative and a smaller server limit still returns a 422.
 */
export const DEFAULT_MAX_UPLOAD_KIB = 50_000;

export interface ResolvedImageUpload {
  /** Base filename sent as the multipart part filename. */
  filename: string;
  /** MIME type derived from the extension, for the multipart part. */
  mimeType: string;
  /** Gallery display name — the caller's override, else the filename. */
  name: string;
}

/** Strip directories and return the lowercased extension without its dot. */
function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

export function basenameOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  return slash === -1 ? normalized : normalized.slice(slash + 1);
}

/**
 * Validate a local image against BookStack's gallery contract and derive the
 * multipart part metadata. Throws with an actionable message rather than
 * letting the upload fail as an opaque 422.
 */
export function resolveImageUpload(options: {
  filePath: string;
  byteLength: number;
  name?: string;
}): ResolvedImageUpload {
  const filename = basenameOf(options.filePath);
  if (!filename) {
    throw new Error(`file_path does not name a file: ${options.filePath}`);
  }

  const extension = extensionOf(filename);
  const mimeType = EXTENSION_MIME_TYPES.get(extension);
  if (!mimeType) {
    throw new Error(
      `Unsupported image format ${extension ? `'.${extension}'` : `(no extension on '${filename}')`}. ` +
      `BookStack's image gallery accepts: ${SUPPORTED_IMAGE_EXTENSIONS.join(', ')}. ` +
      `SVG is not accepted — convert to PNG first.`
    );
  }

  if (options.byteLength === 0) {
    throw new Error(`Refusing to upload an empty file: ${options.filePath}`);
  }

  const kib = options.byteLength / 1024;
  if (kib > DEFAULT_MAX_UPLOAD_KIB) {
    throw new Error(
      `Image is ${Math.round(kib / 1024)} MiB, above BookStack's default upload limit of ` +
      `${DEFAULT_MAX_UPLOAD_KIB / 1000} MB. Resize it, or raise app.upload_limit on the server.`
    );
  }

  return { filename, mimeType, name: options.name?.trim() || filename };
}
