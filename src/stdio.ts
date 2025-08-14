#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { BookStackClient, BookStackConfig } from "./bookstack-client.js";
import { BookStackTools } from "./bookstack-tools.js";

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: ${name} environment variable is required`);
    process.exit(1);
  }
  return value;
}

async function main() {
  try {
    const config: BookStackConfig = {
      baseUrl: getRequiredEnvVar('BOOKSTACK_BASE_URL'),
      tokenId: getRequiredEnvVar('BOOKSTACK_TOKEN_ID'),
      tokenSecret: getRequiredEnvVar('BOOKSTACK_TOKEN_SECRET')
    };

    console.error('Initializing BookStack MCP Server (stdio)...');
    console.error(`BookStack URL: ${config.baseUrl}`);

    const client = new BookStackClient(config);
    const tools = new BookStackTools(client);

    const server = new Server(
      {
        name: "bookstack-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: tools.getTools()
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return await tools.handleToolCall(request);
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("BookStack MCP server running on stdio");

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}