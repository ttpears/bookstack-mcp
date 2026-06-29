# BookStack MCP — Remote / Connector Setup

How to run `bookstack-mcp` as a remote server: as an internal MCP for LibreChat
(no auth, Docker-internal) and as a public **Claude Connector** gated by Microsoft
365 / Entra ID login (OAuth proxy).

## Modes at a glance

| Mode | When | `MCP_TRANSPORT` | `MCP_OAUTH_ENABLE` | Auth |
|---|---|---|---|---|
| stdio | local desktop client | `stdio` (default) | — | none |
| HTTP, no auth | internal (self-hosted LibreChat) | `http` | unset | trusted Docker network |
| HTTP + Entra OAuth | public Claude Connector | `http` | `true` | M365 login; per-session token by role |

## Container image (GHCR)

Published to `ghcr.io/ttpears/bookstack-mcp`:

- Released tags: `:X.Y.Z`, `:X.Y`, `:latest` (built on `v*` git tags by `release.yml`).
- **Preview tags: `:branch-<slug>`** — built for every PR by `ci.yml` so a branch can be
  pulled and tested on your LibreChat host before it ships. The slug is the lowercased head-ref with
  `/` → `-` (e.g. branch `feat/m365-oauth-connector` → `ghcr.io/ttpears/bookstack-mcp:branch-feat-m365-oauth-connector`).

