// Entra (Microsoft 365) OAuth proxy for remote MCP / Claude Connectors.
//
// Modeled on zereight/gitlab-mcp's GITLAB_MCP_OAUTH mode: the MCP server hosts the
// OAuth surface Claude expects (discovery metadata + Dynamic Client Registration +
// authorize/token) and brokers the real login upstream to Entra ID. Claude self-registers
// (DCR is handled locally — Entra never sees it), logs the user in against the tenant, and
// receives the Entra access token, which the MCP server validates statelessly per request.
//
// This module is deliberately BookStack-agnostic so it can be reused across the MCP fleet.
// The only app-specific glue (mapping the `roles` claim to which credential/tool set to use)
// lives in the caller.

import { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID, createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface OAuthConfig {
  serverUrl: string; // public HTTPS base URL of THIS server, no trailing slash
  tenantId: string;
  clientId: string;
  clientSecret: string;
  audience: string; // expected `aud` of the access token, e.g. api://<client-id>
  scopes: string; // space-separated scopes requested upstream from Entra
  writeRole: string; // Entra app-role value that grants write access
  trustProxy: boolean;
  // Derived Entra endpoints
  authorizeEndpoint: string;
  tokenEndpoint: string;
  issuers: string[]; // acceptable `iss` values (v2 + v1)
  jwksUri: string;
}

export interface BearerResult {
  ok: boolean;
  sub?: string;
  roles?: string[];
  isWriter?: boolean;
  error?: string;
}

// Load config from env. Returns null when OAuth proxy mode is disabled.
export function loadOAuthConfig(env: NodeJS.ProcessEnv): OAuthConfig | null {
  if (env.MCP_OAUTH_ENABLE?.toLowerCase() !== "true") return null;

  const missing: string[] = [];
  const req = (name: string): string => {
    const v = env[name];
    if (!v) missing.push(name);
    return v ?? "";
  };

  const serverUrl = req("MCP_SERVER_URL").replace(/\/+$/, "");
  const tenantId = req("OAUTH_TENANT_ID");
  const clientId = req("OAUTH_CLIENT_ID");
  const clientSecret = req("OAUTH_CLIENT_SECRET");

  if (missing.length) {
    console.error(
      `Error: MCP_OAUTH_ENABLE=true but missing required vars: ${missing.join(", ")}`
    );
    process.exit(1);
  }

  const audience = env.OAUTH_AUDIENCE || `api://${clientId}`;
  const scopes =
    env.OAUTH_SCOPES || `openid profile offline_access ${audience}/.default`;
  const writeRole = env.OAUTH_WRITE_ROLE || "Writer";
  const trustProxy = env.MCP_TRUST_PROXY?.toLowerCase() === "true";

  const base = `https://login.microsoftonline.com/${tenantId}`;
  return {
    serverUrl,
    tenantId,
    clientId,
    clientSecret,
    audience,
    scopes,
    writeRole,
    trustProxy,
    authorizeEndpoint: `${base}/oauth2/v2.0/authorize`,
    tokenEndpoint: `${base}/oauth2/v2.0/token`,
    issuers: [
      `${base}/v2.0`,
      `https://sts.windows.net/${tenantId}/`,
    ],
    jwksUri: `${base}/discovery/v2.0/keys`,
  };
}

// ---- In-memory short-lived stores (single-replica; see spec "State & scaling") ----

interface RegisteredClient {
  clientId: string;
  redirectUris: string[];
  createdAt: number;
}

interface PendingAuth {
  clientId: string;
  clientRedirectUri: string; // where to send the user back (Claude)
  clientState: string; // Claude's state, echoed back
  codeChallenge: string; // Claude's PKCE challenge (S256)
  createdAt: number;
}

interface IssuedCode {
  clientId: string;
  clientRedirectUri: string;
  codeChallenge: string;
  tokenResponse: unknown; // the upstream Entra token response, passed through
  createdAt: number;
}

const TTL_CLIENT = 1000 * 60 * 60 * 24 * 30; // 30d
const TTL_PENDING = 1000 * 60 * 10; // 10m
const TTL_CODE = 1000 * 60 * 5; // 5m

const clients = new Map<string, RegisteredClient>();
const pending = new Map<string, PendingAuth>(); // keyed by upstream `state`
const codes = new Map<string, IssuedCode>(); // keyed by our authorization code

function sweep(): void {
  const now = Date.now();
  for (const [k, v] of clients) if (now - v.createdAt > TTL_CLIENT) clients.delete(k);
  for (const [k, v] of pending) if (now - v.createdAt > TTL_PENDING) pending.delete(k);
  for (const [k, v] of codes) if (now - v.createdAt > TTL_CODE) codes.delete(k);
}

// ---- HTTP helpers ----

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseForm(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
  return out;
}

function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// ---- JWKS / token validation ----

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(cfg: OAuthConfig) {
  if (!jwks) jwks = createRemoteJWKSet(new URL(cfg.jwksUri));
  return jwks;
}

function audienceMatches(cfg: OAuthConfig, aud: unknown): boolean {
  const accepted = new Set([cfg.audience, cfg.clientId, `api://${cfg.clientId}`]);
  if (typeof aud === "string") return accepted.has(aud);
  if (Array.isArray(aud)) return aud.some((a) => accepted.has(a));
  return false;
}

export async function validateBearer(
  req: IncomingMessage,
  cfg: OAuthConfig
): Promise<BearerResult> {
  const header = req.headers["authorization"];
  if (!header || Array.isArray(header) || !header.startsWith("Bearer ")) {
    return { ok: false, error: "missing bearer token" };
  }
  const token = header.slice("Bearer ".length).trim();
  try {
    const { payload } = await jwtVerify(token, getJwks(cfg), {
      issuer: cfg.issuers,
    });
    if (!audienceMatches(cfg, payload.aud)) {
      return { ok: false, error: "audience mismatch" };
    }
    const roles = Array.isArray(payload.roles)
      ? (payload.roles as string[])
      : [];
    return {
      ok: true,
      sub: typeof payload.sub === "string" ? payload.sub : undefined,
      roles,
      isWriter: roles.includes(cfg.writeRole),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Emit the 401 that bootstraps Claude's OAuth discovery (RFC 9728).
export function sendUnauthorized(res: ServerResponse, cfg: OAuthConfig): void {
  res.writeHead(401, {
    "Content-Type": "application/json",
    "WWW-Authenticate": `Bearer resource_metadata="${cfg.serverUrl}/.well-known/oauth-protected-resource"`,
  });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized: authentication required" },
      id: null,
    })
  );
}

// ---- OAuth route handling ----
// Returns true if this request was an OAuth endpoint (handled here), false otherwise.
export async function handleOAuthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  cfg: OAuthConfig
): Promise<boolean> {
  const url = new URL(req.url ?? "/", cfg.serverUrl);
  const path = url.pathname;
  sweep();

  // RFC 9728 — Protected Resource Metadata
  if (path === "/.well-known/oauth-protected-resource") {
    sendJson(res, 200, {
      resource: cfg.serverUrl,
      authorization_servers: [cfg.serverUrl],
      bearer_methods_supported: ["header"],
      scopes_supported: cfg.scopes.split(/\s+/).filter(Boolean),
    });
    return true;
  }

  // RFC 8414 — Authorization Server Metadata (we ARE the AS, proxying to Entra)
  if (path === "/.well-known/oauth-authorization-server") {
    sendJson(res, 200, {
      issuer: cfg.serverUrl,
      authorization_endpoint: `${cfg.serverUrl}/authorize`,
      token_endpoint: `${cfg.serverUrl}/token`,
      registration_endpoint: `${cfg.serverUrl}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: cfg.scopes.split(/\s+/).filter(Boolean),
    });
    return true;
  }

  // RFC 7591 — Dynamic Client Registration (handled locally)
  if (path === "/register" && req.method === "POST") {
    let meta: any = {};
    try {
      meta = JSON.parse((await readBody(req)) || "{}");
    } catch {
      sendJson(res, 400, { error: "invalid_client_metadata" });
      return true;
    }
    const redirectUris: string[] = Array.isArray(meta.redirect_uris)
      ? meta.redirect_uris
      : [];
    if (redirectUris.length === 0) {
      sendJson(res, 400, {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris is required",
      });
      return true;
    }
    const clientId = `mcp-${randomUUID()}`;
    clients.set(clientId, { clientId, redirectUris, createdAt: Date.now() });
    sendJson(res, 201, {
      client_id: clientId,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
    return true;
  }

  // Authorization endpoint — redirect the browser up to Entra.
  if (path === "/authorize" && req.method === "GET") {
    const q = url.searchParams;
    const clientId = q.get("client_id") ?? "";
    const redirectUri = q.get("redirect_uri") ?? "";
    const clientState = q.get("state") ?? "";
    const codeChallenge = q.get("code_challenge") ?? "";
    const method = q.get("code_challenge_method") ?? "";

    const client = clients.get(clientId);
    if (!client) {
      sendJson(res, 400, { error: "invalid_client" });
      return true;
    }
    if (!client.redirectUris.includes(redirectUri)) {
      sendJson(res, 400, { error: "invalid_request", error_description: "redirect_uri mismatch" });
      return true;
    }
    if (method !== "S256" || !codeChallenge) {
      sendJson(res, 400, { error: "invalid_request", error_description: "PKCE S256 required" });
      return true;
    }

    const upstreamState = randomBytes(24).toString("base64url");
    pending.set(upstreamState, {
      clientId,
      clientRedirectUri: redirectUri,
      clientState,
      codeChallenge,
      createdAt: Date.now(),
    });

    const up = new URL(cfg.authorizeEndpoint);
    up.searchParams.set("client_id", cfg.clientId);
    up.searchParams.set("response_type", "code");
    up.searchParams.set("redirect_uri", `${cfg.serverUrl}/callback`);
    up.searchParams.set("response_mode", "query");
    up.searchParams.set("scope", cfg.scopes);
    up.searchParams.set("state", upstreamState);
    res.writeHead(302, { Location: up.toString() });
    res.end();
    return true;
  }

  // Callback from Entra — exchange code upstream, then hand our own code to the client.
  if (path === "/callback" && req.method === "GET") {
    const q = url.searchParams;
    const upstreamState = q.get("state") ?? "";
    const code = q.get("code") ?? "";
    const err = q.get("error");
    const p = pending.get(upstreamState);
    if (!p) {
      sendJson(res, 400, { error: "invalid_state" });
      return true;
    }
    pending.delete(upstreamState);
    if (err || !code) {
      const dest = new URL(p.clientRedirectUri);
      dest.searchParams.set("error", err || "invalid_request");
      if (p.clientState) dest.searchParams.set("state", p.clientState);
      res.writeHead(302, { Location: dest.toString() });
      res.end();
      return true;
    }

    // Confidential-client code exchange with Entra.
    const tokenRes = await fetch(cfg.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${cfg.serverUrl}/callback`,
        scope: cfg.scopes,
      }),
    });
    const tokenJson = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok || !tokenJson) {
      const dest = new URL(p.clientRedirectUri);
      dest.searchParams.set("error", "server_error");
      if (p.clientState) dest.searchParams.set("state", p.clientState);
      res.writeHead(302, { Location: dest.toString() });
      res.end();
      return true;
    }

    const ourCode = randomBytes(32).toString("base64url");
    codes.set(ourCode, {
      clientId: p.clientId,
      clientRedirectUri: p.clientRedirectUri,
      codeChallenge: p.codeChallenge,
      tokenResponse: tokenJson,
      createdAt: Date.now(),
    });

    const dest = new URL(p.clientRedirectUri);
    dest.searchParams.set("code", ourCode);
    if (p.clientState) dest.searchParams.set("state", p.clientState);
    res.writeHead(302, { Location: dest.toString() });
    res.end();
    return true;
  }

  // Token endpoint — code exchange (verify PKCE) and refresh pass-through.
  if (path === "/token" && req.method === "POST") {
    const form = parseForm(await readBody(req));
    const grant = form["grant_type"];

    if (grant === "authorization_code") {
      const issued = codes.get(form["code"] ?? "");
      if (!issued) {
        sendJson(res, 400, { error: "invalid_grant" });
        return true;
      }
      codes.delete(form["code"]!);
      const verifier = form["code_verifier"] ?? "";
      if (!verifier || s256(verifier) !== issued.codeChallenge) {
        sendJson(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed" });
        return true;
      }
      if (form["client_id"] && form["client_id"] !== issued.clientId) {
        sendJson(res, 400, { error: "invalid_client" });
        return true;
      }
      sendJson(res, 200, issued.tokenResponse);
      return true;
    }

    if (grant === "refresh_token") {
      // Proxy the refresh straight to Entra (confidential client).
      const refreshRes = await fetch(cfg.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: "refresh_token",
          refresh_token: form["refresh_token"] ?? "",
          scope: cfg.scopes,
        }),
      });
      const refreshJson = await refreshRes.json().catch(() => null);
      sendJson(res, refreshRes.ok ? 200 : 400, refreshJson ?? { error: "invalid_grant" });
      return true;
    }

    sendJson(res, 400, { error: "unsupported_grant_type" });
    return true;
  }

  return false;
}
