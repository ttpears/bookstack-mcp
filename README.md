# BookStack MCP Server

[![npm version](https://img.shields.io/npm/v/bookstack-mcp)](https://www.npmjs.com/package/bookstack-mcp)
[![npm downloads](https://img.shields.io/npm/dm/bookstack-mcp)](https://www.npmjs.com/package/bookstack-mcp)
[![CI](https://github.com/ttpears/bookstack-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ttpears/bookstack-mcp/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/node/v/bookstack-mcp)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-7DC9D6)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<img src="assets/logo.svg" width="96" align="right" alt="bookstack-mcp"/>

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives AI assistants full access to your [BookStack](https://www.bookstackapp.com) documentation — search, read, create, and manage content.

```bash
npx bookstack-mcp
```

## Features

- 20 read-only tools + 18 write tools for complete BookStack API coverage
- Books, chapters, pages, shelves, attachments, and comments — full CRUD
- Recycle bin support — restore or permanently delete soft-deleted content
- Type-safe input validation with Zod (auto-coerces string/number params for broad client compatibility)
- Embedded URLs and content previews in all responses
- Markdown export fallback for HTML-authored pages, so AI clients always get usable content
- Write operations disabled by default for safety
- Works with Claude Desktop, Claude Code, LibreChat, and any MCP-compatible client
- Stdio and Streamable HTTP transports

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
BOOKSTACK_INSECURE_SKIP_TLS_VERIFY=false        # Optional, default false
```

> **Security warning:** `BOOKSTACK_INSECURE_SKIP_TLS_VERIFY=true` disables TLS certificate verification for outgoing requests to BookStack. Use only for self-signed certs on a trusted LAN — connections become vulnerable to MITM attacks. The server logs a `WARNING` line at startup whenever this is enabled.

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

### Claude Code (CLI)

Add the server with `claude mcp add`. Repeat `--env` for each variable, and put all flags **before** the server name; the `--` separator marks the start of the command Claude Code will spawn:

```bash
claude mcp add bookstack \
  --transport stdio \
  --scope user \
  --env BOOKSTACK_BASE_URL=https://your-bookstack.com \
  --env BOOKSTACK_TOKEN_ID=your-token-id \
  --env BOOKSTACK_TOKEN_SECRET=your-token-secret \
  -- npx -y bookstack-mcp
```

Scope picks where the entry is written:

| Scope | Where it lives | Shared via git | Use it when |
|-------|----------------|----------------|-------------|
| `local` (default) | `~/.claude.json`, scoped to the current project | No | Trying it out in one repo |
| `user` | `~/.claude.json`, available in every project | No | You want bookstack everywhere |
| `project` | `.mcp.json` at the repo root | Yes | The whole team should get it |

The resulting config entry looks like this (in `.mcp.json` for project scope, or `~/.claude.json` otherwise):

```json
{
  "mcpServers": {
    "bookstack": {
      "type": "stdio",
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

> **Tip for committed `.mcp.json`:** Claude Code expands `${VAR}` and `${VAR:-default}` references in `.mcp.json` from the surrounding shell. Use that to keep secrets out of git: set `"BOOKSTACK_TOKEN_SECRET": "${BOOKSTACK_TOKEN_SECRET}"` in the file and have each developer export the variable in their shell.

### Claude Code (plugin marketplace)

This repo also ships a Claude Code plugin manifest (`.claude-plugin/plugin.json`). Add the marketplace and install:

```
/plugin marketplace add ttpears/claude-plugins
/plugin install bookstack-mcp@ttpears-plugins
```

Then set the `BOOKSTACK_*` environment variables in your shell so the plugin's MCP server can authenticate.

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
| `get_comments` / `get_comment` | List or get page comments (BookStack v25.11+) |
| `get_recycle_bin` | List items in the recycle bin |
| `export_page` | Export page as HTML, PDF, Markdown, plaintext, or ZIP |
| `export_book` | Export entire book |
| `export_chapter` | Export chapter |
| `get_recent_changes` | Recently updated content |

### Write Operations (requires `BOOKSTACK_ENABLE_WRITE=true`)

| Tool | Description |
|------|-------------|
| `create_book` / `delete_book` | Create or delete a book |
| `create_chapter` / `delete_chapter` | Create or delete a chapter |
| `create_page` | Create a new page (HTML or Markdown) |
| `update_page` | Update content, rename, or move to a different book/chapter |
| `delete_page` | Delete a page (recoverable from recycle bin) |
| `create_shelf` / `update_shelf` / `delete_shelf` | Manage shelves |
| `create_attachment` / `update_attachment` / `delete_attachment` | Manage attachments |
| `create_comment` / `update_comment` / `delete_comment` | Manage page comments (v25.11+) |
| `restore_deleted` / `permanently_delete` | Restore or permanently destroy items in the recycle bin |

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