Pulling on your internal Docker host (GHCR packages are private by default — either make the package public
in the repo's Packages settings, or authenticate once):

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u ttpears --password-stdin   # PAT with read:packages
docker pull ghcr.io/ttpears/bookstack-mcp:branch-feat-m365-oauth-connector
```

## BookStack tokens (two of them)

Both are native BookStack API tokens (Edit Profile → **API Tokens** on a user that has the
**"Access System API"** role permission). Create them on service accounts:

- **Read-only token** → `BOOKSTACK_TOKEN_ID` / `BOOKSTACK_TOKEN_SECRET`. The token's BookStack
  role should grant read but not edit/delete.
- **Write-capable token** → `BOOKSTACK_WRITE_TOKEN_ID` / `BOOKSTACK_WRITE_TOKEN_SECRET`. Only
  used by OAuth-mode sessions whose user carries the Entra write role.

In OAuth mode the read-only token is always used unless the caller has the write role, so a
non-writer session is physically bound to the read-only credential.

## Environment variables

| Var | Required | Notes |
|---|---|---|
| `BOOKSTACK_BASE_URL` | yes | e.g. `https://wiki.example.com` |
| `BOOKSTACK_TOKEN_ID` / `_SECRET` | yes | read-only token |
| `BOOKSTACK_WRITE_TOKEN_ID` / `_SECRET` | OAuth write | write-capable token |
| `BOOKSTACK_ENABLE_WRITE` | no | governs write only in non-OAuth modes (legacy) |
| `BOOKSTACK_INSECURE_SKIP_TLS_VERIFY` | no | self-signed BookStack only |
| `MCP_TRANSPORT` | http | set `http` for remote |
| `MCP_HTTP_HOST` / `MCP_HTTP_PORT` | no | container image defaults to `0.0.0.0:8080` |
| `MCP_HTTP_ALLOWED_HOSTS` | no | DNS-rebind allowlist; set to your public host for defense-in-depth |
| `MCP_OAUTH_ENABLE` | no | `true` enables the Entra OAuth proxy |
| `MCP_SERVER_URL` | OAuth | public HTTPS base URL, no trailing slash (e.g. `https://bookstack-mcp.example.com`) |
| `MCP_TRUST_PROXY` | OAuth (behind proxy) | `true` to read `X-Forwarded-*` |
| `OAUTH_TENANT_ID` | OAuth | Entra Directory (tenant) ID |
| `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` | OAuth | the Entra app registration |
| `OAUTH_AUDIENCE` | no | defaults to `api://<client-id>` |
| `OAUTH_SCOPES` | no | defaults to `openid profile offline_access <audience>/.default` |
| `OAUTH_WRITE_ROLE` | no | Entra app-role value granting write; default `Writer` |

---

## Part A — Create the Entra (Microsoft 365) app

Do this once per public connector host. Requires an Entra admin. Portal:
<https://entra.microsoft.com> → **Identity → Applications → App registrations**.

1. **New registration.**
   - Name: `BookStack MCP Connector`.
   - Supported account types: **Accounts in this organizational directory only (single tenant)**.
   - Redirect URI: platform **Web**, value `https://<MCP_SERVER_URL>/callback`
     (e.g. `https://bookstack-mcp.example.com/callback`).
   - Register.

2. **Record IDs** (Overview page):
   - *Application (client) ID* → `OAUTH_CLIENT_ID`.
   - *Directory (tenant) ID* → `OAUTH_TENANT_ID`.

3. **Client secret.** Certificates & secrets → **New client secret** → copy the **Value**
   immediately → `OAUTH_CLIENT_SECRET`. (Set a rotation reminder before the expiry.)

4. **Expose an API.** Expose an API →
   - *Application ID URI*: accept the default `api://<client-id>` → this is `OAUTH_AUDIENCE`.
   - **Add a scope**: name `user_impersonation`, who can consent **Admins and users**, fill
     the consent display strings, State **Enabled**. (Lets the `.default` resource scope resolve.)

5. **App role for write.** App roles → **Create app role**:
   - Display name: `Writer`; Allowed member types: **Users/Groups**;
   - Value: `Writer` (this is `OAUTH_WRITE_ROLE`); Description: "Grants BookStack write tools";
   - **Enable** → Apply.

6. **Issue v2 tokens.** Manifest → set `"accessTokenAcceptedVersion": 2` (or, in the newer
   manifest editor, `requestedAccessTokenVersion: 2`) → Save. This makes the access-token
   `iss`/`aud` v2 so validation matches.

7. **Graph permissions.** API permissions → ensure delegated Microsoft Graph `openid`,
   `profile`, `offline_access` are present → **Grant admin consent**.

8. **Gate to members + assign roles.** Entra → **Enterprise applications** → this app:
   - Properties → **Assignment required? = Yes** (only assigned users can sign in).
   - Users and groups → **Add user/group**: assign the members (or a group) who may use the
     connector; assign the **Writer** role to those who should get write tools (others can be
     assigned the default/no-role access for read-only).

That's the whole Entra side. The connector holds the client secret server-side; **users never
enter a key or client credential** — they just sign in.

---

## Part B — Test on your LibreChat host (internal, no auth)

Fastest way to validate the tools. LibreChat reaches the MCP over the internal `librechat`
Docker network, exactly like `mediawiki-mcp`. No OAuth here.

1. Add a service alongside LibreChat (your LibreChat host's `docker-compose.override.yml`
   or the project compose), on the shared `librechat` network:

   ```yaml
   services:
     bookstack-mcp:
       image: ghcr.io/ttpears/bookstack-mcp:branch-feat-m365-oauth-connector
       environment:
         MCP_TRANSPORT: "http"
         MCP_HTTP_HOST: "0.0.0.0"
         MCP_HTTP_PORT: "8080"
         BOOKSTACK_BASE_URL: "https://wiki.example.com"
         BOOKSTACK_TOKEN_ID: "${BOOKSTACK_TOKEN_ID}"
         BOOKSTACK_TOKEN_SECRET: "${BOOKSTACK_TOKEN_SECRET}"
         TZ: America/New_York
       networks:
         - librechat
       restart: unless-stopped
   networks:
     librechat:
       external: true
   ```

2. Register it in your LibreChat host's `librechat.yaml`:

   ```yaml
   mcpServers:
     bookstack:
       type: streamable-http
       url: http://bookstack-mcp:8080/mcp
   ```

3. `docker compose up -d bookstack-mcp` and restart LibreChat. The BookStack tools should
   appear in LibreChat.

> Internal exposure trusts the Docker network. Do **not** publish port 8080 to the host in
> this mode — there's no auth gate. For external exposure use Part C.

---

## Part C — Public Claude Connector (Entra OAuth)

Mirrors the `gitlab-mcp-custom` swarm stack (traefik TLS, public, no auth gate at the proxy —
the OAuth discovery/`/mcp` endpoints must be reachable; the server itself enforces the bearer).

Run the image with OAuth enabled behind a TLS reverse proxy that terminates HTTPS at
`MCP_SERVER_URL` and forwards to container port 8080:

```yaml
services:
  bookstack-mcp:
    image: ghcr.io/ttpears/bookstack-mcp:latest
    environment:
      MCP_TRANSPORT: "http"
      MCP_HTTP_HOST: "0.0.0.0"
      MCP_HTTP_PORT: "8080"
      MCP_OAUTH_ENABLE: "true"
      MCP_SERVER_URL: "https://bookstack-mcp.example.com"
      MCP_TRUST_PROXY: "true"
      OAUTH_TENANT_ID: "${OAUTH_TENANT_ID}"
      OAUTH_CLIENT_ID: "${OAUTH_CLIENT_ID}"
      OAUTH_CLIENT_SECRET: "${OAUTH_CLIENT_SECRET}"
      OAUTH_WRITE_ROLE: "Writer"
      BOOKSTACK_BASE_URL: "https://wiki.example.com"
      BOOKSTACK_TOKEN_ID: "${BOOKSTACK_TOKEN_ID}"
      BOOKSTACK_TOKEN_SECRET: "${BOOKSTACK_TOKEN_SECRET}"
      BOOKSTACK_WRITE_TOKEN_ID: "${BOOKSTACK_WRITE_TOKEN_ID}"
      BOOKSTACK_WRITE_TOKEN_SECRET: "${BOOKSTACK_WRITE_TOKEN_SECRET}"
      TZ: America/New_York
    # ... traefik labels: Host(MCP_SERVER_URL), websecure, tls=true,
    #     loadbalancer.server.port=8080, healthcheck path /health
```

Then add it in Claude (Settings → Connectors → Add custom connector) with URL
`https://bookstack-mcp.example.com/mcp`. Claude self-registers (DCR), sends the user to the
M365 login, and connects — no client ID/secret to paste. Writers (Entra `Writer` role) get the
write tools; everyone else is read-only.

### Verifying the OAuth surface

```bash
curl -s https://bookstack-mcp.example.com/.well-known/oauth-protected-resource
curl -s https://bookstack-mcp.example.com/.well-known/oauth-authorization-server
# Unauthenticated /mcp must return 401 with a WWW-Authenticate: Bearer ... resource_metadata hint:
curl -si -X POST https://bookstack-mcp.example.com/mcp \
  -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"initialize","id":1}' | grep -i www-authenticate
```

## Troubleshooting

- **401 loop / "audience mismatch":** the access token `aud` isn't one of `OAUTH_AUDIENCE`,
  the client id, or `api://<client-id>`. Confirm step A.6 (v2 tokens) and that `OAUTH_AUDIENCE`
  matches the Application ID URI.
- **Write tools never appear:** the user lacks the `Writer` app-role assignment (A.8), or
  `BOOKSTACK_WRITE_TOKEN_*` is unset (startup logs a warning).
- **Rate-limit / wrong client IP behind a proxy:** set `MCP_TRUST_PROXY=true`.
- **Health checks:** `/health` returns `{"status":"ok"}` in every mode; the container
  `HEALTHCHECK` uses it.
