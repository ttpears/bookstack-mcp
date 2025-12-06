# LibreChat Integration

This guide provides step-by-step instructions for integrating the BookStack MCP server with LibreChat.

## Prerequisites

- LibreChat instance running with Docker Compose
- BookStack instance with API access
- BookStack API tokens (Token ID and Token Secret)

## Quick Start

### 1. Add Environment Variables

Add to your LibreChat `.env` file:

```env
BOOKSTACK_BASE_URL=https://your-bookstack.com
BOOKSTACK_TOKEN_ID=your-token-id
BOOKSTACK_TOKEN_SECRET=your-token-secret
BOOKSTACK_ENABLE_WRITE=false
```

> **Security Note**: Keep `BOOKSTACK_ENABLE_WRITE=false` unless you trust the AI with write access.

### 2. Add Docker Service

Add to your `docker-compose.override.yml`:

```yaml
services:
  bookstack-mcp:
    image: ghcr.io/codyssey-ltd/bookstack-mcp:latest
    env_file:
      - .env
    ports:
      - "3000:3000"
    networks:
      - librechat
    restart: unless-stopped
```

### 3. Configure LibreChat

Add to your `librechat.yaml`:

```yaml
mcpServers:
  bookstack-mcp:
    type: sse
    url: http://bookstack-mcp:3000/sse
```

### 4. Deploy

```bash
docker compose down
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

## Verification

```bash
# Check service status
docker compose ps bookstack-mcp

# Test health endpoint
curl http://localhost:3000/health

# View logs
docker compose logs -f bookstack-mcp
```

## Usage Examples

Once configured, use BookStack tools in LibreChat:

```text
"Search for pages about API authentication"
"List all books sorted by last updated"
"Show me the contents of page 42"
"Export the Installation Guide as markdown"
```

## Troubleshooting

### Service Won't Start

```bash
# Verify environment variables
grep BOOKSTACK .env

# Check logs
docker compose logs bookstack-mcp
```

### Connection Issues

```bash
# Test internal connectivity
docker compose exec api curl http://bookstack-mcp:3000/health
```

### BookStack API Errors

Verify API access:

1. Check token permissions in BookStack admin
2. Ensure the BookStack URL is accessible from the container
3. Test with: `docker compose exec bookstack-mcp env | grep BOOKSTACK`

## Alternative: Self-Build Integration

If you need to customize the build, use `Dockerfile.mcp-bookstack`:

```yaml
services:
  bookstack-mcp:
    build:
      context: .
      dockerfile: Dockerfile.mcp-bookstack
    env_file:
      - .env
    ports:
      - "8007:8007"
    networks:
      - librechat
    restart: unless-stopped
```

## Updating

```bash
docker compose pull bookstack-mcp
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d bookstack-mcp
```
