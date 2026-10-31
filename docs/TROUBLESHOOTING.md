# Troubleshooting

[Documentation index](README.md) · [Configuration](CONFIGURATION.md) · [Deployment](SETUP.md)

Identify the failing layer: startup → MCP transport → caller authentication → BookStack API → individual tool. HTTP health checks prove process liveness. A successful `get_books` call checks the MCP-to-BookStack path.

## Startup and local clients

| Symptom | Check and resolution |
|---|---|
| Missing required environment variable | Supply the URL **and both** BookStack token values to the process. A `.env` file alone is not loaded; use client `env`, exports, or explicit `node --env-file=.env …` |
| Server appears to hang in a terminal | Stdio waits for an MCP client. Configure a client to launch it; HTTP mode requires `MCP_TRANSPORT=http` |
| `npx` / `node` not found in a desktop app | GUI apps may have a different `PATH`. Use an absolute executable path or the MCPB extension, then restart |
| Config changes do nothing / duplicate tools | Check for separate plugin, extension, and manual MCP registrations. Restart the intended connection and remove duplicates |
| Tests cannot find `src/**/*.test.ts` | Use Node 22 or 24; test-file glob support requires Node 21+. The package runtime minimum does not cover the test command |
| TLS certificate error | Check hostname/chain and install the issuing CA into the runtime's trust store. For Node, consider `NODE_EXTRA_CA_CERTS` before process startup. Keep certificate verification enabled |

## BookStack API and content

| Symptom | Check and resolution |
|---|---|
| API 401 | Confirm the base URL, separate Token ID/Secret, expiry/revocation, and intended account |
| API 403 | Check **Access System API**, entity visibility, and the operation's permission. A visible MCP tool can still be denied by BookStack |
| Missing books/pages | Check the effective token account's visibility. Entra readers/writers normally use shared accounts, not personal BookStack identities |
| WYSIWYG page empty / Markdown fallback fails | Grant **Export Content**. Compare `get_page` with `format: "raw"` to distinguish source access from export access |
| User lookup / recycle-bin access denied | These need administrative permissions; ordinary reading does not. Avoid elevating the general reading account just to make every tool succeed |
| Numeric author filter rejected | Use a user slug or `me` in `{created_by:…}`, `{updated_by:…}`, `{owned_by:…}`. Resolve via `find_users` if permitted |
| Content cut off | Follow `content_next_offset` using the same format until `null`. Search/list previews are not complete source |
| Attributes/includes lost after editing | Use `format: "raw"` for WYSIWYG source, not rendered `html`. Recover original source from page history if necessary |
| Markdown source disappeared | Saving `html` clears Markdown. Restore from history and edit Markdown pages via `markdown` |
| Tags disappeared | Supplying `tags` replaces the full list. Read existing tags first; omit the field to preserve them |
| Changelog / comments unavailable | Revision `changelog` requires BookStack v26.09+ (older versions ignore it); comment endpoints need v25.11+ |
| PDF/ZIP download asks for login | It is a BookStack web-export URL, not a local file or token-bearing download. Authenticate in the browser |
| 429 / `BOOKSTACK_RATE_LIMITED` | Reduce parallel work and check other clients sharing the token. Default concurrency is four per base URL/process. The 60-second API budget includes queue/backoff; extending it does not raise the wiki's rate limit |

## HTTP and containers

