# BookStack MCP Server

A Model Context Protocol (MCP) server for BookStack with Server-Sent Events (SSE) support, designed for integration with LibreChat.

## Features

- **Full BookStack API Integration**: Search, read, create, and update content
- **Dual Transport Support**: Both SSE and stdio transports available
- **LibreChat Compatible**: Self-contained Docker integration with supergateway
- **Comprehensive Tools**: 10 different tools for BookStack operations
- **Authentication**: Secure API token-based authentication
- **TypeScript**: Full type safety and modern development experience

## Architecture

This server provides two different transport methods:

1. **SSE Transport (`src/index.ts`)**: Direct HTTP/SSE server for standalone deployment
2. **Stdio Transport (`src/stdio.ts`)**: MCP stdio server for use with supergateway in LibreChat

The LibreChat integration uses the stdio version with supergateway to bridge to HTTP/SSE automatically.

## Available Tools

### Read Operations (Always Available)
1. **search_content** - Advanced search with filtering, pagination, and BookStack search syntax
2. **search_pages** - Search specifically for pages with optional book filtering  
3. **get_books** - List books with advanced filtering, sorting, and pagination
4. **get_book** - Get detailed information about a specific book
5. **get_pages** - List pages with filtering by book, chapter, custom criteria, and sorting
6. **get_page** - Get full content of a specific page
7. **get_chapters** - List chapters with advanced filtering options
8. **get_chapter** - Get details of a specific chapter
9. **export_page** - Export pages in various formats (HTML, PDF, Markdown, Plain text)

### Write Operations (Requires BOOKSTACK_ENABLE_WRITE=true)
10. **create_page** - Create new pages in BookStack
11. **update_page** - Update existing pages

**Security Note:** Write operations are disabled by default. Set `BOOKSTACK_ENABLE_WRITE=true` to enable page creation and updates.

## Installation

This server supports two deployment methods:

### Option 1: Standalone Deployment

#### Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/ttpears/bookstack-mcp.git
cd bookstack-mcp

# Copy environment configuration
cp .env.example .env
# Edit .env with your BookStack configuration

# Build and run with Docker Compose
docker compose up -d
```

#### Manual Installation

```bash
# Clone the repository
git clone https://github.com/ttpears/bookstack-mcp.git
cd bookstack-mcp

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
```

### Option 2: LibreChat Integration

This method requires the `Dockerfile.mcp-bookstack` file in your LibreChat directory:

```bash
# 1. Copy Dockerfile.mcp-bookstack to your LibreChat root directory
# Download from: https://github.com/ttpears/bookstack-mcp/blob/main/Dockerfile.mcp-bookstack

# 2. Add environment variables to your LibreChat .env file (REQUIRED)
echo "BOOKSTACK_BASE_URL=https://your-bookstack.com" >> .env
echo "BOOKSTACK_TOKEN_ID=your-token-id" >> .env
echo "BOOKSTACK_TOKEN_SECRET=your-token-secret" >> .env

# 3. Update docker-compose.override.yml with the service configuration
# 4. Add MCP configuration to your librechat.yaml
# 5. Restart LibreChat
docker compose down && docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

**Important:** The `Dockerfile.mcp-bookstack` is self-contained and automatically clones the repository, builds the project, and configures supergateway during the Docker build process.

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Required: BookStack Configuration
BOOKSTACK_BASE_URL=https://your-bookstack.com
BOOKSTACK_TOKEN_ID=your-token-id
BOOKSTACK_TOKEN_SECRET=your-token-secret

# Optional: Server Configuration
PORT=8007

# Optional: Security Configuration
BOOKSTACK_ENABLE_WRITE=false  # Set to 'true' to enable write operations
```

**Important Security Notes:**
- Write operations (create/update pages) are **disabled by default**
- Only enable writes if you fully trust the AI system with your BookStack content
- Consider using a dedicated BookStack user with limited permissions for API access

### BookStack API Setup

1. Log into your BookStack instance as an admin
2. Go to Settings → Users → Edit your user
3. Ensure the user has "Access System API" permission
4. Navigate to the "API Tokens" section
5. Create a new API token with a descriptive name
6. Copy the Token ID and Token Secret to your `.env` file

### Configuration

#### Standalone Configuration

For standalone deployment, add the following to your LibreChat `librechat.yaml`:

```yaml
mcpServers:
  bookstack-mcp:
    url: http://localhost:8007/sse
    timeout: 60000
```

#### LibreChat Integration Configuration

For LibreChat integration, add the following to your `librechat.yaml`:

```yaml
mcpServers:
  bookstack-mcp:
    type: sse
    url: http://bookstack-mcp:8007/sse
```

#### LibreChat docker-compose.override.yml

Add this service to your LibreChat `docker-compose.override.yml`:

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

**Note:** The LibreChat integration uses `Dockerfile.mcp-bookstack` which:
- Clones the repository directly (self-contained)
- Uses `supergateway` to bridge the stdio MCP server to HTTP/SSE
- Automatically handles the SSE endpoint creation

## Usage

### Standalone Development

```bash
# Start development server with hot reload
npm run dev
```

### Standalone Production

```bash
# Build the project
npm run build

