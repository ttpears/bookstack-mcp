#!/usr/bin/env node

import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { BookStackClient, BookStackConfig } from "./bookstack-client.js";
import { registerPrompts } from "./prompts.js";
import {
  loadOAuthConfig,
  initOAuthStore,
  handleOAuthRoutes,
  validateBearer,
  sendUnauthorized,
  OAuthConfig
} from "./oauth/entra-proxy.js";

// App-level config: the read-only credential is always present; the write credential and
// OAuth proxy are optional. In OAuth mode the per-session credential is chosen by role.
interface AppConfig {
  read: BookStackConfig;
  write: BookStackConfig | null;
  oauth: OAuthConfig | null;
}

const PKG_VERSION: string = (() => {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    return JSON.parse(readFileSync(pkgPath, "utf8")).version as string;
  } catch {
    return "0.0.0";
  }
})();

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: true
} as const;

const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true
} as const;

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: ${name} environment variable is required`);
    process.exit(1);
  }
  return value;
}

function buildServer(config: BookStackConfig): McpServer {
  const client = new BookStackClient(config);
  const server = new McpServer({
    name: "bookstack-mcp",
    version: PKG_VERSION
  });

  registerTools(server, client, config);
  registerResources(server, client);
  registerPrompts(server);
  return server;
}

function registerResources(server: McpServer, client: BookStackClient): void {
  // bookstack://book/{id} — every book as a discoverable, addressable resource
  server.registerResource(
    "book",
    new ResourceTemplate("bookstack://book/{id}", {
      list: async () => {
        const books = await client.getBooks({ count: 500 });
        return {
          resources: (books.data ?? []).map((b: any) => ({
            uri: `bookstack://book/${b.id}`,
            name: b.name,
            description: b.description ?? undefined,
            mimeType: "application/json"
          }))
        };
      },
      complete: {
        id: async (value: string) => {
          if (!value) return [];
          const results = await client.searchContent(value, { type: "book", count: 20 });
          return (results.results ?? []).map((r: any) => String(r.id));
        }
      }
    }),
    {
      description: "A BookStack book exposed as an MCP resource",
      mimeType: "application/json"
    },
    async (uri: URL, variables) => {
      const id = Number(variables.id);
      if (!Number.isFinite(id) || id < 1) {
        throw new Error(`Invalid book id: ${variables.id}`);
      }
      const book = await client.getBook(id);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(book)
        }]
      };
    }
  );

  // bookstack://page/{id} — pages as resources, content returned as markdown
  server.registerResource(
    "page",
    new ResourceTemplate("bookstack://page/{id}", {
      list: async () => {
        const pages = await client.getPages({ count: 500 });
        return {
          resources: (pages.data ?? []).map((p: any) => ({
            uri: `bookstack://page/${p.id}`,
            name: p.name,
            description: p.content_preview ?? undefined,
            mimeType: "text/markdown"
          }))
        };
      },
      complete: {
        id: async (value: string) => {
          if (!value) return [];
          const results = await client.searchContent(value, { type: "page", count: 20 });
          return (results.results ?? []).map((r: any) => String(r.id));
        }
      }
    }),
    {
      description: "A BookStack page exposed as an MCP resource (markdown content)",
      mimeType: "text/markdown"
    },
    async (uri: URL, variables) => {
      const id = Number(variables.id);
      if (!Number.isFinite(id) || id < 1) {
        throw new Error(`Invalid page id: ${variables.id}`);
      }
      const page = await client.getPage(id, { format: "markdown" });
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/markdown",
          text: page.content ?? ""
        }, {
          uri: `${uri.href}#metadata`,
          mimeType: "application/json",
          text: JSON.stringify({
            id: page.id,
            name: page.name,
            book_id: page.book_id,
            chapter_id: page.chapter_id,
            url: page.url,
            word_count: page.word_count,
            updated_at: page.updated_at,
            content_truncated: page.content_truncated,
            content_total_chars: page.content_total_chars
          })
        }]
      };
    }
  );
}

