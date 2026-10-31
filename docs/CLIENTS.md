# Client configuration

[Documentation index](README.md) · [Configuration](CONFIGURATION.md) · [Troubleshooting](TROUBLESHOOTING.md)

First create a BookStack API token with the permissions described in the [quick start](../README.md#1-create-a-bookstack-api-token). All local npm configurations need Node.js on the client's executable path. Choose a supported LTS release, preferably Node 24.

Local stdio starts one server process per client configuration. Remote Streamable HTTP connects to a separately deployed service. Adding a client entry alone does not deploy that service.

## Claude Desktop

### MCPB extension

1. Download `bookstack-mcp-<version>.mcpb` from a [GitHub release](https://github.com/ttpears/bookstack-mcp/releases/latest).
2. Open **Settings → Extensions** and install the downloaded bundle.
3. Enter **BookStack URL**, **API Token ID**, and **API Token Secret**. The bundle marks the token settings as sensitive for keychain storage.
4. Leave **Enable Write Operations** and **Skip TLS Verification** as `false` initially.
5. Reconnect and ask the assistant to list accessible books.

The bundle includes the server and production dependencies. Its settings are separate from environment variables configured for a manual npm installation. To upgrade, install the bundle from the desired release and recheck its settings.

### Manual stdio

Add the [README JSON configuration](../README.md#3-configure-a-local-mcp-client) to Claude Desktop's MCP configuration. Use the app's configuration editor rather than guessing a path for your OS. GUI apps may not inherit your interactive shell's environment or `PATH`; put credentials in the client's private `env` configuration and provide an absolute `npx` path if needed.

## Claude Code

### Marketplace

Export the three required `BOOKSTACK_*` variables in the environment that starts Claude Code. Then run these commands inside Claude Code:

```text
/plugin marketplace add ttpears/claude-plugins
/plugin install bookstack-mcp@ttpears
```

The plugin manifest starts `npx -y bookstack-mcp@5.7.1` and inherits the process environment. Its package version is pinned to the matching release. Restart Claude Code after changing it. Do not register a second manual copy under another name unless you intentionally want two connections.

### Direct MCP registration

With the required variables already exported, register a user-scoped server:

```bash
claude mcp add --transport stdio --scope user bookstack -- npx -y bookstack-mcp@5.7.1
```

The server inherits the environment when Claude Code launches it, so keep those variables available in future sessions. For fixed private settings, use the client's environment configuration; avoid putting real secrets into commands that shell history records.

| Scope | Configuration location | Use |
|---|---|---|
| `local` (default) | User configuration, scoped to the current project | Try it in one project |
| `user` | User configuration, available across projects | Personal BookStack connection |
| `project` | Repository `.mcp.json` | Share connection structure with a team |

For project scope, keep secrets outside the repository. Claude Code supports environment expansion in `.mcp.json`, for example `"BOOKSTACK_TOKEN_SECRET": "${BOOKSTACK_TOKEN_SECRET}"`. This expansion is client-specific; do not assume every MCP client supports it.

## Codex

The repository provides a native manifest at [`.codex-plugin/plugin.json`](../.codex-plugin/plugin.json), referencing [`.mcp.json`](../.mcp.json). If your Codex installation supports native plugins, add/enable this repository through its plugin installation flow. Set the required BookStack environment variables in the environment that launches Codex before enabling the server. Available plugin installation controls vary by Codex version.

For Codex CLI, direct MCP registration is also available:

```bash
codex mcp add bookstack -- npx -y bookstack-mcp@5.7.1
```

As with the native plugin, future Codex launches need the exported variables. Writes stay disabled unless explicitly enabled. Use either the native plugin or direct registration to avoid duplicate tool entries.

## Cursor

The repository provides [`.cursor-plugin/plugin.json`](../.cursor-plugin/plugin.json), referencing the same pinned stdio configuration as Codex. In a Cursor version supporting repository plugins, use its plugin installation flow and configure the required BookStack environment variables in the environment launching Cursor. This manifest does not imply acceptance into the Cursor Marketplace.

For manual MCP setup, use the [README JSON configuration](../README.md#3-configure-a-local-mcp-client) in Cursor's private MCP settings. GUI launches may not inherit shell exports; the manual `env` configuration makes the required values explicit. Keep it outside version control. Use either the plugin or manual connection to avoid duplicate tools. See [Cursor's plugin reference](https://cursor.com/docs/reference/plugins) for version-specific installation behavior.

## Gemini CLI

The repository includes [gemini-extension.json](../gemini-extension.json) and [GEMINI.md](../GEMINI.md). In a Gemini CLI version supporting Git-based extensions:

```bash
gemini extensions install https://github.com/ttpears/bookstack-mcp
```

Review the installation prompt and fill in the extension's BookStack URL, Token ID, and Token Secret settings. The manifest marks token settings as sensitive. Leave write access and certificate bypass disabled initially. If your CLI does not offer extension settings, supply the required environment variables before launching it. The extension starts the npm package via `npx`; it does not run TypeScript directly from the checkout.

## LibreChat

### Local stdio

Add this to a private `librechat.yaml`, using your deployment's secret handling for the values:

```yaml
mcpServers:
  bookstack:
    command: npx
    args: ["-y", "bookstack-mcp@5.7.1"]
    env:
      BOOKSTACK_BASE_URL: "https://wiki.example.com"
      BOOKSTACK_TOKEN_ID: "your-token-id"
      BOOKSTACK_TOKEN_SECRET: "your-token-secret"
```

The LibreChat runtime needs Node/npm and network access to BookStack. A container's `localhost` refers to that container, so use a reachable BookStack hostname.

### Streamable HTTP

Deploy the [internal HTTP service](SETUP.md#internal-http-service), then configure:

```yaml
mcpServers:
  bookstack:
    type: streamable-http
    url: http://bookstack-mcp:8080/mcp
```

Both services must share a network where `bookstack-mcp` resolves. Restart LibreChat after configuration changes. For an external service, use HTTPS and the appropriate client authentication support.

### Per-user BookStack credentials

This requires `BOOKSTACK_ALLOW_REQUEST_CREDENTIALS=true` on the HTTP server and a LibreChat version supporting `customUserVars`:

```yaml
mcpServers:
  bookstack:
    type: streamable-http
    url: http://bookstack-mcp:8080/mcp
    headers:
      X-Bookstack-Token-Id: "{{BOOKSTACK_TOKEN_ID}}"
      X-Bookstack-Token-Secret: "{{BOOKSTACK_TOKEN_SECRET}}"
    customUserVars:
      BOOKSTACK_TOKEN_ID:
        title: "BookStack token ID"
      BOOKSTACK_TOKEN_SECRET:
        title: "BookStack token secret"
```

Supply both values in the client's user-variable UI. Test as two users with different BookStack permissions before relying on isolation. Missing both headers falls back to the environment account; a partial pair returns 400. Keep that fallback account limited, and redact these headers in proxies. OAuth and write-tool gates still apply. See the [credential matrix](CONFIGURATION.md#credentials-and-permissions).

## Remote Claude connector

Follow the [HTTPS/Entra runbook](SETUP.md#public-connector-with-entra-oauth), then add `https://mcp.example.com/mcp` in Claude's custom connector settings. The connector discovers OAuth metadata and sends the user to Microsoft sign-in. Do not paste server-side Entra secrets or BookStack service-account tokens into a chat.

## Verify any client

1. Check the client lists BookStack tools. Read-only mode has 21; writes add 22.
2. Call `get_books` with `{"count": 5}` to verify the real API connection. An HTTP `/health` response alone does not do this.
3. Search for a known visible page and read it with `get_page`; confirm the returned URL and content.
4. If enabling writes, test on disposable content and read it back. Confirm a read-only account cannot change content.

Current HTTP transport is Streamable HTTP at `/mcp`. Legacy `/sse` and `/messages` endpoints were removed in 3.0. Update old client configurations rather than treating `MCP_TRANSPORT=sse` as the old protocol. See [troubleshooting](TROUBLESHOOTING.md) for startup, PATH, authorization, and session errors.
