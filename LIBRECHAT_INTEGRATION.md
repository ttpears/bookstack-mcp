# LibreChat Integration Guide

This guide provides step-by-step instructions for integrating the BookStack MCP server with LibreChat.

## Prerequisites

- LibreChat instance running with Docker Compose
- BookStack instance with API access
- BookStack API tokens (Token ID and Token Secret)

## Integration Steps

### Step 1: Copy Dockerfile

Download and copy the `Dockerfile.mcp-bookstack` to your LibreChat root directory:

```bash
# Navigate to your LibreChat directory
cd /path/to/your/librechat

# Download the Dockerfile.mcp-bookstack
curl -o Dockerfile.mcp-bookstack https://raw.githubusercontent.com/ttpears/bookstack-mcp/main/Dockerfile.mcp-bookstack
```

The `Dockerfile.mcp-bookstack` is self-contained and handles everything automatically:
- Clones the repository from GitHub
- Installs dependencies and builds the project  
- Configures supergateway to bridge stdio MCP to HTTP/SSE

### Step 2: LibreChat Environment Variables

Add the BookStack configuration to your LibreChat `.env` file:

```bash
# Add to your LibreChat .env file
echo "BOOKSTACK_BASE_URL=https://your-bookstack.com" >> .env
echo "BOOKSTACK_TOKEN_ID=your-token-id" >> .env
echo "BOOKSTACK_TOKEN_SECRET=your-token-secret" >> .env
```

### Step 3: Docker Compose Override

Create or modify your `docker-compose.override.yml` file to include the BookStack MCP service:

```yaml
# docker-compose.override.yml
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

**Important:** The `Dockerfile.mcp-bookstack` is self-contained and:
- Automatically clones the latest version from GitHub
- Uses `supergateway` to bridge stdio MCP to HTTP/SSE  
- Uses the LibreChat network for proper connectivity

### Step 4: LibreChat MCP Configuration

Add the MCP server configuration to your `librechat.yaml`:

```yaml
# librechat.yaml
mcpServers:
  bookstack-mcp:
    type: sse
    url: http://bookstack-mcp:8007/sse
```

### Step 5: Deploy

Restart LibreChat with the new configuration:

```bash
# Stop LibreChat
docker compose down

# Start LibreChat with the new service
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

## Verification

### Check Service Status

```bash
# Verify all services are running
docker compose ps

# Check BookStack MCP logs
docker compose logs -f bookstack-mcp

# Test health endpoint
curl http://localhost:8007/health
```

### Test LibreChat Integration

1. Open LibreChat in your browser
2. Start a new conversation
3. Try using BookStack tools:
   - "Search for documentation about API"
   - "List all available books"
   - "Show me the contents of page 1"

## File Structure

After integration, your LibreChat directory should look like:

```
librechat/
├── Dockerfile.mcp-bookstack   # Downloaded BookStack MCP Dockerfile
├── docker-compose.yml          # LibreChat main compose
├── docker-compose.override.yml # Your overrides including BookStack MCP
├── librechat.yaml             # LibreChat config with MCP servers
├── .env                       # Environment variables (with BookStack config)
└── ...

# The Dockerfile.mcp-bookstack clones and builds everything during Docker build
```

## Troubleshooting

### Service Won't Start

```bash
# Check Docker Compose configuration
docker compose config

# Check for environment variable issues
docker compose exec bookstack-mcp env | grep BOOKSTACK
```

### MCP Connection Issues

```bash
# Test internal network connectivity
docker compose exec api curl http://bookstack-mcp:8007/health

# Check LibreChat logs for MCP errors
docker compose logs api | grep -i mcp
```

### BookStack API Issues

```bash
# Test BookStack API access from container
docker compose exec bookstack-mcp curl -H "Authorization: Token ${BOOKSTACK_TOKEN_ID}:${BOOKSTACK_TOKEN_SECRET}" ${BOOKSTACK_BASE_URL}/api/docs
```

## Maintenance

### Updating the BookStack MCP Server

```bash
# Navigate to the bookstack-mcp directory
cd bookstack-mcp

# Pull latest changes
git pull origin main

# Rebuild and restart the service
docker compose build bookstack-mcp
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d bookstack-mcp
```

### Monitoring

- Check service health regularly: `curl http://localhost:8007/health`
- Monitor logs: `docker compose logs -f bookstack-mcp`
- Verify LibreChat can reach the service: `docker compose exec api curl http://bookstack-mcp:8007/health`

## Security Considerations

- API tokens are passed via environment variables - ensure your `.env` file is properly secured
- The service runs on port 8007 - adjust firewall rules if needed
- Consider implementing additional authentication layers for production deployments
- Regular security updates for both LibreChat and BookStack MCP components