function registerTools(server: McpServer, client: BookStackClient, config: BookStackConfig): void {
  // Helpers wrap registerTool and inject MCP tool annotations so clients can
  // distinguish read-only from destructive operations. Typed loosely to defer
  // to the SDK's generic overloads at the call sites.
  const readTool: typeof server.registerTool = ((name: string, cfg: any, handler: any) =>
    server.registerTool(name, { ...cfg, annotations: { ...READ_ONLY_ANNOTATIONS, ...(cfg.annotations ?? {}) } }, handler)) as any;
  const writeTool: typeof server.registerTool = ((name: string, cfg: any, handler: any) =>
    server.registerTool(name, { ...cfg, annotations: { ...WRITE_ANNOTATIONS, ...(cfg.annotations ?? {}) } }, handler)) as any;

  // Register read-only tools.
  // Common params (offset/count/sort/filter/id) are self-describing and intentionally
  // bare so tool definitions stay compact in the MCP tools/list payload.
  readTool(
    "search_content",
    {
      description: "Search BookStack content. Supports advanced syntax like {type:page} or {book_id:5}. {created_by:X}/{updated_by:X}/{owned_by:X} need a numeric user ID — use find_users to resolve names.",
      inputSchema: {
        query: z.string(),
        type: z.enum(["book", "page", "chapter", "bookshelf"]).optional(),
        count: z.coerce.number().max(500).optional(),
        offset: z.coerce.number().optional()
      }
    },
    async (args) => {
      const results = await client.searchContent(args.query, {
        type: args.type,
        count: args.count,
        offset: args.offset
      });
      return { content: [{ type: "text", text: JSON.stringify(results) }] };
    }
  );

  readTool(
    "search_pages",
    {
      description: "Search BookStack pages, optionally within a book. Same user-ID caveat as search_content.",
      inputSchema: {
        query: z.string(),
        book_id: z.coerce.number().optional(),
        count: z.coerce.number().max(500).optional(),
        offset: z.coerce.number().optional()
      }
    },
    async (args) => {
      const results = await client.searchPages(args.query, {
        bookId: args.book_id,
        count: args.count,
        offset: args.offset
      });
      return { content: [{ type: "text", text: JSON.stringify(results) }] };
    }
  );

  readTool(
    "get_books",
    {
      description: "List books with optional filter/sort.",
      inputSchema: {
        offset: z.coerce.number().default(0),
        count: z.coerce.number().max(500).default(50),
        sort: z.string().optional(),
        filter: z.record(z.any()).optional()
      }
    },
    async (args) => {
      const books = await client.getBooks({
        offset: args.offset,
        count: args.count,
        sort: args.sort,
        filter: args.filter
      });
      return {
        content: [{ type: "text", text: JSON.stringify(books) }]
      };
    }
  );

  readTool(
    "get_book",
    {
      description: "Get a book.",
      inputSchema: {
        id: z.coerce.number().min(1)
      }
    },
    async (args) => {
      const book = await client.getBook(args.id);
      return {
        content: [{ type: "text", text: JSON.stringify(book) }]
      };
    }
  );

  readTool(
    "get_pages",
    {
      description: "List pages with previews.",
      inputSchema: {
        book_id: z.coerce.number().optional(),
        chapter_id: z.coerce.number().optional(),
        offset: z.coerce.number().default(0),
        count: z.coerce.number().max(500).default(50),
        sort: z.string().optional(),
        filter: z.record(z.any()).optional()
      }
    },
    async (args) => {
      const pages = await client.getPages({
        bookId: args.book_id,
        chapterId: args.chapter_id,
        offset: args.offset,
        count: args.count,
        sort: args.sort,
        filter: args.filter
      });
      return {
        content: [{ type: "text", text: JSON.stringify(pages) }]
      };
    }
  );

  readTool(
    "get_page",
    {
      description: "Get a page. Returns one format (default markdown); use offset/limit + content_next_offset to paginate large pages.",
      inputSchema: {
        id: z.coerce.number().min(1),
        format: z.enum(["markdown", "html", "text"]).optional().describe("Which content format to return. Defaults to markdown."),
        offset: z.coerce.number().min(0).optional().describe("Character offset into the content to start from (default 0)"),
        limit: z.coerce.number().min(1).max(200000).optional().describe("Max characters of content to return (default 50000)")
      }
    },
    async (args) => {
      const page = await client.getPage(args.id, {
        format: args.format,
        offset: args.offset,
        limit: args.limit
      });
      return {
        content: [{ type: "text", text: JSON.stringify(page) }]
      };
    }
  );

  readTool(
    "get_chapters",
    {
      description: "List chapters; optional book_id.",
      inputSchema: {
        book_id: z.coerce.number().optional(),
        offset: z.coerce.number().default(0),
        count: z.coerce.number().default(50)
      }
    },
    async (args) => {
      const chapters = await client.getChapters(args.book_id, args.offset, args.count);
      return {
        content: [{ type: "text", text: JSON.stringify(chapters) }]
      };
    }
  );

  readTool(
    "get_chapter",
    {
      description: "Get a chapter.",
      inputSchema: {
        id: z.coerce.number().min(1)
      }
    },
    async (args) => {
      const chapter = await client.getChapter(args.id);
      return {
        content: [{ type: "text", text: JSON.stringify(chapter) }]
      };
    }
  );

  readTool(
    "export_page",
    {
      description: "Export a page (PDF/ZIP return download URL).",
      inputSchema: {
        id: z.coerce.number().min(1),
        format: z.enum(["html", "pdf", "markdown", "plaintext", "zip"])
      }
    },
    async (args) => {
      const content = await client.exportPage(args.id, args.format);

      if (typeof content === 'object' && content.download_url) {
        return { content: [{ type: "text", text: JSON.stringify(content) }] };
      }

      const text = typeof content === 'string' ? content : JSON.stringify(content);
      return {
        content: [{ type: "text", text }]
      };
    }
  );

  readTool(
    "export_book",
    {
      description: "Export a book.",
      inputSchema: {
        id: z.coerce.number().min(1),
        format: z.enum(["html", "pdf", "markdown", "plaintext", "zip"])
      }
    },
    async (args) => {
      const content = await client.exportBook(args.id, args.format);

      if (typeof content === 'object' && content.download_url) {
        return { content: [{ type: "text", text: JSON.stringify(content) }] };
      }

      const text = typeof content === 'string' ? content : JSON.stringify(content);
      return {
        content: [{ type: "text", text }]
      };
    }
  );

  readTool(
    "export_chapter",
    {
      description: "Export a chapter.",
      inputSchema: {
        id: z.coerce.number().min(1),
        format: z.enum(["html", "pdf", "markdown", "plaintext", "zip"])
      }
    },
    async (args) => {
      const content = await client.exportChapter(args.id, args.format);

      if (typeof content === 'object' && content.download_url) {
        return { content: [{ type: "text", text: JSON.stringify(content) }] };
      }

      const text = typeof content === 'string' ? content : JSON.stringify(content);
      return {
        content: [{ type: "text", text }]
      };
    }
  );

  readTool(
    "get_recent_changes",
    {
      description: "List content updated in the last N days.",
      inputSchema: {
        type: z.enum(["all", "page", "book", "chapter"]).default("all"),
        limit: z.coerce.number().max(100).default(20),
        days: z.coerce.number().default(30)
      }
    },
    async (args) => {
      const changes = await client.getRecentChanges({
        type: args.type,
        limit: args.limit,
        days: args.days
      });
      return {
        content: [{ type: "text", text: JSON.stringify(changes) }]
      };
    }
  );

  readTool(
    "get_shelves",
    {
      description: "List shelves (book collections).",
      inputSchema: {
        offset: z.coerce.number().default(0),
        count: z.coerce.number().max(500).default(50),
        sort: z.string().optional(),
        filter: z.record(z.any()).optional()
      }
    },
    async (args) => {
      const shelves = await client.getShelves({
        offset: args.offset,
        count: args.count,
        sort: args.sort,
        filter: args.filter
      });
      return {
        content: [{ type: "text", text: JSON.stringify(shelves) }]
      };
    }
  );

  readTool(
    "get_shelf",
    {
      description: "Get a shelf including its books.",
      inputSchema: {
        id: z.coerce.number().min(1)
      }
    },
    async (args) => {
      const shelf = await client.getShelf(args.id);
      return {
        content: [{ type: "text", text: JSON.stringify(shelf) }]
      };
    }
  );

  readTool(
    "get_attachments",
    {
      description: "List attachments (files and links).",
      inputSchema: {
        offset: z.coerce.number().default(0),
        count: z.coerce.number().max(500).default(50),
        sort: z.string().optional(),
        filter: z.record(z.any()).optional()
      }
    },
    async (args) => {
      const attachments = await client.getAttachments({
        offset: args.offset,
        count: args.count,
        sort: args.sort,
        filter: args.filter
      });
      return {
        content: [{ type: "text", text: JSON.stringify(attachments) }]
      };
    }
  );

  readTool(
    "get_attachment",
    {
      description: "Get an attachment with download_url.",
      inputSchema: {
        id: z.coerce.number().min(1)
      }
    },
    async (args) => {
      const attachment = await client.getAttachment(args.id);
      return {
        content: [{ type: "text", text: JSON.stringify(attachment) }]
      };
    }
  );

  readTool(
    "get_comments",
    {
      description: "List comments (optional page_id). BookStack v25.11+.",
      inputSchema: {
        page_id: z.coerce.number().optional(),
        offset: z.coerce.number().default(0),
        count: z.coerce.number().max(500).default(50),
        sort: z.string().optional()
      }
    },
    async (args) => {
      const comments = await client.getComments({
        pageId: args.page_id,
        offset: args.offset,
        count: args.count,
        sort: args.sort
      });
      return {
        content: [{ type: "text", text: JSON.stringify(comments) }]
      };
    }
  );

  readTool(
    "get_comment",
    {
      description: "Get a comment. BookStack v25.11+.",
      inputSchema: {
        id: z.coerce.number().min(1)
      }
    },
    async (args) => {
      const comment = await client.getComment(args.id);
      return {
        content: [{ type: "text", text: JSON.stringify(comment) }]
      };
    }
  );

  readTool(
    "find_users",
    {
      description: "List users; filter by name/email/slug (partial match). Resolves names to numeric user IDs for {created_by:X}/{updated_by:X}/{owned_by:X} search filters. Requires admin token.",
      inputSchema: {
        name: z.string().optional(),
        email: z.string().optional(),
        slug: z.string().optional(),
        offset: z.coerce.number().default(0),
        count: z.coerce.number().max(500).default(50),
        sort: z.string().optional()
      }
    },
    async (args) => {
      const filter: Record<string, any> = {};
      if (args.name) filter.name = args.name;
      if (args.email) filter.email = args.email;
      if (args.slug) filter.slug = args.slug;
      const users = await client.getUsers({
        offset: args.offset,
        count: args.count,
        sort: args.sort,
        filter: Object.keys(filter).length ? filter : undefined
      });
      return {
        content: [{ type: "text", text: JSON.stringify(users) }]
      };
    }
  );

  readTool(
    "get_recycle_bin",
    {
      description: "List recycle-bin items. Admin token required.",
      inputSchema: {
        offset: z.coerce.number().default(0),
        count: z.coerce.number().max(500).default(50),
        sort: z.string().optional()
      }
    },
    async (args) => {
      const items = await client.getRecycleBin({
        offset: args.offset,
        count: args.count,
        sort: args.sort
      });
      return {
        content: [{ type: "text", text: JSON.stringify(items) }]
      };
    }
  );

  // Register write tools if enabled
  if (config.enableWrite) {
    writeTool(
      "create_book",
      {
        description: "Create a new book in BookStack",
        inputSchema: {
          name: z.string().describe("Book name"),
          description: z.string().optional().describe("Optional: Book description"),
          tags: z.array(z.object({
            name: z.string(),
            value: z.string()
          }).strict()).optional().describe("Tags for the book")
        }
      },
      async (args) => {
        const book = await client.createBook({
          name: args.name,
          description: args.description,
          tags: args.tags as any
        });
        return {
          content: [{ type: "text", text: JSON.stringify(book) }]
        };
      }
    );

    writeTool(
      "create_chapter",
      {
        description: "Create a new chapter within a book",
        inputSchema: {
          book_id: z.coerce.number().min(1).describe("Book ID where the chapter will be created"),
          name: z.string().describe("Chapter name"),
          description: z.string().optional().describe("Optional: Chapter description"),
          tags: z.array(z.object({
            name: z.string(),
            value: z.string()
          }).strict()).optional().describe("Tags for the chapter")
        }
      },
      async (args) => {
        const chapter = await client.createChapter({
          book_id: args.book_id,
          name: args.name,
          description: args.description,
          tags: args.tags as any
        });
        return {
          content: [{ type: "text", text: JSON.stringify(chapter) }]
        };
      }
    );

    writeTool(
      "create_page",
      {
        description: "Create a new page in BookStack",
        inputSchema: {
          name: z.string().describe("Page name"),
          book_id: z.coerce.number().min(1).describe("Book ID where the page will be created"),
          chapter_id: z.coerce.number().optional().describe("Optional: Chapter ID if page should be in a chapter"),
          html: z.string().optional().describe("Optional: HTML content"),
          markdown: z.string().optional().describe("Optional: Markdown content")
        }
      },
      async (args) => {
        const page = await client.createPage({
          name: args.name,
          book_id: args.book_id,
          chapter_id: args.chapter_id,
          html: args.html,
          markdown: args.markdown
        });
        return {
          content: [{ type: "text", text: JSON.stringify(page) }]
        };
      }
    );

    writeTool(
      "update_page",
      {
        description: "Update an existing page. Pass book_id (and optionally chapter_id) to move the page to a different location.",
        inputSchema: {
          id: z.coerce.number().min(1),
          name: z.string().optional().describe("Optional: New page name"),
          html: z.string().optional().describe("Optional: New HTML content"),
          markdown: z.string().optional().describe("Optional: New Markdown content"),
          book_id: z.coerce.number().min(1).optional().describe("Optional: Move page to this book"),
          chapter_id: z.coerce.number().optional().describe("Optional: Move page into this chapter (must belong to the target book; pass 0 to move out of any chapter)")
        }
      },
      async (args) => {
        const page = await client.updatePage(args.id, {
          name: args.name,
          html: args.html,
          markdown: args.markdown,
          book_id: args.book_id,
          chapter_id: args.chapter_id
        });
        return {
          content: [{ type: "text", text: JSON.stringify(page) }]
        };
      }
    );

    writeTool(
      "create_shelf",
      {
        description: "Create a new book shelf (collection)",
        inputSchema: {
          name: z.string().describe("Shelf name"),
          description: z.string().optional().describe("Shelf description"),
          books: z.array(z.coerce.number()).optional().describe("Array of book IDs to add to the shelf"),
          tags: z.array(z.object({
            name: z.string(),
            value: z.string()
          }).strict()).optional().describe("Tags for the shelf")
        }
      },
      async (args) => {
        const shelf = await client.createShelf({
          name: args.name,
          description: args.description,
          books: args.books,
          tags: args.tags as any
        });
        return {
          content: [{ type: "text", text: JSON.stringify(shelf) }]
        };
      }
    );

    writeTool(
      "update_shelf",
      {
        description: "Update an existing book shelf",
        inputSchema: {
          id: z.coerce.number().min(1),
          name: z.string().optional().describe("New shelf name"),
          description: z.string().optional().describe("New shelf description"),
          books: z.array(z.coerce.number()).optional().describe("Array of book IDs"),
          tags: z.array(z.object({
            name: z.string(),
            value: z.string()
          }).strict()).optional().describe("Tags for the shelf")
        }
      },
      async (args) => {
        const shelf = await client.updateShelf(args.id, {
          name: args.name,
          description: args.description,
          books: args.books,
          tags: args.tags as any
        });
        return {
          content: [{ type: "text", text: JSON.stringify(shelf) }]
        };
      }
    );

    writeTool(
      "delete_shelf",
      {
        description: "Delete a book shelf (collection)",
        inputSchema: {
          id: z.coerce.number().min(1)
        }
      },
      async (args) => {
        const result = await client.deleteShelf(args.id);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      }
    );

    writeTool(
      "create_attachment",
      {
        description: "Create a new link attachment to a page",
        inputSchema: {
          name: z.string().describe("Attachment name"),
          uploaded_to: z.coerce.number().min(1).describe("Page ID where attachment will be attached"),
          link: z.string().describe("URL for link attachment")
        }
      },
      async (args) => {
        const attachment = await client.createAttachment({
          name: args.name,
          uploaded_to: args.uploaded_to,
          link: args.link
        });
        return {
          content: [{ type: "text", text: JSON.stringify(attachment) }]
        };
      }
    );

    writeTool(
      "update_attachment",
      {
        description: "Update an existing attachment",
        inputSchema: {
          id: z.coerce.number().min(1),
          name: z.string().optional().describe("New attachment name"),
          link: z.string().optional().describe("New URL for link attachment"),
          uploaded_to: z.coerce.number().optional().describe("Move attachment to different page")
        }
      },
      async (args) => {
        const attachment = await client.updateAttachment(args.id, {
          name: args.name,
          link: args.link,
          uploaded_to: args.uploaded_to
        });
        return {
          content: [{ type: "text", text: JSON.stringify(attachment) }]
        };
      }
    );

    writeTool(
      "delete_attachment",
      {
        description: "Delete an attachment",
        inputSchema: {
          id: z.coerce.number().min(1)
        }
      },
      async (args) => {
        const result = await client.deleteAttachment(args.id);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      }
    );

    writeTool(
      "delete_book",
      {
        description: "Delete a book. Goes to the recycle bin and can be restored from there.",
        inputSchema: {
          id: z.coerce.number().min(1)
        }
      },
      async (args) => {
        const result = await client.deleteBook(args.id);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      }
    );

    writeTool(
      "delete_chapter",
      {
        description: "Delete a chapter. Goes to the recycle bin and can be restored from there.",
        inputSchema: {
          id: z.coerce.number().min(1)
        }
      },
      async (args) => {
        const result = await client.deleteChapter(args.id);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      }
    );

    writeTool(
      "delete_page",
      {
        description: "Delete a page. Goes to the recycle bin and can be restored from there.",
        inputSchema: {
          id: z.coerce.number().min(1)
        }
      },
      async (args) => {
        const result = await client.deletePage(args.id);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      }
    );

    writeTool(
      "create_comment",
      {
        description: "Add a comment to a page. Pass parent_id to reply to an existing comment. Requires BookStack v25.11+.",
        inputSchema: {
          page_id: z.coerce.number().min(1).describe("Page ID to comment on"),
          html: z.string().describe("Comment HTML body"),
          parent_id: z.coerce.number().optional().describe("Optional: parent comment ID for threaded replies"),
          content_ref: z.string().optional().describe("Optional: anchor/selection reference within the page")
        }
      },
      async (args) => {
        const comment = await client.createComment({
          page_id: args.page_id,
          html: args.html,
          parent_id: args.parent_id,
          content_ref: args.content_ref
        });
        return {
          content: [{ type: "text", text: JSON.stringify(comment) }]
        };
      }
    );

    writeTool(
      "update_comment",
      {
        description: "Edit a comment's body or archive/unarchive it. Requires BookStack v25.11+.",
        inputSchema: {
          id: z.coerce.number().min(1),
          html: z.string().optional().describe("Optional: new HTML body"),
          archived: z.boolean().optional().describe("Optional: archive (true) or unarchive (false) the comment")
        }
      },
      async (args) => {
        const comment = await client.updateComment(args.id, {
          html: args.html,
          archived: args.archived
        });
        return {
          content: [{ type: "text", text: JSON.stringify(comment) }]
        };
      }
    );

    writeTool(
      "delete_comment",
      {
        description: "Delete a comment. Requires BookStack v25.11+.",
        inputSchema: {
          id: z.coerce.number().min(1)
        }
      },
      async (args) => {
        const result = await client.deleteComment(args.id);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      }
    );

    writeTool(
      "restore_deleted",
      {
        description: "Restore a deleted item from the recycle bin. Use the deletion ID from get_recycle_bin (not the original entity ID). Requires admin permissions.",
        inputSchema: {
          deletion_id: z.coerce.number().min(1)
        }
      },
      async (args) => {
        const result = await client.restoreFromRecycleBin(args.deletion_id);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      }
    );

    writeTool(
      "permanently_delete",
      {
        description: "PERMANENTLY destroys a deleted item — this cannot be undone. Use the deletion ID from get_recycle_bin. Requires admin permissions.",
        inputSchema: {
          deletion_id: z.coerce.number().min(1)
        }
      },
      async (args) => {
        const result = await client.destroyFromRecycleBin(args.deletion_id);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      }
    );
  }

}

