import { AsyncLocalStorage } from 'node:async_hooks';
import { IncomingHttpHeaders } from 'node:http';
import { BookStackClient, BookStackConfig } from './bookstack-client.js';

type Credentials = Pick<BookStackConfig, 'tokenId' | 'tokenSecret'>;
interface RequestContext {
  credentials?: Credentials;
  clients: Map<BookStackClient, BookStackClient>;
}
const requests = new AsyncLocalStorage<RequestContext>();

export function parseRequestCredentials(headers: IncomingHttpHeaders, enabled: boolean): Credentials | undefined {
  if (!enabled) return undefined;
  const tokenId = headers['x-bookstack-token-id'];
  const tokenSecret = headers['x-bookstack-token-secret'];
  if (tokenId === undefined && tokenSecret === undefined) return undefined;
  if (typeof tokenId !== 'string' || typeof tokenSecret !== 'string' ||
      !tokenId.trim() || !tokenSecret.trim() || /[\s:,]/.test(tokenId) || /[\s,]/.test(tokenSecret)) {
    throw new Error('Supply both X-Bookstack-Token-Id and X-Bookstack-Token-Secret as single non-empty credentials.');
  }
  return { tokenId, tokenSecret };
}

export function withRequestCredentials<T>(credentials: Credentials | undefined, fn: () => T): T {
  return requests.run({ credentials, clients: new Map() }, fn);
}

/** Tool/resource closures use the current HTTP request identity, including when
 * a session is reused. Each request owns its clients and private slug caches. */
export function requestScopedClient(config: BookStackConfig): BookStackClient {
  const fallback = new BookStackClient(config);
  return new Proxy(fallback, {
    get(target, property) {
      const request = requests.getStore();
      let selected = target;
      if (request?.credentials) {
        selected = request.clients.get(target);
        if (!selected) {
          selected = new BookStackClient({ ...config, ...request.credentials, privateSlugCache: true });
          request.clients.set(target, selected);
        }
      }
      const value = Reflect.get(selected, property);
      return typeof value === 'function' ? value.bind(selected) : value;
    }
  });
}
