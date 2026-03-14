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

### LibreChat

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

Restart LibreChat after config changes.

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
