# BookStack MCP Server

[![npm version](https://img.shields.io/npm/v/bookstack-mcp)](https://www.npmjs.com/package/bookstack-mcp)
[![CI](https://github.com/ttpears/bookstack-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ttpears/bookstack-mcp/actions/workflows/ci.yml)
[![HOL trust score](https://img.shields.io/endpoint?url=https%3A%2F%2Fhol.org%2Fapi%2Fregistry%2Fbadges%2Fplugin%3Fslug%3Dttpears%252Fbookstack-mcp%26metric%3Dtrust%26style%3Dflat)](https://hol.org/registry/plugins/ttpears%2Fbookstack-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<img src="assets/logo.svg" width="96" align="right" alt="BookStack MCP"/>

Connect an AI assistant to your [BookStack](https://www.bookstackapp.com) wiki through the [Model Context Protocol](https://modelcontextprotocol.io). Search documentation, answer questions with source links, summarize books, and optionally maintain pages and other content.

**Read-only by default.** The server exposes 21 read tools and, when enabled, 22 write tools. BookStack permissions still apply to every API request. Use a dedicated account with access to only the content the assistant should see.

## Quick Start

### 1. Create a BookStack API token

In BookStack, open your profile's **API Tokens** section and create a token for a dedicated user. Its role needs **Access System API** and permission to view the relevant books/pages. Copy both the **Token ID** and **Token Secret**; they are separate values.

Also grant **Export Content** to read WYSIWYG pages as Markdown: BookStack stores no Markdown source for those pages, so the server uses its export endpoint as a fallback. User lookup and recycle-bin tools require additional administrative permissions; ordinary reading does not.

### 2. Choose an installation

| Your setup | Start here |
|---|---|
| Claude Desktop | Install the `.mcpb` bundle from the [latest release](https://github.com/ttpears/bookstack-mcp/releases/latest) under **Settings → Extensions**, then enter the three BookStack settings |
| Claude Code | [Marketplace or direct CLI setup](docs/CLIENTS.md#claude-code) |
| Codex or Gemini CLI | [Native plugin and extension setup](docs/CLIENTS.md#codex) |
| Any local MCP client | Use the stdio configuration below |
| LibreChat / shared Docker service | [Internal HTTP deployment](docs/SETUP.md#internal-http-service) |
| Remote connector with Microsoft sign-in | [HTTPS and Entra OAuth deployment](docs/SETUP.md#public-connector-with-entra-oauth) |

For npm-based installations, use a supported Node.js LTS release (Node 24 recommended; CI also uses Node 22). The published package declares `node >=18`; that minimum is not a recommendation to run an unsupported Node release. Docker includes its own Node runtime.

### 3. Configure a local MCP client

Add this entry to your client's MCP configuration, replacing the example values:

```json
{
  "mcpServers": {
    "bookstack": {
      "command": "npx",
      "args": ["-y", "bookstack-mcp"],
      "env": {
        "BOOKSTACK_BASE_URL": "https://wiki.example.com",
        "BOOKSTACK_TOKEN_ID": "your-token-id",
        "BOOKSTACK_TOKEN_SECRET": "your-token-secret"
      }
    }
  }
}
```

This configuration contains credentials: keep it private and outside version control. For a reviewed, fixed version, replace `bookstack-mcp` with `bookstack-mcp@5.7.1`; otherwise npm resolves the current release when the client starts it.

Restart the client, check that BookStack tools appear, and ask: **“List the books I can access, then find our onboarding guide and link to it.”** This verifies MCP connectivity and BookStack access. Starting `npx` without the required settings fails; starting it in a terminal with settings waits for MCP input rather than opening a web interface.

## Client Configuration

The [client guide](docs/CLIENTS.md) covers Claude Desktop, Claude Code, Codex, Gemini CLI, and LibreChat, including per-user HTTP credential headers. The [configuration reference](docs/CONFIGURATION.md) documents all server settings and the different npm and Docker defaults.

For development from a checkout, see [CONTRIBUTING.md](CONTRIBUTING.md). The server does not automatically read `.env`; use the client's `env` settings, export variables, or explicitly pass Node's `--env-file` option.

## Available Tools

| Task | Tools and behavior |
|---|---|
| Find information | `search_content`, `search_pages`, `find_users`, `get_recent_changes` |
| Read the wiki | List/detail tools for books, chapters, pages, shelves, attachments, and comments; `list_images` |
| Export | `export_page`, `export_book`, `export_chapter` as HTML, Markdown, plaintext, PDF, or ZIP |
| Maintain content | Optional create/update/delete tools, gallery image uploads, and recycle-bin operations |

See the [complete tool reference and recipes](docs/TOOLS.md) for all 43 tool names, pagination, tags, image policies, and version requirements. MCP `tools/list` on your connected server is authoritative for argument schemas and enabled tools.

To enable writes in **non-OAuth** mode, set `BOOKSTACK_ENABLE_WRITE=true` and use a BookStack token with the corresponding permissions. In OAuth mode, writes instead require the configured Entra role and a separate write-token pair. Entra users normally share those BookStack service accounts; sign-in does not automatically give each user their own BookStack identity or private content boundary.

### Editing pages safely

- For HTML/WYSIWYG pages, read `get_page` with `format: "raw"` and update using `html`. The rendered `html` view can remove editor attributes and resolve includes.
- For Markdown pages, read `format: "markdown"` and update using `markdown`. Saving `html` clears the stored Markdown source.
- Tags replace the entire tag list. Omit `tags` to preserve it, or send `[]` to clear it. Read the current list before changing individual tags.
- Read all content chunks before replacing a large page. [Worked examples](docs/TOOLS.md#edit-without-losing-source-or-tags) show the workflow.

## MCP Resources

Clients with resource support can browse `bookstack://book/{id}` for book metadata and `bookstack://page/{id}` for Markdown and page metadata. Both templates provide ID completion through BookStack search.

Four MCP prompts guide read workflows: `answer_from_wiki`, `find_pages`, `summarize_book`, and `recent_changes`. [Prompt arguments](docs/TOOLS.md#resources-and-prompts) are documented alongside the tools. Client support for resources and prompts varies.

## Security

Use HTTPS, keep TLS verification enabled, and protect HTTP services with OAuth or a trusted internal network. HTTP without OAuth has no built-in caller authentication. Set an explicit allowed-host list when exposing a container; a host allowlist is not authentication.

HTTP image downloads require an allowed hostname, and local file uploads are disabled by default. Request bodies, request duration, and session counts are bounded. See [deployment boundaries](docs/CONFIGURATION.md#credentials-and-permissions) and the [security policy](SECURITY.md), including private vulnerability reporting.

The [privacy policy](PRIVACY.md) explains data flows, credentials, OAuth/Redis state, and logging. Your AI client and deployment operator may have additional policies. Use is governed by the [terms](TERMS.md) and [MIT license](LICENSE).

## Documentation

Browse the [documentation index](docs/README.md) for installation, deployment, configuration, tool recipes, troubleshooting, contributions, releases, and [HOL Guard](docs/HOL.md). For a connection problem, start with the [troubleshooting guide](docs/TROUBLESHOOTING.md).

Design background: [Why my BookStack MCP server starts read-only](https://hackyourworld.com/bookstack-mcp-server-read-only-by-default/) describes permission boundaries, shared-token rate limiting, and response-size decisions.