# Start production server
npm start
```

### LibreChat Integration

Once integrated with LibreChat:

1. Start LibreChat with the new service:
   ```bash
   docker compose down && docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
   ```

2. Verify the BookStack MCP service is running:
   ```bash
   docker compose ps bookstack-mcp
   ```

3. Check service health:
   ```bash
   curl http://localhost:8007/health
   ```

### Docker Commands

#### Standalone Docker Commands

```bash
# Build the Docker image
docker build -t bookstack-mcp .

# Run with Docker
docker run -d \
  --name bookstack-mcp \
  --env-file .env \
  -p 8007:8007 \
  bookstack-mcp

# Using Docker Compose (recommended)
docker compose up -d

# View logs
docker compose logs -f bookstack-mcp

# Stop the service
docker compose down
```

#### LibreChat Integration Commands

```bash
# Build and start LibreChat with BookStack MCP
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d

# View BookStack MCP logs
docker compose logs -f bookstack-mcp

# Rebuild BookStack MCP service
docker compose build bookstack-mcp
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d bookstack-mcp

# Stop all services
docker compose down
```

## API Endpoints

- `GET /sse` - SSE connection endpoint for LibreChat
- `POST /message` - Message routing for MCP protocol
- `GET /health` - Health check endpoint

## Docker Deployment

The server is designed to run in Docker for easy deployment and scaling:

### Features
- Multi-stage build for optimized image size
- Non-root user for security
- Health checks for container orchestration
- Proper signal handling for graceful shutdowns

### Environment Variables in Docker

When using Docker, create a `.env` file in the project root:

```env
BOOKSTACK_BASE_URL=https://your-bookstack.com
BOOKSTACK_TOKEN_ID=your-token-id
BOOKSTACK_TOKEN_SECRET=your-token-secret
PORT=8007
```

### Production Considerations

#### For Both Deployment Methods

- Use Docker secrets or a secure secrets management system for API tokens
- Implement proper logging and monitoring
- Regular security updates for base images and dependencies

#### Standalone Production

- Consider running behind a reverse proxy (nginx, traefik)
- Use container orchestration (Docker Swarm, Kubernetes) for high availability
- Implement rate limiting and request throttling

#### LibreChat Integration Production

- Follow LibreChat's production deployment guidelines
- Ensure BookStack MCP service is included in backup/restore procedures
- Monitor resource usage as part of the LibreChat stack
- Consider using external networks for better isolation

## Example Usage

### In LibreChat Conversations

Once configured, you can use BookStack tools in LibreChat conversations:

**Advanced Search Examples:**
```
"Search for pages containing 'API authentication'"
"Find all pages in book 5 created this year"
"Search for content created by user ID 1"
"Show me the most recently updated pages in the Documentation book"
```

**Content Discovery:**
```
"List all books sorted by last updated"
"Show me pages in chapter 3 of the User Guide"
"Export page 456 as markdown"
"Get the content of the Installation Guide page"
```

**Write Operations (if enabled):**
```
"Create a new troubleshooting page in book 5"
"Update page 123 with the latest API changes"
```

**Note:** Write operations require `BOOKSTACK_ENABLE_WRITE=true` in your environment variables.

### Direct API Testing (Standalone)

```bash
# Test health endpoint
curl http://localhost:8007/health

# Test SSE connection (will establish persistent connection)
curl -N http://localhost:8007/sse
```

## Development

### Project Structure

```
src/
├── bookstack-client.ts    # BookStack API client
├── bookstack-tools.ts     # MCP tools implementation  
├── sse-transport.ts       # SSE server transport
└── index.ts              # Main server entry point
```

### Type Checking

```bash
npm run type-check
```

## Security Considerations

- Always use HTTPS for production BookStack instances
- Store API tokens securely and rotate them regularly
- Consider implementing additional authentication for the MCP server in production
- Review BookStack user permissions to limit API access appropriately

## Troubleshooting

### Standalone Deployment Issues

1. **Connection Issues:**
   - Verify BookStack URL is accessible: `curl https://your-bookstack.com/api/docs`
   - Check API token permissions in BookStack
   - Verify server is running: `curl http://localhost:8007/health`

2. **Permission Errors:**
   - Ensure the BookStack user has "Access System API" permission
   - Verify API tokens are correctly configured in `.env`
   - Check that the user has appropriate permissions for the content being accessed

### LibreChat Integration Issues

1. **Service Not Starting:**
   ```bash
   # Check if service is defined properly
   docker compose config bookstack-mcp
   
   # Check service logs
   docker compose logs bookstack-mcp
   ```

2. **MCP Connection Issues:**
   - Verify the service name in `librechat.yaml` matches the docker-compose service name
   - Check that the URL uses the internal Docker network: `http://bookstack-mcp:8007/sse`
   - Ensure environment variables are properly passed to the container

3. **Environment Variable Issues:**
   ```bash
   # Verify environment variables are loaded
   docker compose exec bookstack-mcp env | grep BOOKSTACK
   ```

4. **Network Issues:**
   ```bash
   # Test internal connectivity from LibreChat container
   docker compose exec api curl http://bookstack-mcp:8007/health
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with appropriate tests
4. Submit a pull request

## Additional Documentation

- **LibreChat Integration**: See [LIBRECHAT_INTEGRATION.md](./LIBRECHAT_INTEGRATION.md) for detailed LibreChat setup instructions
- **Configuration Examples**: Check `librechat.yaml.example` and `docker-compose.override.yml.example`

## License

MIT License - see LICENSE file for details