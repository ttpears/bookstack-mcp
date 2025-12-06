# BookStack MCP Server

A Model Context Protocol (MCP) server for BookStack, providing AI assistants with access to your BookStack wiki content.

## Features

- **Full BookStack API Integration**: Search, read, create, and update content
- **Embedded URLs**: All responses include clickable links to BookStack pages
- **Dual Transport**: SSE (HTTP) and stdio transports
- **LibreChat Compatible**: Docker integration ready
- **TypeScript**: Full type safety

## Quick Start

### Docker (Recommended)

```bash
docker run -p 3000:3000 \
  -e BOOKSTACK_BASE_URL=https://your-bookstack.com \
  -e BOOKSTACK_TOKEN_ID=your-token-id \
  -e BOOKSTACK_TOKEN_SECRET=your-token-secret \
  ghcr.io/codyssey-ltd/bookstack-mcp:latest
```

### Claude Desktop (stdio)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bookstack": {
      "command": "npx",
      "args": ["-y", "@codyssey/bookstack-mcp", "--stdio"],
      "env": {
        "BOOKSTACK_BASE_URL": "https://your-bookstack.com",
        "BOOKSTACK_TOKEN_ID": "your-token-id",
        "BOOKSTACK_TOKEN_SECRET": "your-token-secret"
      }
    }
  }
}
```

## Available Tools

### Read Operations (Always Available)

| Tool | Description |
|------|-------------|
| `get_capabilities` | Show server capabilities and available tools |
| `search_content` | Advanced search with filtering and pagination |
| `search_pages` | Search pages with optional book filtering |
| `get_recent_changes` | Recently updated content with previews |
| `get_books` / `get_book` | List/get books with filtering and sorting |
| `get_pages` / `get_page` | List/get pages with filtering |
| `get_chapters` / `get_chapter` | List/get chapters |
| `get_shelves` / `get_shelf` | List/get book shelves |
| `get_attachments` / `get_attachment` | List/get attachments |
| `export_page` / `export_book` / `export_chapter` | Export in HTML, PDF, Markdown, or plain text |

### Write Operations (Requires `BOOKSTACK_ENABLE_WRITE=true`)

| Tool | Description |
|------|-------------|
| `create_page` / `update_page` | Create/update pages |
| `create_shelf` / `update_shelf` / `delete_shelf` | Manage shelves |
| `create_attachment` / `update_attachment` / `delete_attachment` | Manage attachments |

> **Security**: Write operations are disabled by default.

## Configuration

### Environment Variables

```env
# Required
BOOKSTACK_BASE_URL=https://your-bookstack.com
BOOKSTACK_TOKEN_ID=your-token-id
BOOKSTACK_TOKEN_SECRET=your-token-secret

# Optional
PORT=3000                      # Server port (default: 3000)
BOOKSTACK_ENABLE_WRITE=false   # Enable write operations (default: false)
```

### BookStack API Setup

1. Log into BookStack as admin
2. Go to **Settings → Users → Edit your user**
3. Ensure "Access System API" permission is enabled
4. Navigate to **API Tokens** section
5. Create a new token and copy the ID and Secret

## Transport Modes

### SSE Mode (Default)

HTTP server with Server-Sent Events for MCP communication. Use for Docker deployments and LibreChat integration.

```bash
# Endpoints
GET  /health   # Health check
GET  /sse      # Establish SSE session
POST /message  # Send MCP messages
```

### Stdio Mode

Standard input/output for local CLI usage.

```bash
node build/index.js --stdio
```

## Docker Deployment

### Standalone

```bash
git clone https://github.com/codyssey-ltd/bookstack-mcp.git
cd bookstack-mcp
cp .env.example .env
# Edit .env with your configuration
docker compose up -d
```

### LibreChat Integration

See [docs/librechat-integration.md](docs/librechat-integration.md) for detailed setup instructions.

## Development

```bash
# Install dependencies
npm install

# Development with hot reload
npm run dev

# Build
npm run build

# Type check
npm run type-check

# Run tests
npm test
```

### Project Structure

```
src/
├── bookstack-client.ts   # BookStack API client
├── bookstack-tools.ts    # MCP tools implementation
├── sse-transport.ts      # SSE server transport
├── stdio.ts              # Stdio transport
└── index.ts              # Main entry point
```

## Troubleshooting

### Connection Refused

- Verify `BOOKSTACK_BASE_URL` is accessible from the container
- For local BookStack, use `host.docker.internal` instead of `localhost`

### Authentication Failed

- Double-check token ID and secret
- Ensure the user has "Access System API" permission

### Write Operations Failing

- Set `BOOKSTACK_ENABLE_WRITE=true`
- Verify the API user has write permissions in BookStack

### Empty Search Results

- BookStack's search index may need rebuilding: `php artisan bookstack:regenerate-search`

## Documentation

- [SSE Transport Protocol](docs/sse-transport.md) - Detailed SSE implementation docs
- [LibreChat Integration](docs/librechat-integration.md) - Step-by-step LibreChat setup

## License

MIT License - see [LICENSE](LICENSE) for details.
