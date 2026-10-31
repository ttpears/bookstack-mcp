# Configuration reference

[Documentation index](README.md) · [Deployment](SETUP.md) · [Troubleshooting](TROUBLESHOOTING.md)

Settings come from the process environment. There is no automatic `.env` loading. Use your MCP client's `env` object, exported variables, Docker Compose `env_file`, or `node --env-file=.env dist/index.js` from a built checkout. Copy [`.env.example`](../.env.example) for a commented template. Keep secrets out of Git, command transcripts, and shared logs.

Boolean switches enable a feature when their value is `true` (case-insensitive). Supply numeric limits as positive integers unless stated otherwise. Restart after configuration changes; reconnect clients after changing tools or credentials.

## BookStack connection

| Variable | Default | Meaning |
|---|---|---|
| `BOOKSTACK_BASE_URL` | Required | Base URL, e.g. `https://wiki.example.com`; include a deployment subpath if applicable |
| `BOOKSTACK_TOKEN_ID` | Required | Native BookStack API token ID |
| `BOOKSTACK_TOKEN_SECRET` | Required | Matching API token secret |
| `BOOKSTACK_ENABLE_WRITE` | `false` | Register write tools in non-OAuth mode; does not grant BookStack permissions |
| `BOOKSTACK_INSECURE_SKIP_TLS_VERIFY` | `false` | Disable outgoing BookStack TLS verification; emits a warning. Prefer installing the issuing CA |
| `BOOKSTACK_TIMEOUT_MS` | `30000` | Timeout for each outbound BookStack HTTP attempt |
| `BOOKSTACK_RETRY_TIMEOUT_MS` | `60000` | Total budget per API request, including concurrency queue, attempts, and HTTP 429 backoff |
| `BOOKSTACK_MAX_CONCURRENCY` | `4` | Maximum concurrent BookStack requests, shared process-wide per base URL |

HTTP 429 responses can be retried up to five times. Each backoff is capped at 30 seconds and must fit within the remaining budget. Exhaustion returns an explicit error. A tool calling multiple BookStack endpoints can exceed one API request's budget overall. Concurrency smooths bursts; it does not enforce a requests-per-second quota. Separate processes have separate concurrency limits and caches.

## Transport and HTTP limits

| Variable | npm/source default | Meaning |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | Use `http` for Streamable HTTP; `sse` aliases the same transport, not the old `/sse` protocol |
| `MCP_HTTP_HOST` | `127.0.0.1` | Bind address; published Docker image sets `0.0.0.0` |
| `MCP_HTTP_PORT` | `8080` | Listening port; `PORT` is not used |
| `MCP_HTTP_PATH` | `/mcp` | MCP endpoint; OAuth routes remain at the origin's root paths |
| `MCP_HTTP_ALLOWED_HOSTS` | Loopback names on a loopback bind | Allowed incoming `Host` header hostnames, comma-separated, without schemes or ports |
| `MCP_HTTP_MAX_BODY_BYTES` | `10485760` | Maximum MCP JSON body, 10 MiB; invalid values fail startup |
| `BOOKSTACK_SESSION_IDLE_TTL_MS` | `1800000` | Idle session lifetime, 30 minutes; expired sessions are swept periodically |
| `BOOKSTACK_MAX_SESSIONS` | `1000` | Maximum live sessions; new sessions above the cap return HTTP 503 |

**Set an explicit host allowlist for a non-loopback bind.** If omitted on such a bind, host validation is disabled. Include names clients and proxies send, e.g. `mcp.example.com,bookstack-mcp,localhost,127.0.0.1`. Loopback entries allow the image's built-in `/health` check. Names match exactly; this does not authenticate callers or restrict source IPs.

OAuth registration/token bodies have a fixed 64 KiB limit, independent of `MCP_HTTP_MAX_BODY_BYTES`. All body reads have a fixed 30-second deadline. Oversized bodies return 413, incomplete slow bodies return 408, and malformed MCP JSON returns 400 without echoing the body. Align proxy limits with your deployment.

`GET /health` and `GET /` provide HTTP liveness only: they do not validate BookStack credentials or perform an API read. Stdio opens no HTTP listener.

HTTP sessions are held in memory. Restarting or expiring a session requires the client to initialize again after a 404. In OAuth mode each request must present a token with a subject; the session is bound to that subject and its current write-role state. A different subject gets 403. A role change closes the session and returns 404 for reinitialization with the appropriate credential and tools.

## Credentials and permissions

