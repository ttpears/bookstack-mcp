# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BookStack MCP Server v2.1 — A TypeScript MCP server providing BookStack wiki integration for AI assistants. Published to npm as `bookstack-mcp`. Uses McpServer API with `registerTool()` and Zod schemas with `z.coerce.number()` for broad MCP client compatibility.

## Build & Development Commands

```bash
npm install              # Install dependencies
npm run build           # Compile TypeScript + chmod +x dist/*.js
npm run type-check      # Type-check without emitting files
npm run dev             # Start server with hot reload (tsx)
npm start               # Run compiled server (node dist/index.js)
```

## Architecture

Two source files in `src/`:

**`src/index.ts`** — MCP server entry point
- `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`
- Tool registration with `server.registerTool()`
- Zod schemas using `z.coerce.number()` (accepts both `8` and `"8"` from clients)
- Required ID params use `.min(1)` to guard against empty string coercion
- Stdio transport
- Write tools conditionally registered based on `BOOKSTACK_ENABLE_WRITE`

**`src/bookstack-client.ts`** — BookStack API wrapper
- Axios-based HTTP client with token auth
- Response enhancement: URLs via slugs, human-friendly dates, content previews, word counts
- Export handling: binary formats return download URLs, text formats return content
- Write operations gated by `enableWrite` flag

## Configuration

### Environment Variables
```env
BOOKSTACK_BASE_URL=https://your-bookstack.com   # Required
BOOKSTACK_TOKEN_ID=your-token-id                # Required
BOOKSTACK_TOKEN_SECRET=your-token-secret        # Required
BOOKSTACK_ENABLE_WRITE=false                    # Optional
```

### TypeScript Configuration
- Target: ES2022 with NodeNext modules/resolution
- Output: `dist/` directory
- No source maps or declarations (CLI package, not a library)

## npm Package

Published as `bookstack-mcp`. Key package.json fields:
- `bin`: `bookstack-mcp` -> `dist/index.js` (with shebang `#!/usr/bin/env node`)
- `files`: `["dist"]` only (npm auto-includes LICENSE/README)
- `prepare`: runs build (triggers on install from git and before publish)
- `engines`: `>=18`

To publish: `npm publish` (package is unscoped, no `--access public` needed)

## Key Implementation Details

### Tool Registration Pattern

```typescript
server.registerTool(
  "tool_name",
  {
    title: "Human-Readable Title",
    description: "What this tool does",
    inputSchema: {
      id: z.coerce.number().min(1).describe("Entity ID"),
      count: z.coerce.number().max(500).optional().describe("Results count")
    }
  },
  async (args) => {
    const result = await client.someMethod(args.id, args.count);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }
);
```

Use `z.coerce.number()` (not `z.number()`) for all numeric params — MCP clients often send numbers as strings. Use `.min(1)` on required ID fields.

### Adding a New Tool

1. Add method to `BookStackClient` if needed (`src/bookstack-client.ts`)
2. Register tool in `src/index.ts` using `server.registerTool()`
3. If write operation, add inside `if (config.enableWrite) { ... }` block

### Write Operations Security

Write tools only registered when `BOOKSTACK_ENABLE_WRITE=true`:
```typescript
if (config.enableWrite) {
  server.registerTool("create_page", ...);
  // ... other write tools
}
```

## Dependencies

- **@modelcontextprotocol/sdk** (^1.25.3) — MCP protocol
- **axios** (^1.6.0) — BookStack API client
- **zod** (^3.25.76) — Schema validation (compatible with SDK's zod/v4 layer)
- **shx** (^0.4.0, dev) — Cross-platform chmod for build
- **tsx** (^4.6.0, dev) — Development hot reload
- **typescript** (^5.3.0, dev) — Type-safe development

## Debugging

```bash
# Logs go to stderr to avoid stdio protocol interference
npm run dev
# Look for: "Initializing BookStack MCP Server..."

# Test BookStack API directly
curl -H "Authorization: Token $BOOKSTACK_TOKEN_ID:$BOOKSTACK_TOKEN_SECRET" \
  $BOOKSTACK_BASE_URL/api/docs
```
