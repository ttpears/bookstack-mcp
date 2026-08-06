import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// Per-session auth binding (OAuth mode only): subject + resolved write status, fixed at init.
export interface SessionAuthBinding {
  sub?: string;
  isWriter: boolean;
}

// Production traffic shows SSE streams recycling roughly every 5 minutes as normal,
// healthy behavior (reconnect/backoff churn). 30 minutes gives 6x that margin, so a
// normal reconnect cycle — even a slow or retried one — never gets mistaken for an
// abandoned session, while still bounding how long a truly abandoned session's
// transport (and the McpServer + tool closures it holds) can leak.
const DEFAULT_IDLE_TTL_MS = 30 * 60 * 1000;

// Sweep cadence mirrors oauth/kv-store.ts's InMemoryKvStore.
const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// Hard cap as a second line of defense: bounds worst-case memory even if the TTL
// logic has a bug, or a burst of sessions arrives faster than a sweep tick.
const DEFAULT_MAX_SESSIONS = 1000;

export interface SessionRegistryOptions {
  idleTtlMs?: number;
  sweepIntervalMs?: number;
  maxSessions?: number;
}

/**
 * Tracks live StreamableHTTPServerTransport sessions and their OAuth binding for the
 * HTTP transport. Mirrors oauth/kv-store.ts's InMemoryKvStore: a periodic sweep
 * (`setInterval`, `.unref()`'d) evicts sessions idle longer than `idleTtlMs`, with a
 * lazy expiry check on access as a backstop between sweeps. `maxSessions` is a hard
 * cap enforced independently of the TTL. `dispose()` stops the sweep timer.
 */
export class SessionRegistry {
  private readonly transports: Record<string, StreamableHTTPServerTransport> = {};
  private readonly sessionAuth: Record<string, SessionAuthBinding> = {};
  private readonly lastSeen: Record<string, number> = {};
  readonly idleTtlMs: number;
  readonly maxSessions: number;
  private sweep?: ReturnType<typeof setInterval>;

  constructor(options: SessionRegistryOptions = {}) {
    this.idleTtlMs = options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    const sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    this.sweep = setInterval(() => this.sweepExpired(), sweepIntervalMs);
    this.sweep.unref?.();
  }

  /** Closes the transport (best-effort) before dropping it from bookkeeping, mirroring shutdown(). */
  private evict(sessionId: string): void {
    this.transports[sessionId]?.close().catch(() => {});
    this.delete(sessionId);
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const sid of Object.keys(this.transports)) {
      if (now - (this.lastSeen[sid] ?? 0) >= this.idleTtlMs) this.evict(sid);
    }
  }

  /** Evicts sessionId if idle-expired. Returns true if it was (or already is) absent. */
  private purgeIfExpired(sessionId: string): boolean {
    if (!(sessionId in this.transports)) return true;
    const seen = this.lastSeen[sessionId];
    if (seen === undefined || Date.now() - seen >= this.idleTtlMs) {
      this.evict(sessionId);
      return true;
    }
    return false;
  }

  has(sessionId: string): boolean {
    return !this.purgeIfExpired(sessionId);
  }

  /** Also refreshes the session's idle timer — every real request is a keep-alive. */
  get(sessionId: string): StreamableHTTPServerTransport | undefined {
    if (this.purgeIfExpired(sessionId)) return undefined;
    this.lastSeen[sessionId] = Date.now();
    return this.transports[sessionId];
  }

  getAuth(sessionId: string): SessionAuthBinding | undefined {
    if (this.purgeIfExpired(sessionId)) return undefined;
    return this.sessionAuth[sessionId];
  }

  atCapacity(): boolean {
    return this.size() >= this.maxSessions;
  }

  register(sessionId: string, transport: StreamableHTTPServerTransport, auth?: SessionAuthBinding): void {
    this.transports[sessionId] = transport;
    this.lastSeen[sessionId] = Date.now();
    if (auth) this.sessionAuth[sessionId] = auth;
  }

  delete(sessionId: string): void {
    delete this.transports[sessionId];
    delete this.sessionAuth[sessionId];
    delete this.lastSeen[sessionId];
  }

  sessionIds(): string[] {
    return Object.keys(this.transports);
  }

  size(): number {
    return this.sessionIds().length;
  }

  dispose(): void {
    if (this.sweep) clearInterval(this.sweep);
  }
}