async function startStdio(config: AppConfig): Promise<void> {
  const server = buildServer(config.read);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BookStack MCP server running on stdio");
}

async function startHttp(config: AppConfig): Promise<void> {
  const port = parseInt(process.env.MCP_HTTP_PORT ?? "8080", 10);
  const host = process.env.MCP_HTTP_HOST ?? "127.0.0.1";
  const mcpPath = process.env.MCP_HTTP_PATH ?? "/mcp";

  // DNS rebinding protection: validate the Host header against an allowlist.
  // Loopback binds default to localhost-only; other binds require an explicit
  // MCP_HTTP_ALLOWED_HOSTS allowlist (comma-separated hostnames, no port).
  const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
  const allowedHostsEnv = process.env.MCP_HTTP_ALLOWED_HOSTS;
  const allowedHosts: string[] | null = allowedHostsEnv
    ? allowedHostsEnv.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)
    : isLoopback
      ? ["localhost", "127.0.0.1", "[::1]"]
      : null;

  const validateHost = (req: IncomingMessage): string | null => {
    if (!allowedHosts) return null; // user opted out by binding non-loopback without allowlist
    const hostHeader = (req.headers.host ?? "").toLowerCase();
    if (!hostHeader) return "Missing Host header";
    const hostname = hostHeader.startsWith("[")
      ? hostHeader.slice(0, hostHeader.indexOf("]") + 1)
      : hostHeader.split(":")[0];
    return allowedHosts.includes(hostname) ? null : `Host '${hostname}' not allowed`;
  };

  const transports: Record<string, StreamableHTTPServerTransport> = {};
  // Per-session auth binding (OAuth mode only): subject + resolved write status, fixed at init.
  const sessionAuth: Record<string, { sub?: string; isWriter: boolean }> = {};

  const readJsonBody = (req: IncomingMessage): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw) return resolve(undefined);
        try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
      });
      req.on("error", reject);
    });

  const sendJson = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const httpServer = createHttpServer(async (req, res) => {
    try {
      const hostError = validateHost(req);
      if (hostError) {
        sendJson(res, 421, { error: "Misdirected Request", message: hostError });
        return;
      }

      // OAuth proxy surface (discovery metadata, DCR, authorize/callback/token).
      if (config.oauth && (await handleOAuthRoutes(req, res, config.oauth))) {
        return;
      }

      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const pathname = url.pathname;

      // Streamable HTTP endpoint (recommended)
      if (pathname === mcpPath) {
        // Enforce the bearer and resolve the caller's authorization when OAuth is enabled.
        let auth: { sub?: string; isWriter: boolean } | null = null;
        if (config.oauth) {
          const result = await validateBearer(req, config.oauth);
          if (!result.ok) {
            sendUnauthorized(res, config.oauth);
            return;
          }
          auth = { sub: result.sub, isWriter: !!result.isWriter };
        }

        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        let transport: StreamableHTTPServerTransport | undefined;
        let parsedBody: unknown;

        if (req.method === "POST") {
          parsedBody = await readJsonBody(req);
        }

        if (sessionId && transports[sessionId]) {
          // Reject a valid token belonging to a different subject than the session was bound to.
          if (config.oauth && sessionAuth[sessionId] && auth?.sub !== sessionAuth[sessionId].sub) {
            sendJson(res, 403, {
              jsonrpc: "2.0",
              error: { code: -32003, message: "Forbidden: token does not match session" },
              id: null
            });
            return;
          }
          transport = transports[sessionId];
        } else if (!sessionId && req.method === "POST" && isInitializeRequest(parsedBody)) {
          // Choose the per-session credential: writers (with a write token configured) get the
          // write token and write tools; everyone else gets the read-only token.
          const useWrite = !!(auth?.isWriter && config.write);
          const sessionConfig = useWrite ? config.write! : config.read;

          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              transports[sid] = transport!;
              if (config.oauth && auth) sessionAuth[sid] = auth;
            }
          });
          transport.onclose = () => {
            const sid = transport!.sessionId;
            if (sid && transports[sid]) delete transports[sid];
            if (sid && sessionAuth[sid]) delete sessionAuth[sid];
          };
          const server = buildServer(sessionConfig);
          await server.connect(transport);
        } else {
          sendJson(res, 400, {
            jsonrpc: "2.0",
            error: { code: -32000, message: "Bad Request: No valid session ID provided" },
            id: null
          });
          return;
        }

        await transport.handleRequest(req, res, parsedBody);
        return;
      }

      // Health check
      if (pathname === "/health" || pathname === "/") {
        sendJson(res, 200, { status: "ok", server: "bookstack-mcp", transport: "http" });
        return;
      }

      sendJson(res, 404, { error: "Not Found" });
    } catch (err) {
      console.error("HTTP handler error:", err);
      if (!res.headersSent) {
        sendJson(res, 500, {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null
        });
      }
    }
  });

  httpServer.listen(port, host, () => {
    console.error(`BookStack MCP server listening on http://${host}:${port}`);
    console.error(`  Streamable HTTP: ${mcpPath}`);
    console.error(
      allowedHosts
        ? `  Allowed Host headers: ${allowedHosts.join(", ")}`
        : `  Host header validation: DISABLED (set MCP_HTTP_ALLOWED_HOSTS to enable)`
    );
  });

  const shutdown = async () => {
    console.error("Shutting down HTTP server...");
    for (const sid of Object.keys(transports)) {
      try { await transports[sid].close(); } catch {}
      delete transports[sid];
    }
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main() {
  const baseUrl = getRequiredEnvVar('BOOKSTACK_BASE_URL');
  const insecureSkipTlsVerify = process.env.BOOKSTACK_INSECURE_SKIP_TLS_VERIFY?.toLowerCase() === 'true';
  const envEnableWrite = process.env.BOOKSTACK_ENABLE_WRITE?.toLowerCase() === 'true';
  const timeoutRaw = process.env.BOOKSTACK_TIMEOUT_MS;
  const timeoutParsed = timeoutRaw ? parseInt(timeoutRaw, 10) : NaN;
  const timeoutMs = Number.isFinite(timeoutParsed) && timeoutParsed > 0 ? timeoutParsed : undefined;

  const oauth = loadOAuthConfig(process.env);
  // Initialize the OAuth broker-state store (Redis when REDIS_URL is set) before
  // the server handles any request, so DCR clients / pending flows / codes persist.
  if (oauth) {
    await initOAuthStore(process.env, oauth.serverUrl);
  }

  // The read-only credential is required. In OAuth mode it always runs read-only (write is
  // reserved for role-bearing sessions on the separate write token); otherwise the legacy
  // BOOKSTACK_ENABLE_WRITE flag governs it.
  const read: BookStackConfig = {
    baseUrl,
    tokenId: getRequiredEnvVar('BOOKSTACK_TOKEN_ID'),
    tokenSecret: getRequiredEnvVar('BOOKSTACK_TOKEN_SECRET'),
    enableWrite: oauth ? false : envEnableWrite,
    insecureSkipTlsVerify,
    timeoutMs
  };

  // The write credential is optional and only used by the OAuth proxy for sessions whose
  // token carries the configured app role.
  const writeTokenId = process.env.BOOKSTACK_WRITE_TOKEN_ID;
  const writeTokenSecret = process.env.BOOKSTACK_WRITE_TOKEN_SECRET;
  const write: BookStackConfig | null = (writeTokenId && writeTokenSecret)
    ? { baseUrl, tokenId: writeTokenId, tokenSecret: writeTokenSecret, enableWrite: true, insecureSkipTlsVerify, timeoutMs }
    : null;

  const config: AppConfig = { read, write, oauth };

  console.error('Initializing BookStack MCP Server...');
  console.error(`BookStack URL: ${baseUrl}`);
  if (oauth) {
    console.error(`Auth: Entra OAuth proxy ENABLED (tenant ${oauth.tenantId})`);
    console.error(`  Public URL: ${oauth.serverUrl}`);
    console.error(`  Write role: ${oauth.writeRole}`);
    if (!write) {
      console.error('  WARNING: no BOOKSTACK_WRITE_TOKEN_ID/SECRET set — all sessions are read-only regardless of role.');
    }
  } else {
    console.error(`Auth: none (token-only mode); Write operations: ${read.enableWrite ? 'ENABLED' : 'DISABLED'}`);
  }
  if (insecureSkipTlsVerify) {
    console.error('WARNING: TLS certificate verification is DISABLED (BOOKSTACK_INSECURE_SKIP_TLS_VERIFY=true). Connections to BookStack are vulnerable to MITM attacks. Use only with trusted self-signed certs on a trusted network.');
  }

  const transportMode = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();
  if (transportMode === "http" || transportMode === "sse") {
    await startHttp(config);
  } else {
    await startStdio(config);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
