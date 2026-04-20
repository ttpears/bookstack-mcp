# BookStack MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives AI assistants full access to your [BookStack](https://www.bookstackapp.com) documentation — search, read, create, and manage content.

## Features

- 17 read-only tools + 8 write tools for complete BookStack API coverage
- Type-safe input validation with Zod (auto-coerces string/number params for broad client compatibility)
- Embedded URLs and content previews in all responses
- Write operations disabled by default for safety
- Works with Claude Desktop, LibreChat, and any MCP-compatible client

## Quick Start

### Install from npm

```bash
npx bookstack-mcp
```

### Or clone and build

```bash
git clone https://github.com/ttpears/bookstack-mcp.git
cd bookstack-mcp
npm install && npm run build
npm start
```

### Environment Variables

```env
BOOKSTACK_BASE_URL=https://your-bookstack.com   # Required
BOOKSTACK_TOKEN_ID=your-token-id                # Required
BOOKSTACK_TOKEN_SECRET=your-token-secret        # Required
BOOKSTACK_ENABLE_WRITE=false                    # Optional, default false
```

## Client Configuration

### Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "bookstack": {
      "command": "npx",
      "args": ["-y", "bookstack-mcp"],
      "env": {
        "BOOKSTACK_BASE_URL": "https://your-bookstack.com",
        "BOOKSTACK_TOKEN_ID": "your-token-id",
        "BOOKSTACK_TOKEN_SECRET": "your-token-secret"
      }
    }
  }
}
```

### LibreChat (stdio, single-user)

Add to your `librechat.yaml`:

```yaml
mcpServers:
  bookstack:
    command: npx
    args:
      - -y
      - bookstack-mcp
    env:
      BOOKSTACK_BASE_URL: "https://your-bookstack.com"
      BOOKSTACK_TOKEN_ID: "your-token-id"
      BOOKSTACK_TOKEN_SECRET: "your-token-secret"
```

### LibreChat (Streamable HTTP, recommended for production / Docker)

Run the server as a long-lived HTTP service and point LibreChat at the URL. This is the right setup for multi-user or containerized deployments.

Start the server in HTTP mode:

```bash
MCP_TRANSPORT=http \
MCP_HTTP_PORT=8080 \
BOOKSTACK_BASE_URL=https://your-bookstack.com \
BOOKSTACK_TOKEN_ID=your-token-id \
BOOKSTACK_TOKEN_SECRET=your-token-secret \
npx bookstack-mcp
```

Then configure LibreChat:

```yaml
mcpServers:
  bookstack:
    type: streamable-http
    url: http://bookstack-mcp:8080/mcp
```

> **3.0.0 breaking change:** the deprecated HTTP+SSE transport (`GET /sse` + `POST /messages`) has been removed. Streamable HTTP at `/mcp` already speaks SSE for streaming responses, and is the only HTTP transport in current MCP clients. If you're on an older client that needs the legacy endpoints, pin to `bookstack-mcp@2.x`.

#### HTTP transport environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT` | `stdio` | Set to `http` to enable the HTTP server |
| `MCP_HTTP_PORT` | `8080` | Port to listen on |
| `MCP_HTTP_HOST` | `127.0.0.1` | Bind address. Loopback by default for safety |
| `MCP_HTTP_ALLOWED_HOSTS` | *(loopback only)* | Comma-separated allowlist of `Host` header hostnames for DNS rebinding protection. Required when binding to a non-loopback address |
| `MCP_HTTP_PATH` | `/mcp` | Streamable HTTP endpoint |

When binding to `0.0.0.0` (e.g. inside a container reachable from other services), set `MCP_HTTP_ALLOWED_HOSTS` to the hostnames LibreChat will use to reach this server, e.g. `MCP_HTTP_ALLOWED_HOSTS=bookstack-mcp,bookstack-mcp.internal`.

Restart LibreChat after config changes.

### Claude Code (plugin marketplace)

This repo ships a Claude Code plugin manifest (`.claude-plugin/plugin.json`). Add the marketplace and install:

```
/plugin marketplace add ttpears/claude-plugins
/plugin install bookstack-mcp@ttpears-plugins
```

Then set the `BOOKSTACK_*` environment variables in your shell so the plugin's MCP server can authenticate.

### Gemini CLI

This repo ships a `gemini-extension.json` manifest. You can install it directly from GitHub using the Gemini CLI:

```bash
gemini extensions install https://github.com/ttpears/bookstack-mcp
```

During installation, the CLI will prompt you to save your `BOOKSTACK_BASE_URL` and API tokens.

## MCP Resources

Books and pages are also exposed as MCP resources, so clients that browse resources (Claude Desktop, MCP Inspector, etc.) can `@`-mention them directly:

| URI template | Description |
|--------------|-------------|
| `bookstack://book/{id}` | A book, returned as JSON metadata |
| `bookstack://page/{id}` | A page, returned as markdown plus a JSON metadata blob |

Both templates support `id` autocompletion: as you type, the server searches BookStack and returns matching IDs so you don't have to remember numeric IDs by hand.

## Available Tools

### Read Operations (always available)

| Tool | Description |
|------|-------------|
| `get_capabilities` | Server capabilities and configuration |
| `search_content` | Search across all content with filtering |
| `search_pages` | Search pages with optional book filtering |
| `get_books` / `get_book` | List or get details of books |
| `get_pages` / `get_page` | List or get full page content |
| `get_chapters` / `get_chapter` | List or get chapter details |
| `get_shelves` / `get_shelf` | List or get shelf details |
| `get_attachments` / `get_attachment` | List or get attachment details |
| `export_page` | Export page as HTML, PDF, Markdown, plaintext, or ZIP |
| `export_book` | Export entire book |
| `export_chapter` | Export chapter |
| `get_recent_changes` | Recently updated content |

### Write Operations (requires `BOOKSTACK_ENABLE_WRITE=true`)

| Tool | Description |
|------|-------------|
| `create_page` / `update_page` | Create or update pages |
| `create_shelf` / `update_shelf` / `delete_shelf` | Manage shelves |
| `create_attachment` / `update_attachment` / `delete_attachment` | Manage attachments |

## BookStack API Setup

1. Log into BookStack as an admin
2. Go to **Settings > Users > Edit your user**
3. Ensure the user has **Access System API** permission
4. In the **API Tokens** section, create a new token
5. Copy the Token ID and Token Secret

## Security

- Write operations are **disabled by default**
- Use HTTPS for production instances
- Store API tokens securely (never commit to git)
- Consider a dedicated BookStack user with limited permissions

## Development

```bash
npm run dev          # Hot reload with tsx
npm run type-check   # Type checking only
npm run build        # Production build
```

## License

MIT
