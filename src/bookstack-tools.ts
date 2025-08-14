import {
  CallToolRequest,
  ListToolsRequest,
  Tool
} from "@modelcontextprotocol/sdk/types.js";
import { BookStackClient } from "./bookstack-client.js";

export class BookStackTools {
  constructor(private client: BookStackClient) {}

  getTools(): Tool[] {
    return [
      {
        name: "search_content",
        description: "Search across BookStack content with advanced filtering",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query. Use BookStack advanced search syntax like {type:page} or {created_by:me}"
            },
            type: {
              type: "string",
              enum: ["book", "page", "chapter", "bookshelf"],
              description: "Filter by content type (automatically adds {type:X} to query)"
            },
            count: {
              type: "number",
              description: "Number of results to return (max 500)",
              maximum: 500
            },
            offset: {
              type: "number", 
              description: "Number of results to skip for pagination"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "search_pages",
        description: "Search specifically for pages with optional book filtering",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query for pages"
            },
            book_id: {
              type: "number",
              description: "Filter results to pages within a specific book"
            },
            count: {
              type: "number",
              description: "Number of results to return (max 500)",
              maximum: 500
            },
            offset: {
              type: "number",
              description: "Number of results to skip for pagination"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "get_books",
        description: "List available books with advanced filtering and sorting",
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
              description: "Number of results to return (default: 50, max: 500)",
              default: 50,
              maximum: 500
            },
            sort: {
              type: "string",
              description: "Sort field (e.g., 'name', '-created_at', 'updated_at')"
            },
            filter: {
              type: "object",
              description: "Filter criteria (e.g., {'owned_by': 1, 'created_at': '>=2024-01-01'})"
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
        description: "List pages with advanced filtering by book, chapter, and custom criteria",
        inputSchema: {
          type: "object",
          properties: {
            book_id: {
              type: "number",
              description: "Filter by book ID"
            },
            chapter_id: {
              type: "number", 
              description: "Filter by chapter ID"
            },
            offset: {
              type: "number",
              description: "Pagination offset (default: 0)",
              default: 0
            },
            count: {
              type: "number",
              description: "Number of results to return (default: 50, max: 500)",
              default: 50,
              maximum: 500
            },
            sort: {
              type: "string",
              description: "Sort field (e.g., 'name', '-updated_at', 'created_at')"
            },
            filter: {
              type: "object",
              description: "Additional filter criteria"
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

  async handleToolCall(request: CallToolRequest): Promise<any> {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("Missing arguments in tool call");
    }

    try {
      switch (name) {
        case "search_content":
          const searchResults = await this.client.searchContent(args.query as string, {
            type: args.type as any,
            count: args.count as number,
            offset: args.offset as number
          });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(searchResults, null, 2)
            }]
          };

        case "search_pages":
          const pageResults = await this.client.searchPages(args.query as string, {
            bookId: args.book_id as number,
            count: args.count as number,
            offset: args.offset as number
          });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(pageResults, null, 2)
            }]
          };

        case "get_books":
          const books = await this.client.getBooks({
            offset: args.offset as number,
            count: args.count as number,
            sort: args.sort as string,
            filter: args.filter as Record<string, any>
          });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(books, null, 2)
            }]
          };

        case "get_book":
          const book = await this.client.getBook(args.id as number);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(book, null, 2)
            }]
          };

        case "get_pages":
          const pages = await this.client.getPages({
            bookId: args.book_id as number,
            chapterId: args.chapter_id as number,
            offset: args.offset as number,
            count: args.count as number,
            sort: args.sort as string,
            filter: args.filter as Record<string, any>
          });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(pages, null, 2)
            }]
          };

        case "get_page":
          const page = await this.client.getPage(args.id as number);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(page, null, 2)
            }]
          };

        case "get_chapters":
          const chapters = await this.client.getChapters(args.book_id as number, args.offset as number, args.count as number);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(chapters, null, 2)
            }]
          };

        case "get_chapter":
          const chapter = await this.client.getChapter(args.id as number);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(chapter, null, 2)
            }]
          };

        case "create_page":
          const newPage = await this.client.createPage({
            name: args.name as string,
            book_id: args.book_id as number,
            chapter_id: args.chapter_id as number,
            html: args.html as string,
            markdown: args.markdown as string
          });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(newPage, null, 2)
            }]
          };

        case "update_page":
          const updatedPage = await this.client.updatePage(args.id as number, {
            name: args.name as string,
            html: args.html as string,
            markdown: args.markdown as string
          });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(updatedPage, null, 2)
            }]
          };

        case "export_page":
          const exportedContent = await this.client.exportPage(args.id as number, args.format as "html" | "pdf" | "markdown" | "plaintext");
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