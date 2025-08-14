#!/usr/bin/env node

import { BookStackClient, BookStackConfig } from "./bookstack-client.js";
import { BookStackTools } from "./bookstack-tools.js";
import { SSETransportServer } from "./sse-transport.js";
import { FileCache } from "./file-cache.js";

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: ${name} environment variable is required`);
    process.exit(1);
  }
  return value;
}

function printUsage() {
  console.log(`
BookStack MCP Server with SSE Support

Environment Variables Required:
  BOOKSTACK_BASE_URL    - BookStack instance URL (e.g., https://your-bookstack.com)
  BOOKSTACK_TOKEN_ID    - API Token ID from BookStack
  BOOKSTACK_TOKEN_SECRET - API Token Secret from BookStack

Optional Environment Variables:
  PORT                  - Server port (default: 8007)
  BOOKSTACK_ENABLE_WRITE - Enable write operations (default: false)

Usage:
  npm run dev           - Start development server
  npm run build         - Build the project
  npm run start         - Start production server

Example LibreChat Configuration:
  Add to your librechat.yaml:

  mcpServers:
    bookstack:
      url: http://localhost:8007/sse
      timeout: 60000

For more information, visit: https://github.com/ttpears/bookstack-mcp
  `);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  try {
    const config: BookStackConfig = {
      baseUrl: getRequiredEnvVar('BOOKSTACK_BASE_URL'),
      tokenId: getRequiredEnvVar('BOOKSTACK_TOKEN_ID'),
      tokenSecret: getRequiredEnvVar('BOOKSTACK_TOKEN_SECRET'),
      enableWrite: process.env.BOOKSTACK_ENABLE_WRITE?.toLowerCase() === 'true'
    };

    console.log('Initializing BookStack MCP Server...');
    console.log(`BookStack URL: ${config.baseUrl}`);
    console.log(`Write operations: ${config.enableWrite ? 'ENABLED' : 'DISABLED'}`);
    if (!config.enableWrite) {
      console.log('ℹ️  Only read operations available. Set BOOKSTACK_ENABLE_WRITE=true to enable writes.');
    }

    // Initialize file cache with configurable duration
    const cacheDurationMinutes = parseInt(process.env.CACHE_DURATION_MINUTES || '10');
    const fileCache = new FileCache('./cache', cacheDurationMinutes);

    const client = new BookStackClient(config, fileCache);
    const tools = new BookStackTools(client, config.enableWrite);
    const sseServer = new SSETransportServer(tools, fileCache);

    const port = parseInt(process.env.PORT || '8007');
    
    sseServer.start(port);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}