| Mode | Read tools | Write tools | BookStack credential |
|---|---|---|---|
| Stdio or HTTP without OAuth, writes disabled | Registered | Absent | `BOOKSTACK_TOKEN_*` |
| Stdio or HTTP without OAuth, writes enabled | Registered | Registered | `BOOKSTACK_TOKEN_*` for both |
| HTTP with OAuth, reader | Registered | Absent | `BOOKSTACK_TOKEN_*` |
| HTTP with OAuth, writer role and complete write pair | Registered | Registered | `BOOKSTACK_WRITE_TOKEN_*` for both reads and writes |
| HTTP with OAuth, writer role but no complete write pair | Registered | Absent | `BOOKSTACK_TOKEN_*`; startup warns |

In OAuth mode `BOOKSTACK_ENABLE_WRITE` does not unlock writes. Keep the base account read-only in BookStack itself. Limit the write account's content access and operations too. Administrative tools can be visible yet fail with 403 if the account lacks permission.

**Shared accounts are a content-access boundary.** Entra sign-in selects a service account; it does not map a user to a native BookStack account. Readers normally see the read account's content, and writers see the write account's content. BookStack records service-account activity rather than each Entra user's native identity. `{created_by:me}` means the effective BookStack account.

### Per-request HTTP credentials

`BOOKSTACK_ALLOW_REQUEST_CREDENTIALS` defaults to `false`. Enable it to accept `X-Bookstack-Token-Id` and `X-Bookstack-Token-Secret` on each MCP request. Both must be supplied together; a partial or invalid header pair is rejected with 400. If neither is supplied, the selected environment credential remains the fallback. The environment credential pair is still required at startup.

Overrides apply on reused sessions too, with a private slug cache for that request. They change the BookStack account; they do not bypass OAuth or enable writes for a reader session. Choose a fallback account with limited visibility: missing headers do not reject access. Use HTTPS or a trusted internal connection and redact both headers and bearer/session tokens in clients and proxies. [LibreChat example](CLIENTS.md#per-user-bookstack-credentials).

## Image sources

| Variable | HTTP default | Meaning |
|---|---|---|
| `BOOKSTACK_ALLOW_LOCAL_IMAGE_FILES` | `false` | Allow uploads from absolute paths on the server filesystem |
| `BOOKSTACK_IMAGE_ALLOWED_HOSTS` | Empty: deny URL sources | Allowed source hostnames, comma-separated; every redirect is checked |

Stdio permits local files and HTTP(S) sources for the trusted local client; these HTTP-specific restrictions do not apply there. An allowed hostname can include an internal service, so choose the list accordingly. Local paths refer to the server/container, not the user's computer.

Uploads accept PNG, JPEG, GIF, WebP, or SVG up to 50 MiB; BookStack may enforce a smaller limit. Source downloads do not receive the BookStack authorization header. See [image recipes](TOOLS.md#upload-a-gallery-image).

## Entra OAuth and Redis

These settings apply to the HTTP OAuth broker. Configure the matching Entra application using the [deployment runbook](SETUP.md#public-connector-with-entra-oauth).

| Variable | Default | Meaning |
|---|---|---|
| `MCP_OAUTH_ENABLE` | `false` | Enable Entra OAuth; set `MCP_TRANSPORT=http` too |
| `MCP_SERVER_URL` | Required with OAuth | Public HTTPS origin, e.g. `https://mcp.example.com`; metadata and redirects use this value |
| `OAUTH_TENANT_ID` | Required with OAuth | Entra directory/tenant ID |
| `OAUTH_CLIENT_ID` | Required with OAuth | Application/client ID |
| `OAUTH_CLIENT_SECRET` | Required with OAuth | Client secret **value**, held server-side |
| `OAUTH_AUDIENCE` | `api://<client-id>` | Resource audience |
| `OAUTH_SCOPES` | `openid profile offline_access <audience>/.default` | Upstream sign-in scopes |
| `OAUTH_WRITE_ROLE` | `Writer` | Entra app-role value granting write mode |
| `BOOKSTACK_WRITE_TOKEN_ID` / `BOOKSTACK_WRITE_TOKEN_SECRET` | Unset | Optional separate write-capable BookStack token; both required |
| `REDIS_URL` | Unset: in-memory | Redis connection URL for OAuth broker state |
| `REDIS_KEY_PREFIX` | `bookstack-mcp` | Base prefix, additionally namespaced by issuer host |

`MCP_TRUST_PROXY` is parsed by current OAuth configuration but has no active forwarding-header behavior. Do not rely on it for client IP detection, rate limiting, or public URL inference. Set `MCP_SERVER_URL` explicitly and configure those controls at the proxy.

The broker retains dynamic client registrations for 30 days, pending sign-ins for 10 minutes, and issued codes for 5 minutes. States and codes are consumed atomically once. Without Redis, these records disappear on restart. Secure Redis access and configure its persistence if records must survive Redis restarts.

Redis does **not** persist live MCP transports or share sessions between replicas. Multiple HTTP replicas still need session affinity for MCP traffic, alongside shared OAuth state. A single replica is the simplest deployment; expect clients to reconnect during restarts.
