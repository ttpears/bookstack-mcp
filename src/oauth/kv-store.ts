// Minimal async key/value store with per-key TTL for the OAuth proxy's broker
// state (DCR clients, pending flows, issued codes). Redis-backed when REDIS_URL
// is set — so state survives redeploys and can run more than one replica —
// otherwise in-process memory. Mirrors the store in ttpears/gitlab-mcp.

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export interface KvStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  dispose(): void;
}

/** In-process store with lazy expiry on read plus a periodic sweep. */
export class InMemoryKvStore implements KvStore {
  private readonly map = new Map<string, { value: unknown; expiresAt: number }>();
  private sweep?: ReturnType<typeof setInterval>;

  constructor(private readonly prefix = "bookstack-mcp:") {
    this.sweep = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.map) if (v.expiresAt < now) this.map.delete(k);
    }, SWEEP_INTERVAL_MS);
    this.sweep.unref?.();
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.map.get(this.prefix + key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.map.delete(this.prefix + key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.map.set(this.prefix + key, { value, expiresAt: Date.now() + ttlMs });
  }

  async del(key: string): Promise<void> {
    this.map.delete(this.prefix + key);
  }

  dispose(): void {
    if (this.sweep) clearInterval(this.sweep);
  }
}

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, ttl: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  quit(): Promise<unknown>;
}

/** Redis-backed store. TTL enforced by Redis (PX); no sweep needed. */
export class RedisKvStore implements KvStore {
  constructor(private readonly client: RedisLike, private readonly prefix: string) {}

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(this.prefix + key);
    return raw == null ? undefined : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await this.client.set(this.prefix + key, JSON.stringify(value), "PX", Math.max(1, Math.floor(ttlMs)));
  }

  async del(key: string): Promise<void> {
    await this.client.del(this.prefix + key);
  }

  dispose(): void {
    void this.client.quit();
  }
}

/**
 * Build the store. Redis when `redisUrl` is set (ioredis loaded lazily so
 * non-Redis deployments don't pay for it); otherwise in-memory. `keyPrefix`
 * should include the issuer host so co-tenant MCPs sharing one Redis don't
 * collide while replicas of the same issuer DO share state.
 */
export async function createStore(redisUrl: string | undefined, keyPrefix: string): Promise<KvStore> {
  const prefix = keyPrefix.endsWith(":") ? keyPrefix : `${keyPrefix}:`;
  if (redisUrl) {
    const mod: any = await import("ioredis");
    const Redis = mod.default || mod;
    const client = new Redis(redisUrl, { maxRetriesPerRequest: 2, lazyConnect: false }) as RedisLike;
    return new RedisKvStore(client, prefix);
  }
  return new InMemoryKvStore(prefix);
}