| Symptom | Check and resolution |
|---|---|
| Connection refused | Check service state, network/DNS, port, and bind address. Node defaults to loopback; a reachable container needs `MCP_HTTP_HOST=0.0.0.0`. A client's `localhost` is its own machine/container |
| HTTP 421 host not allowed | Add the actual client/proxy hostname to `MCP_HTTP_ALLOWED_HOSTS`, without scheme or port. Keep explicit validation enabled |
| Container unhealthy but remote calls work | Allow `localhost` for the built-in check. If changing port 8080, update the healthcheck command too |
| `/health` works but tools fail | Health does not validate BookStack credentials. Call `get_books`; inspect API permissions and reachability |
| Session 404 after restart, idle time, or role change | Initialize a new session. Do not repeatedly replay a stale session ID |
| Intermittent session 404 behind a load balancer | Configure session affinity or use one replica. Redis shares broker records, not live MCP transports |
| Credential header 400 | With request credentials enabled, send both `X-Bookstack-Token-Id` and `X-Bookstack-Token-Secret`; check empty/unresolved client variables |
| Missing credential headers still allow reads | This is the environment-token fallback. Limit that account's visibility; overrides do not make missing credentials fail closed |
| HTTP 413 | MCP body exceeds 10 MiB by default, OAuth body exceeds the fixed 64 KiB, or the proxy has a smaller limit. Reduce the request or adjust only the applicable limit |
| HTTP 408 | Body did not finish within 30 seconds; check client/network/proxy behavior |
| HTTP 400 parse error | Send valid JSON. The server deliberately does not echo malformed content |
| HTTP 503 creating a session | Session cap reached. Close unused clients, investigate bursts/leaks, and review TTL/cap before raising them |
| Streams disconnect only through proxy | Preserve MCP headers/methods, avoid response buffering, and allow sufficient request/stream lifetime |
| `/sse` / `/messages` 404 | Switch to Streamable HTTP at `/mcp`; the legacy transport was removed |

Session IDs, bearer tokens, and paired BookStack headers are sensitive. Do not copy them from client/proxy logs into an issue.

## OAuth and authorization

- **Wrong discovery origin:** set `MCP_SERVER_URL` to the external HTTPS origin and route the whole origin. `MCP_TRUST_PROXY` does not infer or repair it.
- **Callback fails:** compare the exact public origin plus `/callback` with Entra's Web redirect URI. Confirm the client secret is its **value** and has not expired; check tenant assignment and consent.
- **401 / audience mismatch:** verify tenant, resource audience, scopes, and v2 token configuration. The validator accepts the configured audience, client ID, or `api://<client-id>`. Inspect claims privately; do not paste tokens into public decoders or issues.
- **403 on an existing session:** the token's subject does not own that session. Reconnect under the intended account rather than sharing session IDs.
- **Writer has no write tools:** match `OAUTH_WRITE_ROLE`, configure both write-token values, and refresh/reconnect after assignment changes. Startup warns if the pair is missing. `BOOKSTACK_ENABLE_WRITE` is not the OAuth write switch.
- **Role changed but access looks unchanged:** claims in an issued token can remain valid until refresh/expiry. When the presented token's write-role state changes, the old session returns 404 and must reinitialize.
- **Sign-in lost on restart:** use Redis for broker-state persistence if required. Live sessions still need reinitialization. With memory-only state, a stale client registration may require reconnecting/recreating the connector.

Repeat the [reader/writer verification](SETUP.md#verify-before-admitting-users) after fixing authentication. An administrator's successful login alone is insufficient.

## Images

For HTTP URL uploads, allow the **source hostname** in `BOOKSTACK_IMAGE_ALLOWED_HOSTS`, including every redirect destination. Do not supply full URLs, paths, or wildcard assumptions. Downloads never receive the BookStack token, so sources requiring it will not work automatically.

HTTP local files are disabled by default. If enabled, the absolute path must exist and be readable by the server user **inside the server/container**. Prefer a deliberately mounted directory to broad filesystem exposure. Supply exactly one source and an existing `uploaded_to` page ID. Check type and size (maximum 50 MiB; BookStack may impose less).

## Releases and HOL

If a tag exists but npm/images are unchanged, check protected-environment approval and each publishing job. Use [release recovery](RELEASING.md#when-a-release-stalls); do not publish locally or remove the gate.

A green HOL workflow establishes the scan result, not registry delivery. Check **Report summary to HOL and verify receipt** and its job summary. A HOL 403 is a reporting authorization failure; ownership verification and CI report authorization are separate. Retry after checking configuration or a temporary service failure; do not add long-lived credentials to hide it. See [HOL setup](HOL.md).

## Ask for help safely

For a [GitHub issue](https://github.com/ttpears/bookstack-mcp/issues), include package/image version, Node version if applicable, client/version, transport, failing tool or HTTP status, expected behavior, and a minimal redacted reproduction. Include setting **names** and harmless values; exclude tokens, session IDs, client secrets, private URLs/content, and populated environment files. Use [private reporting](../SECURITY.md#reporting-a-vulnerability) for vulnerabilities.
