/** Messages authored by this application, rather than supplied by a remote
 * service or a library. Only these messages may reach MCP clients unchanged. */
export class PublicError extends Error {}

const OAUTH_CODES = new Set([
  'invalid_grant', 'invalid_client', 'invalid_request', 'unauthorized_client',
  'access_denied', 'temporarily_unavailable', 'server_error', 'invalid_scope',
  'interaction_required', 'consent_required', 'login_required'
]);
const SAFE_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT',
  'ECONNABORTED', 'ERR_NETWORK', 'ERR_CANCELED', 'ERR_BAD_REQUEST',
  'ERR_BAD_RESPONSE', 'ERR_INVALID_URL', 'ENOENT', 'EACCES', 'BOOKSTACK_RATE_LIMITED',
  ...OAUTH_CODES
]);

/** Allowlist fields, not a recursive dump/redaction of arbitrary error objects.
 * In particular, messages, stacks, causes, config, headers and bodies are omitted. */
export function safeErrorDetails(error: unknown): { status?: number; code?: string } {
  try {
    if (!error || typeof error !== 'object') return {};
    const value = error as { status?: unknown; response?: { status?: unknown }; code?: unknown };
    const status = value.response?.status ?? value.status;
    return {
      ...(typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}),
      ...(typeof value.code === 'string' && SAFE_CODES.has(value.code) ? { code: value.code } : {})
    };
  } catch {
    return {}; // A throwing getter must not defeat the error boundary.
  }
}

export function safeError(error: unknown, context = 'Operation failed'): PublicError {
  if (error instanceof PublicError) return error;
  const { status, code } = safeErrorDetails(error);
  const details = [status === undefined ? '' : `HTTP ${status}`, code ?? ''].filter(Boolean);
  const result = new PublicError(`${context}${details.length ? ` (${details.join('; ')})` : ''}`);
  return Object.assign(result, safeErrorDetails(error));
}

export function logSafeError(event: string, error: unknown): void {
  console.error(event, safeErrorDetails(error));
}

export function safeUrlOrigin(value: string): string {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : '<invalid URL>';
  } catch {
    return '<invalid URL>';
  }
}

export function oauthErrorCode(value: unknown, fallback = 'server_error'): string {
  return typeof value === 'string' && OAUTH_CODES.has(value) ? value : fallback;
}
