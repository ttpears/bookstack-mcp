import express from 'express';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { BookStackTools } from "./bookstack-tools.js";

export class SSETransportServer {
  private app = express();
  private transports: Map<string, SSEServerTransport> = new Map();
  private bookStackTools: BookStackTools;

  constructor(bookStackTools: BookStackTools) {
    this.bookStackTools = bookStackTools;
    this.setupRoutes();
  }

  private setupRoutes() {
    // Remove global express.json() middleware as handlePostMessage handles the stream
    // this.app.use(express.json()); 
    
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-session-id');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    this.app.get("/health", (req, res) => {
      res.status(200).send("OK");
    });

    this.app.get("/sse", async (req, res) => {
      try {
        console.log("New SSE connection request");
        
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
            tools: this.bookStackTools.getTools()
          };
        });

        server.setRequestHandler(CallToolRequestSchema, async (request) => {
          return await this.bookStackTools.handleToolCall(request);
        });

        const transport = new SSEServerTransport("/message", res);
        this.transports.set(transport.sessionId, transport);

        console.log(`Created new session: ${transport.sessionId}`);

        transport.onclose = () => {
          console.log(`Session ${transport.sessionId} closed`);
          this.transports.delete(transport.sessionId);
        };

        await server.connect(transport);
        console.log(`Server connected for session: ${transport.sessionId}`);

      } catch (error) {
        console.error("Error in SSE endpoint:", error);
        if (!res.headersSent) {
          res.status(500).send("Internal server error");
        }
      }
    });

    this.app.post("/message", async (req, res) => {
      try {
        const sessionId = (req.query.sessionId as string) || (req.headers['x-session-id'] as string);
        
        if (!sessionId) {
          res.status(400).send("Missing session ID");
          return;
        }

        const transport = this.transports.get(sessionId);
        if (!transport) {
          res.status(404).send("Session not found");
          return;
        }

        // Use handlePostMessage to handle the request/response cycle
        await transport.handlePostMessage(req, res);

      } catch (error) {
        console.error("Error in message endpoint:", error);
        if (!res.headersSent) {
          res.status(500).send("Internal server error");
        }
      }
    });
  }


  start(port: number = 8007): void {
    this.app.listen(port, () => {
      console.log(`BookStack MCP SSE server running on port ${port}`);
      console.log(`SSE endpoint: http://localhost:${port}/sse`);
      console.log(`Message endpoint: http://localhost:${port}/message`);
      console.log(`Health check: http://localhost:${port}/health`);
    });
  }

  getApp() {
    return this.app;
  }
}