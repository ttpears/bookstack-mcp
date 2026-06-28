# BookStack MCP — M365/Entra OAuth Connector

**Date:** 2026-06-27
**Status:** Approved, implementing
**Version target:** 5.0.0

## Goal

Let BookStack MCP be added as a remote **Claude Connector** (Desktop / claude.ai) over a
public HTTPS URL, gated by Microsoft 365 (Entra ID) login — with **no API key entry by the
user** and no client ID/secret paste. The server holds the BookStack credentials; users
authenticate to the tenant.

## Decisions (settled during brainstorming)

- **BookStack cannot be an OAuth provider** — it's an OIDC *client* only; its API takes a
  native `Authorization: Token <id>:<secret>` and cannot exchange an OIDC login for API access
  ([BookStack #5614](https://github.com/BookStackApp/BookStack/issues/5614)). So per-user
  BookStack identity would require a pasted token, which is rejected ("no key entry").
- Therefore: **Entra login gates access; BookStack calls use shared service tokens** held by
  the server.
- **Two tokens**: a read-only BookStack token and a write-capable one.
- **Write is gated by an Entra App Role** (`OAUTH_WRITE_ROLE`, default `Writer`). App roles —
  not raw group IDs — to get a clean `roles` claim and avoid group-overage truncation.
- **Per-session decision at login**: members get read tools on the read-only token; members
  carrying the write role get read+write tools on the write-capable token. Defense-in-depth:
  a non-writer's session is bound to the read-only token, so a gating bug still can't write.
- **Stateless validation**: Claude holds the Entra JWT; the server validates it per request
  (JWKS signature, issuer, audience, expiry, tenant). No auth-state store on the hot path.
- **Modeled on** zereight/gitlab-mcp's `GITLAB_MCP_OAUTH` proxy: the MCP server hosts the
  OAuth surface and does **DCR locally**, brokering the real login upstream (here, Entra).
- TLS terminated by a reverse proxy; Node stays HTTP behind it (`MCP_TRUST_PROXY`).
- Reusable across the MCP fleet: OAuth proxy lives in its own module with a narrow interface.

## Architecture

Three transport/auth modes (first two unchanged):

| Mode | Trigger | Auth | BookStack identity |
|---|---|---|---|
| stdio | default | none (local) | `BOOKSTACK_TOKEN_*`, `BOOKSTACK_ENABLE_WRITE` |
| HTTP, no auth | `MCP_TRANSPORT=http` | none | same as stdio |
| **HTTP + Entra OAuth** | `MCP_TRANSPORT=http` + `MCP_OAUTH_ENABLE=true` | Entra OAuth proxy | read/write token chosen per session by role |

### Connect flow (Desktop)

1. User adds the connector URL. First `/mcp` call has no bearer → server replies `401` with
   `WWW-Authenticate: Bearer resource_metadata="<url>/.well-known/oauth-protected-resource"`.
2. Claude fetches PRM → it names the authorization server (this server) → Claude fetches
   `/.well-known/oauth-authorization-server`.
3. Claude **self-registers** via `POST /register` (DCR) → server mints a virtual public
   client_id (PKCE required, no secret).
4. Claude opens `/authorize` (PKCE S256). Server stores the pending request and redirects the
   browser to **Entra** `/authorize`, with redirect_uri = `<url>/callback` (callback proxy:
   Entra needs only this one redirect URI) and the configured scopes.
5. User signs in to the tenant. Entra redirects to `/callback` with a code. Server exchanges
   it at Entra `/token` (confidential client, using `OAUTH_CLIENT_SECRET`), then redirects back
   to Claude's redirect_uri with the server's own authorization code.
6. Claude calls `/token` with the code + PKCE verifier. Server returns the Entra
   `access_token` (+ `refresh_token`, `expires_in`) — pass-through.
7. Claude sends `Authorization: Bearer <jwt>` on every `/mcp` request; server validates
   statelessly and reuses the Entra refresh token via `/token` `grant_type=refresh_token`.

### Per-session authorization

At `initialize` (new session), after validating the bearer, read the `roles` claim:
- `roles` includes `OAUTH_WRITE_ROLE` → build the MCP server with the **write** token and
  `enableWrite=true` (read + write tools).
- otherwise → build with the **read-only** token and `enableWrite=false` (read tools only).

The session stores `{ transport, sub, isWriter }`. Later requests revalidate the bearer and
check the subject matches the session; the tool set is fixed at init.

## Components

- **`src/oauth/entra-proxy.ts`** (new) — self-contained, env-driven. Exports:
  - `loadOAuthConfig(env)` → `OAuthConfig | null` (null when disabled).
  - `handleOAuthRoutes(req, res, cfg)` → `boolean` — serves the two well-known docs plus
    `/register`, `/authorize`, `/callback`, `/token`; returns true if it handled the path.
  - `validateBearer(req, cfg)` → `{ ok, sub?, roles?, error? }` — `jose` remote JWKS verify,
    issuer/audience/exp checks.
  The only BookStack-specific glue (role → token + tool set) stays in `index.ts`, so the
  module ports to other fleet MCPs unchanged.
- **`src/index.ts`** — `startHttp` mounts OAuth routes when enabled, enforces the bearer on
  `/mcp`, and selects the per-session `BookStackConfig`. `buildServer` already takes a config.
- **`src/bookstack-client.ts`** — unchanged.
- **`package.json`** — add `jose` as a direct dependency; bump to `5.0.0`.

## Environment contract

Existing: `BOOKSTACK_BASE_URL`, `BOOKSTACK_TOKEN_ID/SECRET`, `BOOKSTACK_ENABLE_WRITE`,
`BOOKSTACK_INSECURE_SKIP_TLS_VERIFY`, `MCP_TRANSPORT`, `MCP_HTTP_PORT/HOST/PATH`,
`MCP_HTTP_ALLOWED_HOSTS`.

New:
- `BOOKSTACK_WRITE_TOKEN_ID`, `BOOKSTACK_WRITE_TOKEN_SECRET` — write-capable token (OAuth mode).
- `MCP_OAUTH_ENABLE` — turn on the Entra proxy mode.
- `MCP_SERVER_URL` — public HTTPS base URL (metadata + redirect URIs); no trailing slash.
- `MCP_TRUST_PROXY` — trust `X-Forwarded-*` for scheme/host.
- `OAUTH_TENANT_ID` — Entra tenant (GUID or domain).
- `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` — pre-registered Entra app.
- `OAUTH_AUDIENCE` — expected `aud` (e.g. `api://<client-id>`); validated leniently against
  `{audience, clientId, api://clientId}`.
- `OAUTH_SCOPES` — space-separated; default `openid profile offline_access <audience>/.default`.
- `OAUTH_WRITE_ROLE` — app role value granting write; default `Writer`.

Behavior notes:
- If `MCP_OAUTH_ENABLE=true` but the write token is unset, the write role has no effect (all
  sessions read-only) and the server logs a warning at startup.
- Non-OAuth modes keep today's single-token + `BOOKSTACK_ENABLE_WRITE` behavior (backward
  compatible).

## Entra app registration (operator setup, documented for the runbook)

1. App registration in the tenant; add a client secret → `OAUTH_CLIENT_ID/SECRET`.
2. Expose an API → Application ID URI `api://<client-id>` → `OAUTH_AUDIENCE`.
3. App roles → define `Writer` (assignable to users/groups) → `OAUTH_WRITE_ROLE`.
4. Redirect URI (Web) = `<MCP_SERVER_URL>/callback`.
5. Set `accessTokenAcceptedVersion: 2` in the manifest so tokens carry a v2 `iss`/`aud`.
6. Assign tenant members to the app; assign the `Writer` role to those who need write.

## State & scaling

Hot path (per-request validation) is stateless. DCR client registrations, pending-auth, and
short-lived authorization codes are kept in-memory with TTLs — fine for a single replica
behind the reverse proxy. Multi-replica would need shared storage for those three short-lived
maps (out of scope for v1; noted).

## Verification

- `npm run type-check` and `npm run build` clean.
- Manual: with OAuth disabled, stdio + no-auth HTTP behave exactly as 4.0.0.
- Manual: with OAuth enabled, `/.well-known/oauth-protected-resource` and
  `/.well-known/oauth-authorization-server` return valid metadata; unauthenticated `/mcp`
  returns `401` with the `WWW-Authenticate` resource_metadata hint.
- End-to-end connect against the tenant validated once infra/Entra app exist.

## Out of scope (v1)

Per-user BookStack identity, DCR shim against Entra, multi-replica shared state, Azure-native
fronting (APIM/Easy Auth), per-request token header mode (gitlab-mcp `REMOTE_AUTHORIZATION`).
