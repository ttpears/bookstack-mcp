import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from "@modelcontextprotocol/sdk/types.js";
import { BookStackClient } from "./bookstack-client.js";

export class BookStackTools {
  constructor(private client: BookStackClient) {}

  getTools(): Tool[] {
    return [
      {
        name: "search_content",
        description: "Search across BookStack content (books, pages, chapters)",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query"
            },
            type: {
              type: "string",
              enum: ["book", "page", "chapter"],
              description: "Optional: Filter by content type"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "get_books",
        description: "List available books",
        inputSchema: {
          type: "object",
          properties: {
            offset: {
              type: "number",
              description: "Pagination offset (default: 0)",
              default: 0
            },
            count: {
              type: "number",
              description: "Number of results to return (default: 50)",
              default: 50
            }
          }
        }
      },
      {
        name: "get_book",
        description: "Get details of a specific book",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Book ID"
            }
          },
          required: ["id"]
        }
      },
      {
        name: "get_pages",
        description: "List pages, optionally filtered by book",
        inputSchema: {
          type: "object",
          properties: {
            book_id: {
              type: "number",
              description: "Optional: Filter by book ID"
            },
            offset: {
              type: "number",
              description: "Pagination offset (default: 0)",
              default: 0
            },
            count: {
              type: "number",
              description: "Number of results to return (default: 50)",
              default: 50
            }
          }
        }
      },
      {
        name: "get_page",
        description: "Get content of a specific page",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Page ID"
            }
          },
          required: ["id"]
        }
      },
      {
        name: "get_chapters",
        description: "List chapters, optionally filtered by book",
        inputSchema: {
          type: "object",
          properties: {
            book_id: {
              type: "number",
              description: "Optional: Filter by book ID"
            },
            offset: {
              type: "number",
              description: "Pagination offset (default: 0)",
              default: 0
            },
            count: {
              type: "number",
              description: "Number of results to return (default: 50)",
              default: 50
            }
          }
        }
      },
      {
        name: "get_chapter",
        description: "Get details of a specific chapter",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Chapter ID"
            }
          },
          required: ["id"]
        }
      },
      {
        name: "create_page",
        description: "Create a new page in BookStack",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Page name"
            },
            book_id: {
              type: "number",
              description: "Book ID where the page will be created"
            },
            chapter_id: {
              type: "number",
              description: "Optional: Chapter ID if page should be in a chapter"
            },
            html: {
              type: "string",
              description: "Optional: HTML content"
            },
            markdown: {
              type: "string",
              description: "Optional: Markdown content"
            }
          },
          required: ["name", "book_id"]
        }
      },
      {
        name: "update_page",
        description: "Update an existing page",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Page ID"
            },
            name: {
              type: "string",
              description: "Optional: New page name"
            },
            html: {
              type: "string",
              description: "Optional: New HTML content"
            },
            markdown: {
              type: "string",
              description: "Optional: New Markdown content"
            }
          },
          required: ["id"]
        }
      },
      {
        name: "export_page",
        description: "Export a page in various formats",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Page ID"
            },
            format: {
              type: "string",
              enum: ["html", "pdf", "markdown", "plaintext"],
              description: "Export format"
            }
          },
          required: ["id", "format"]
        }
      }
    ];
  }

  async handleToolCall(request: CallToolRequestSchema): Promise<any> {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "search_content":
          const searchResults = await this.client.searchContent(args.query, args.type);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(searchResults, null, 2)
            }]
          };

        case "get_books":
          const books = await this.client.getBooks(args.offset, args.count);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(books, null, 2)
            }]
          };

        case "get_book":
          const book = await this.client.getBook(args.id);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(book, null, 2)
            }]
          };

        case "get_pages":
          const pages = await this.client.getPages(args.book_id, args.offset, args.count);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(pages, null, 2)
            }]
          };

        case "get_page":
          const page = await this.client.getPage(args.id);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(page, null, 2)
            }]
          };

        case "get_chapters":
          const chapters = await this.client.getChapters(args.book_id, args.offset, args.count);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(chapters, null, 2)
            }]
          };

        case "get_chapter":
          const chapter = await this.client.getChapter(args.id);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(chapter, null, 2)
            }]
          };

        case "create_page":
          const newPage = await this.client.createPage({
            name: args.name,
            book_id: args.book_id,
            chapter_id: args.chapter_id,
            html: args.html,
            markdown: args.markdown
          });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(newPage, null, 2)
            }]
          };

        case "update_page":
          const updatedPage = await this.client.updatePage(args.id, {
            name: args.name,
            html: args.html,
            markdown: args.markdown
          });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(updatedPage, null, 2)
            }]
          };

        case "export_page":
          const exportedContent = await this.client.exportPage(args.id, args.format);
          return {
            content: [{
              type: "text",
              text: exportedContent
            }]
          };

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
}