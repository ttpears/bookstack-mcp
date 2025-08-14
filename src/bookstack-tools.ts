import {
  CallToolRequest,
  ListToolsRequest,
  Tool
} from "@modelcontextprotocol/sdk/types.js";
import { BookStackClient } from "./bookstack-client.js";

export class BookStackTools {
  constructor(private client: BookStackClient, private enableWrite: boolean = false) {}

  getTools(): Tool[] {
    const readOnlyTools: Tool[] = [
      {
        name: "get_capabilities",
        description: "Get information about available BookStack MCP capabilities and current configuration",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: "search_content",
        description: "Search across BookStack content with contextual previews and location info. Use for queries like 'find content', 'search for', etc.",
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
        description: "List available books with advanced filtering and sorting. Use for 'show books', 'list books', 'get all books', etc.",
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
        description: "List pages with content previews, word counts, and contextual information. Use for 'show pages', 'latest pages', 'recent pages', 'get pages from book', etc.",
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
        description: "List chapters, optionally filtered by book. Use for 'show chapters', 'list chapters', 'get chapters from book', etc.",
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
        name: "export_page",
        description: "Export a page in various formats (PDF/ZIP provide direct BookStack download URLs)",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Page ID"
            },
            format: {
              type: "string",
              enum: ["html", "pdf", "markdown", "plaintext", "zip"],
              description: "Export format (pdf and zip return base64-encoded binary data)"
            }
          },
          required: ["id", "format"]
        }
      },
      {
        name: "export_book",
        description: "Export a book in various formats (PDF/ZIP provide direct BookStack download URLs)",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Book ID"
            },
            format: {
              type: "string",
              enum: ["html", "pdf", "markdown", "plaintext", "zip"],
              description: "Export format (pdf and zip return base64-encoded binary data)"
            }
          },
          required: ["id", "format"]
        }
      },
      {
        name: "export_chapter",
        description: "Export a chapter in various formats (PDF/ZIP provide direct BookStack download URLs)",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Chapter ID"
            },
            format: {
              type: "string",
              enum: ["html", "pdf", "markdown", "plaintext", "zip"],
              description: "Export format (pdf and zip return base64-encoded binary data)"
            }
          },
          required: ["id", "format"]
        }
      },
      {
        name: "get_recent_changes",
        description: "Get recently updated content with contextual previews and change descriptions. Perfect for 'latest changes', 'recent updates', 'what's new', etc.",
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["all", "page", "book", "chapter"],
              description: "Filter by content type (default: all)",
              default: "all"
            },
            limit: {
              type: "number",
              description: "Number of recent items to return (default: 20, max: 100)",
              default: 20,
              maximum: 100
            },
            days: {
              type: "number",
              description: "Number of days back to look for changes (default: 30)",
              default: 30
            }
          }
        }
      },
      {
        name: "get_shelves",
        description: "List available book shelves (collections) with filtering and sorting. Use for 'show shelves', 'list collections', etc.",
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
              description: "Sort field (e.g., 'name', '-updated_at', 'created_at')"
            },
            filter: {
              type: "object",
              description: "Filter criteria"
            }
          }
        }
      },
      {
        name: "get_shelf",
        description: "Get details of a specific book shelf (collection) including all books",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Shelf ID"
            }
          },
          required: ["id"]
        }
      },
      {
        name: "get_attachments",
        description: "List attachments (files and links) with filtering and sorting. Use for 'show attachments', 'list files', etc.",
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
              description: "Sort field (e.g., 'name', '-updated_at', 'created_at')"
            },
            filter: {
              type: "object",
              description: "Filter criteria (e.g., {'uploaded_to': 123, 'external': false})"
            }
          }
        }
      },
      {
        name: "get_attachment",
        description: "Get details of a specific attachment including download links",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Attachment ID"
            }
          },
          required: ["id"]
        }
      }
    ];

    const writeTools: Tool[] = [
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
        name: "create_shelf",
        description: "Create a new book shelf (collection) to organize books",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Shelf name"
            },
            description: {
              type: "string",
              description: "Optional: Shelf description"
            },
            books: {
              type: "array",
              items: {
                type: "number"
              },
              description: "Optional: Array of book IDs to add to the shelf"
            },
            tags: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  value: { type: "string" }
                }
              },
              description: "Optional: Tags for the shelf"
            }
          },
          required: ["name"]
        }
      },
      {
        name: "update_shelf",
        description: "Update an existing book shelf (collection)",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Shelf ID"
            },
            name: {
              type: "string",
              description: "Optional: New shelf name"
            },
            description: {
              type: "string",
              description: "Optional: New shelf description"
            },
            books: {
              type: "array",
              items: {
                type: "number"
              },
              description: "Optional: Array of book IDs for the shelf"
            },
            tags: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  value: { type: "string" }
                }
              },
              description: "Optional: Tags for the shelf"
            }
          },
          required: ["id"]
        }
      },
      {
        name: "delete_shelf",
        description: "Delete a book shelf (collection)",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Shelf ID"
            }
          },
          required: ["id"]
        }
      },
      {
        name: "create_attachment",
        description: "Create a new attachment (link attachment) to a page",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Attachment name"
            },
            uploaded_to: {
              type: "number",
              description: "Page ID where attachment will be attached"
            },
            link: {
              type: "string",
              description: "URL for link attachments"
            }
          },
          required: ["name", "uploaded_to", "link"]
        }
      },
      {
        name: "update_attachment",
        description: "Update an existing attachment",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Attachment ID"
            },
            name: {
              type: "string",
              description: "Optional: New attachment name"
            },
            link: {
              type: "string",
              description: "Optional: New URL for link attachments"
            },
            uploaded_to: {
              type: "number",
              description: "Optional: Move attachment to different page"
            }
          },
          required: ["id"]
        }
      },
      {
        name: "delete_attachment",
        description: "Delete an attachment",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Attachment ID"
            }
          },
          required: ["id"]
        }
      }
    ];

    // Only include write tools if explicitly enabled
    return this.enableWrite ? [...readOnlyTools, ...writeTools] : readOnlyTools;
  }

  async handleToolCall(request: CallToolRequest): Promise<any> {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("Missing arguments in tool call");
    }

    try {
      switch (name) {
        case "get_capabilities":
          const capabilities = {
            server_name: "BookStack MCP Server",
            version: "1.0.0",
            write_operations_enabled: this.enableWrite,
            available_tools: {
              read_operations: [
                "get_capabilities - Show this capability information",
                "search_content - Advanced search with filtering and BookStack syntax",
                "search_pages - Search specifically for pages with book filtering",
                "get_recent_changes - Get recently updated content (perfect for 'latest changes')",
                "get_books - List books with filtering, sorting, and pagination",
                "get_book - Get detailed information about a specific book", 
                "get_pages - List pages with advanced filtering options",
                "get_page - Get full content of a specific page",
                "get_chapters - List chapters with filtering options",
                "get_chapter - Get details of a specific chapter",
                "get_shelves - List book shelves (collections) for organizing books",
                "get_shelf - Get details of a specific shelf including all books",
                "get_attachments - List attachments (files and links) with filtering",
                "get_attachment - Get attachment details including download links",
                "export_page - Export pages in multiple formats with proper binary handling",
                "export_book - Export entire books in multiple formats with proper binary handling",
                "export_chapter - Export chapters in multiple formats with proper binary handling"
              ],
              write_operations: this.enableWrite ? [
                "create_page - Create new pages in BookStack",
                "update_page - Update existing pages",
                "create_shelf - Create new book shelves (collections)",
                "update_shelf - Update existing shelves and their book assignments",
                "delete_shelf - Delete book shelves",
                "create_attachment - Create new link attachments to pages",
                "update_attachment - Update existing attachments",
                "delete_attachment - Delete attachments"
              ] : [
                "❌ DISABLED - Write operations are currently disabled",
                "ℹ️  To enable: Set BOOKSTACK_ENABLE_WRITE=true in environment variables"
              ]
            },
            advanced_features: [
              "BookStack advanced search syntax: {type:page}, {book_id:5}, {created_by:me}",
              "Embedded clickable URLs in all responses for direct BookStack access",
              "Pagination support up to 500 results per request", 
              "Multi-criteria filtering and custom sorting",
              "Export capabilities in multiple formats"
            ],
            natural_language_examples: [
              "Say 'Get the latest changes from bookstack' to search recent content with previews",
              "Say 'Show me recent pages' to list recently updated pages with context",
              "Say 'What books are available?' to get the book list with descriptions",
              "Say 'Find pages about authentication' to search content with previews",
              "Say 'Show chapters in the user guide' to list specific chapters with summaries"
            ],
            response_enhancements: [
              "Content previews: All responses include meaningful text previews (150-200 chars)",
              "Human-friendly dates: 'Updated 2 hours ago' instead of timestamps",
              "Contextual location: 'In Book: User Guide, Chapter: Authentication'", 
              "Change summaries: Descriptive explanations of what was updated",
              "Word counts and content metrics for pages",
              "Rich metadata: Creation dates, update history, author info"
            ],
            security_note: this.enableWrite 
              ? "⚠️  Write operations are ENABLED - AI can create and modify BookStack content"
              : "🛡️  Read-only mode - Safe for production use"
          };
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify(capabilities, null, 2)
            }]
          };

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
          const exportedContent = await this.client.exportPage(args.id as number, args.format as "html" | "pdf" | "markdown" | "plaintext" | "zip");
          
          // Validate that we have content
          if (!exportedContent) {
            throw new Error(`Export returned empty content for page ${args.id} in ${args.format} format`);
          }
          
          // Handle binary formats (PDF, ZIP) with direct BookStack URLs
          if (typeof exportedContent === 'object' && exportedContent.download_url && exportedContent.direct_download) {
            const format = (args.format as string).toUpperCase();
            
            return {
              content: [
                {
                  type: "text",
                  text: `✅ **${format} Export Ready**\n\n` +
                        `📄 **Page:** ${exportedContent.page_name}\n` +
                        `📚 **Book:** ${exportedContent.book_name}\n` +
                        `📁 **File:** ${exportedContent.filename}\n` +
                        `🔗 **Type:** ${exportedContent.content_type}\n\n` +
                        `🚀 **Direct Download Link:**\n` +
                        `${exportedContent.download_url}\n\n` +
                        `ℹ️  **Note:** ${exportedContent.note}`
                }
              ]
            };
          }
          
          // Handle text formats 
          const contentText = typeof exportedContent === 'string' ? exportedContent : JSON.stringify(exportedContent, null, 2);
          
          if (!contentText || contentText.trim().length === 0) {
            throw new Error(`Export produced empty content for page ${args.id} in ${args.format} format`);
          }
          
          return {
            content: [{
              type: "text",
              text: contentText
            }]
          };

        case "export_book":
          const exportedBook = await this.client.exportBook(args.id as number, args.format as "html" | "pdf" | "markdown" | "plaintext" | "zip");
          
          // Handle binary formats with direct BookStack URLs
          if (typeof exportedBook === 'object' && exportedBook.download_url && exportedBook.direct_download) {
            const format = (args.format as string).toUpperCase();
            
            return {
              content: [
                {
                  type: "text",
                  text: `✅ **${format} Book Export Ready**\n\n` +
                        `📚 **Book:** ${exportedBook.book_name}\n` +
                        `📁 **File:** ${exportedBook.filename}\n` +
                        `🔗 **Type:** ${exportedBook.content_type}\n\n` +
                        `🚀 **Direct Download Link:**\n` +
                        `${exportedBook.download_url}\n\n` +
                        `ℹ️  **Note:** ${exportedBook.note}`
                }
              ]
            };
          }
          
          return {
            content: [{
              type: "text",
              text: typeof exportedBook === 'string' ? exportedBook : JSON.stringify(exportedBook, null, 2)
            }]
          };

        case "export_chapter":
          const exportedChapter = await this.client.exportChapter(args.id as number, args.format as "html" | "pdf" | "markdown" | "plaintext" | "zip");
          
          // Handle binary formats with direct BookStack URLs
          if (typeof exportedChapter === 'object' && exportedChapter.download_url && exportedChapter.direct_download) {
            const format = (args.format as string).toUpperCase();
            
            return {
              content: [
                {
                  type: "text",
                  text: `✅ **${format} Chapter Export Ready**\n\n` +
                        `📖 **Chapter:** ${exportedChapter.chapter_name}\n` +
                        `📚 **Book:** ${exportedChapter.book_name}\n` +
                        `📁 **File:** ${exportedChapter.filename}\n` +
                        `🔗 **Type:** ${exportedChapter.content_type}\n\n` +
                        `🚀 **Direct Download Link:**\n` +
                        `${exportedChapter.download_url}\n\n` +
                        `ℹ️  **Note:** ${exportedChapter.note}`
                }
              ]
            };
          }
          
          return {
            content: [{
              type: "text",
              text: typeof exportedChapter === 'string' ? exportedChapter : JSON.stringify(exportedChapter, null, 2)
            }]
          };

        case "get_recent_changes":
          const recentChanges = await this.client.getRecentChanges({
            type: args.type as "all" | "page" | "book" | "chapter",
            limit: args.limit as number,
            days: args.days as number
          });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(recentChanges, null, 2)
            }]
          };

        case "get_shelves":
          const shelves = await this.client.getShelves({
            offset: args.offset as number,
            count: args.count as number,
            sort: args.sort as string,
            filter: args.filter as Record<string, any>
          });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(shelves, null, 2)
            }]
          };

        case "get_shelf":
          const shelf = await this.client.getShelf(args.id as number);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(shelf, null, 2)
            }]
          };

        case "create_shelf":
          const newShelf = await this.client.createShelf({
            name: args.name as string,
            description: args.description as string,
            books: args.books as number[],
            tags: args.tags as any[]
          });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(newShelf, null, 2)
            }]
          };

        case "update_shelf":
          const updatedShelf = await this.client.updateShelf(args.id as number, {
            name: args.name as string,
            description: args.description as string,
            books: args.books as number[],
            tags: args.tags as any[]
          });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(updatedShelf, null, 2)
            }]
          };

        case "delete_shelf":
          const deleteResult = await this.client.deleteShelf(args.id as number);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(deleteResult, null, 2)
            }]
          };

        case "get_attachments":
          const attachments = await this.client.getAttachments({
            offset: args.offset as number,
            count: args.count as number,
            sort: args.sort as string,
            filter: args.filter as Record<string, any>
          });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(attachments, null, 2)
            }]
          };

        case "get_attachment":
          const attachment = await this.client.getAttachment(args.id as number);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(attachment, null, 2)
            }]
          };

        case "create_attachment":
          const newAttachment = await this.client.createAttachment({
            name: args.name as string,
            uploaded_to: args.uploaded_to as number,
            link: args.link as string
          });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(newAttachment, null, 2)
            }]
          };

        case "update_attachment":
          const updatedAttachment = await this.client.updateAttachment(args.id as number, {
            name: args.name as string,
            link: args.link as string,
            uploaded_to: args.uploaded_to as number
          });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(updatedAttachment, null, 2)
            }]
          };

        case "delete_attachment":
          const deleteAttachmentResult = await this.client.deleteAttachment(args.id as number);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(deleteAttachmentResult, null, 2)
            }]
          };


        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error('BookStack tool error:', error);
      
      // Ensure we always return a valid response structure
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        content: [{
          type: "text",
          text: `BookStack Error: ${errorMessage}\n\nTool: ${name}\nArguments: ${JSON.stringify(args, null, 2)}`
        }],
        isError: true
      };
    }
  }
}