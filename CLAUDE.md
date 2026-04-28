# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BookStack MCP Server — A TypeScript MCP server providing BookStack wiki integration for AI assistants. Published to npm as `bookstack-mcp`. Uses McpServer API with `registerTool()` and Zod schemas with `z.coerce.number()` for broad MCP client compatibility. Current version is tracked in `package.json`.

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
BOOKSTACK_INSECURE_SKIP_TLS_VERIFY=false        # Optional, for self-signed BookStack
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

## Release Process

Releases are fully automated by GitHub Actions — **never run `npm publish` locally**.

1. Bump `version` in `package.json` (semver) in the same PR/commit as the changes you want to ship.
2. Merge to `main`.
3. `.github/workflows/ci.yml` runs:
   - `build` job: `npm ci` + `npm run build` on every push and PR.
   - `tag` job (main only): if `package.json` version doesn't already have a matching `v${version}` git tag, it creates and pushes one using `RELEASE_PAT` (a PAT is required because the default `GITHUB_TOKEN` cannot trigger downstream workflows).
4. The pushed tag triggers `.github/workflows/release.yml`, which:
   - Builds, then upgrades npm to the latest (Node 20 ships npm 10.x; trusted publishing needs ≥ 11.5.1).
   - Publishes via npm **trusted publishing (OIDC)** with `--provenance` — no `NPM_TOKEN`. The npm CLI exchanges the Actions OIDC token (`id-token: write`) for a short-lived registry token at publish time. This requires the npm package to have a trusted publisher configured pointing at this repo's `release.yml`.
   - Creates a GitHub Release for the tag with auto-generated notes (`gh release create --generate-notes`).

Notes:
- Don't tag manually — let the `tag` job do it from the version bump. Manually pushed tags will still trigger `release.yml`, but you bypass the version-changed gate.
- If `RELEASE_PAT` is missing/expired, the tag never gets pushed and the release silently doesn't happen. Symptom: CI green on main, no new tag, no npm release.
- Don't add an `NPM_TOKEN` secret — trusted publishing replaces it. Adding one weakens the threat model.

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
