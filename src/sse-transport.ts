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
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    this.app.get("/sse", async (req, res) => {
      try {
        console.log("New SSE connection request");
        
        const sessionId = req.query.sessionId as string;
        
        if (sessionId && this.transports.has(sessionId)) {
          console.log(`Session ${sessionId} already exists, closing connection`);
          res.status(409).send("Session already exists");
          return;
        }

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

    this.app.post("/message", express.json(), async (req, res) => {
      try {
        const sessionId = req.headers['x-session-id'] as string;
        
        if (!sessionId) {
          res.status(400).send("Missing session ID header");
          return;
        }

        const transport = this.transports.get(sessionId);
        if (!transport) {
          res.status(404).send("Session not found");
          return;
        }

        await transport.handleMessage(req.body);
        res.sendStatus(200);

      } catch (error) {
        console.error("Error in message endpoint:", error);
        res.status(500).send("Internal server error");
      }
    });

    this.app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        activeSessions: this.transports.size
      });
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