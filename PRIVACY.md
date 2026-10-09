# Privacy policy for bookstack-mcp

Last reviewed: 2026-10-09.

This policy describes the data handling implemented by the open-source
`bookstack-mcp` application in this repository. It applies to the software you
run locally or deploy on a server. A deployment operator, BookStack instance,
MCP client, AI provider, or other service may have additional data practices and
policies. This document does not establish those services' retention periods or
make commitments on their behalf.

The error-handling protections described below were merged in
[PR #47](https://github.com/ttpears/bookstack-mcp/pull/47) at security commit
[`35b218c5e7eca129ab94ad8f8b89275815697e3c`](https://github.com/ttpears/bookstack-mcp/commit/35b218c5e7eca129ab94ad8f8b89275815697e3c).
This policy does not imply that an existing package, image or deployment already
includes those changes. Check the source revision of the version you run.

## Data processed and where it goes

- **BookStack:** The application sends API requests to `BOOKSTACK_BASE_URL`,
  including the configured API token ID and secret in an authorization header.
  Requests can include search queries, identifiers, filters and, when write
  tools are enabled, content, metadata, comments or image uploads. Responses can
  contain private wiki content, attachment or export links, and user information
  such as names and email addresses, subject to BookStack permissions.
- **MCP client:** Tool results and resources are returned to the connected MCP
  client. The client can supply them to an AI provider or retain them in chat
  history or logs under its own settings and policies. Read-only mode prevents
  write tools from being registered; it does not prevent content from reaching
  the client.
- **Image sources:** An enabled image-upload tool can read a caller-specified
  local image file or download an HTTP(S) image, then upload its bytes to
  BookStack. The image host receives the URL request and normal connection
  information. Local file access is enabled in stdio mode; in HTTP mode it
  requires `BOOKSTACK_ALLOW_LOCAL_IMAGE_FILES=true`. HTTP image downloads are
  restricted by `BOOKSTACK_IMAGE_ALLOWED_HOSTS`; stdio mode has no such host
  restriction by default. These operations also require write tools to be
  enabled.
- **Optional Microsoft Entra ID:** With `MCP_OAUTH_ENABLE=true`, the application
  redirects sign-in to the configured Microsoft tenant, exchanges authorization
  codes and refresh tokens with Microsoft, and fetches signing keys to validate
  bearer tokens. The proxy processes client IDs, redirect URIs, OAuth state and
  PKCE values, token responses and token claims. It uses the subject and roles
  to bind HTTP sessions and select configured BookStack credentials. Token
  responses are returned to the requesting MCP client.
- **Optional Redis:** When OAuth is enabled and `REDIS_URL` is configured, OAuth
  broker state is sent to that Redis instance. Its hosting, access controls,
  persistence and backups are controlled by the operator.

The application code has no built-in usage analytics, crash-reporting service,
or automatic reporting of runtime wiki content to the project maintainers. It
does not call an AI model API itself. These statements describe the application
code, not the behavior of your MCP client, infrastructure or third-party
services.

## Local and server deployments

Stdio mode communicates with a client through the process's standard input and
output. The process still makes network requests to the configured BookStack
instance and, when used, remote image sources. HTTP mode accepts MCP requests
over an HTTP listener, which defaults to `127.0.0.1`. Remote hosting introduces
an operator and any configured proxies or infrastructure into the data path.

BookStack credentials are supplied through environment variables or client
configuration. HTTP clients can optionally supply credentials per request when
`BOOKSTACK_ALLOW_REQUEST_CREDENTIALS=true`; those credentials are used in a
request-scoped client rather than stored as HTTP session credentials. OAuth
client secrets and other configuration are also read from the environment.
Credential storage by the launcher, operating system, container platform or
secret manager is outside this application's control.

The HTTP listener does not implement TLS itself. Operators must provide suitable
authentication, HTTPS or a trusted internal connection, host restrictions and
least-privilege BookStack tokens. BookStack certificate verification can be
disabled by configuration; doing so reduces protection for credentials and
content in transit. See [SECURITY.md](./SECURITY.md).

## Memory, broker state and retention

Requests and responses are processed in memory. Book ID-to-slug mappings are
cached in memory, with a ten-minute bulk refresh interval; this is not a
guaranteed deletion deadline for individual cache entries. HTTP transports and,
in OAuth mode, subject/write-role bindings are held in memory. The default HTTP
session idle timeout is thirty minutes and is configurable; session closure,
expiry and process shutdown release the corresponding application state.

OAuth broker state uses process memory unless Redis is configured. The current
broker assigns time-to-live values of thirty days for client registrations,
ten minutes for pending authorization flows, and five minutes for issued codes
and their associated upstream token responses. Pending flows and issued codes
are deleted when consumed. In-memory expiration uses access-time checks and a
periodic sweep; Redis uses per-key expiry. These are application state lifetimes,
not promises about secure memory erasure, provider retention, Redis persistence
or backups.

The application does not implement a persistent wiki-content database or its own
log-file retention system. BookStack, MCP clients, proxies, hosting platforms and
operators may retain content, credentials, access records, logs or backups
independently. Consult those services and the deployment operator for retention
and deletion requests.

## Logs and error responses

Diagnostics are written to standard error. They include the BookStack and public
HTTP URL origins (without URL credentials, paths, queries or fragments), OAuth
tenant, abbreviated HTTP session IDs, session counts, export page IDs and
lengths, rate-limit retries, and authentication diagnostics.

With the security commit identified above, upstream BookStack and image-source
failures are converted to application-authored context, numeric HTTP status and
allowlisted error codes. These errors omit upstream bodies, headers, arbitrary
messages and nested causes. MCP tool handlers preserve explicitly marked local
validation messages; startup and HTTP error logs omit complete exception
objects. OAuth failure logs and responses use numeric status and allowlisted
OAuth codes rather than upstream bodies or descriptions; callback diagnostics
omit callback values and client IDs. Successful OAuth token responses and
normal tool results still carry their intended data to the requesting client.

**Earlier versions can expose sensitive data in errors.** Builds that do not
include the identified security commit can log upstream response excerpts,
descriptions, client IDs or full exception objects, and return upstream error
details to MCP clients. Library exceptions can contain credentials, request
headers, URLs or private response data.

These application protections do not guarantee that all logs are free of
credentials or private content. MCP clients, proxies, hosting platforms and
other infrastructure can collect their own logs. Operators should restrict log
access, configure collection and retention, and review and redact sensitive
material before sharing logs or error reports.

## Third-party services and project interactions

Installing packages or images involves the registries and distribution services
you choose. Viewing this repository, its badges, or linked documentation involves
GitHub, Shields.io, HOL or other linked services. The HOL CI workflow scans the
repository on a GitHub runner with online analysis, SARIF upload, submissions and
PR comments disabled; it downloads the scanner and dependencies during setup.
That workflow does not run as part of the installed MCP server.

Information you choose to submit through GitHub issues, pull requests or other
project channels is handled by those services. Do not include tokens or private
wiki content in public submissions. For a suspected vulnerability or sensitive
disclosure, follow [SECURITY.md](./SECURITY.md). For a question about this
software's data handling, use the existing
[project issue tracker](https://github.com/ttpears/bookstack-mcp/issues) without
including sensitive information. For a particular hosted deployment, contact
its operator rather than assuming the repository maintainer operates it.

## Operator responsibilities and changes

Operators choose the BookStack instance, credentials, permitted clients, write
access, image sources, OAuth tenant, optional Redis, network controls and log
handling. They should inform their users of deployment-specific processing and
third-party services, provide their own applicable policies and contact channel,
and handle access or deletion requests for systems they control.

This policy is versioned with the repository and may change when the
implementation changes. Review the policy and configuration for the version you
actually run.
