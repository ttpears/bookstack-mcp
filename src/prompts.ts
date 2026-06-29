// MCP prompts for BookStack — one-click actions surfaced in Claude's connector menu
// (and any prompts-capable MCP client). Content-oriented and read-only: each prompt just
// returns a templated instruction that drives the existing read tools. No per-user
// identity is assumed (the connector uses a shared service token).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Small helper: a prompt handler returns a single user message.
function userMessage(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "answer_from_wiki",
    {
      title: "Answer from the wiki",
      description: "Answer a question using the BookStack wiki, with citations and links.",
      argsSchema: {
        question: z.string().describe("The question to answer from the wiki")
      }
    },
    async ({ question }) =>
      userMessage(
        `Answer this question using the BookStack wiki: "${question}".\n\n` +
          `Use search_content to find the most relevant pages, read the top matches with ` +
          `get_page, then answer concisely. Cite each source by page name with its URL. ` +
          `If the wiki has nothing relevant, say so rather than guessing.`
      )
  );

  server.registerPrompt(
    "find_pages",
    {
      title: "Find pages about a topic",
      description: "List BookStack pages matching a topic, with previews and links.",
      argsSchema: {
        topic: z.string().describe("Topic or keywords to search for")
      }
    },
    async ({ topic }) =>
      userMessage(
        `Find BookStack pages about "${topic}" using search_content (and search_pages if ` +
          `helpful). Return a ranked list — for each result give the page name, a one-line ` +
          `preview, and its URL. Do not read full page contents unless I ask.`
      )
  );

  server.registerPrompt(
    "summarize_book",
    {
      title: "Summarize a book",
      description: "Produce a structured summary of a BookStack book with section links.",
      argsSchema: {
        book: z.string().describe("Book name or numeric id")
      }
    },
    async ({ book }) =>
      userMessage(
        `Summarize the BookStack book "${book}".\n\n` +
          `If that is a name rather than a numeric id, first find it with search_content ` +
          `using {type:book}. Then use get_book and get_pages to read its chapters and pages, ` +
          `and produce a structured summary (overview, then key points per chapter/section). ` +
          `Include a link to the book and to the sections you reference.`
      )
  );

  server.registerPrompt(
    "recent_changes",
    {
      title: "What changed recently",
      description: "Summarize recently created or updated wiki content.",
      argsSchema: {
        days: z.string().optional().describe("How many days back to look (default 30)")
      }
    },
    async ({ days }) =>
      userMessage(
        `Summarize what changed in the BookStack wiki in the last ${days || "30"} days using ` +
          `get_recent_changes. Group the changes by book (and note the type — page, chapter, ` +
          `book), and include a link to each changed item. Highlight anything that looks ` +
          `significant.`
      )
  );
}
