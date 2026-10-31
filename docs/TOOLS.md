# Tools and recipes

[Documentation index](README.md) · [Configuration](CONFIGURATION.md) · [Client setup](CLIENTS.md)

This is a task-oriented companion to MCP `tools/list`, which provides the exact schemas for your running version. Examples below are **tool argument objects**, not raw HTTP or JSON-RPC envelopes. Replace sample IDs with IDs returned by your wiki. Numeric parameters generally accept numbers or numeric strings.

## Read tools

These 21 tools are registered in read-only mode. BookStack permissions can still deny individual calls.

| Tool | Purpose / key arguments |
|---|---|
| `search_content` | Full-text search: `query`, optional `type`, `count`, `offset` |
| `search_pages` | Page search: `query`, optional `book_id`, `count`, `offset` |
| `get_books` / `get_book` | List books with pagination/filter/sort; read one by `id` |
| `get_pages` / `get_page` | List by book/chapter; read one in a selected format with content pagination |
| `get_chapters` / `get_chapter` | List chapters, optionally by `book_id`; read one by `id` |
| `get_shelves` / `get_shelf` | List shelves; read a shelf and its books |
| `get_attachments` / `get_attachment` | List files/links; get metadata and a `download_url` |
| `get_comments` / `get_comment` | List, optionally by `page_id`; read a comment (BookStack v25.11+) |
| `list_images` | List gallery images, optionally by `uploaded_to` page ID |
| `find_users` | Resolve partial name/email/slug to a user slug; requires administrative access |
| `get_recycle_bin` | List deletions; requires administrative access |
| `export_page` / `export_book` / `export_chapter` | Export by `id` and `format` |
| `get_recent_changes` | Recently updated content; `type`, `days`, `limit` |

Most list tools default to `offset: 0`, `count: 50`, with count capped at 500 where specified by the schema. `get_recent_changes` defaults to 30 days and 20 results, with a maximum limit of 100. `sort` and `filter` use the underlying BookStack API syntax; check your instance's `/api/docs` for supported fields.

## Write tools

These 22 tools appear only when [write-mode requirements](CONFIGURATION.md#credentials-and-permissions) are met. Tool visibility is not a grant of BookStack permission.

| Tool | Purpose / important behavior |
|---|---|
| `create_book` / `update_book` / `delete_book` | Manage books; deletion goes to the recycle bin |
| `create_chapter` / `update_chapter` / `delete_chapter` | Manage chapters, move via `book_id`, reorder via `priority` |
| `create_page` / `update_page` / `delete_page` | Manage page source, location, tags, and revision summary |
| `create_shelf` / `update_shelf` / `delete_shelf` | Manage shelf metadata and book membership |
| `create_attachment` / `update_attachment` / `delete_attachment` | Create **link** attachments, update metadata, or delete; not binary file upload |
| `create_image` / `delete_image` | Upload gallery image bytes from a file/URL, or delete an image and thumbnails |
| `create_comment` / `update_comment` / `delete_comment` | Comment HTML, threaded replies, archive/unarchive (v25.11+) |
| `restore_deleted` / `permanently_delete` | Use a recycle-bin `deletion_id`; administrative permissions required |

## Find and read documentation

Start with a targeted search, then fetch only the relevant pages:

```json
{"query": "onboarding {type:page}", "count": 10, "offset": 0}
```

Pass this to `search_content`. For pages in a known book, use `search_pages`:

```json
{"query": "deployment", "book_id": 12, "count": 10}
```

For author filters, BookStack expects a **user slug** or `me`, not a numeric user ID: `"{created_by:jane-doe}"`, `"{updated_by:me}"`, or `"{owned_by:jane-doe}"`. Use `find_users` if your account can access user lookup; otherwise obtain the slug from an administrator. Numeric author filters are rejected to avoid misleading results. `me` refers to the effective BookStack token account, which may be shared by many connector users.

List pagination and content pagination are separate. To continue a result list, advance `offset` by the number of returned entries until the list is exhausted. A search/list response is a preview, not the complete page body.

### Read a large page

Call `get_page`:

```json
{"id": 42, "format": "markdown", "offset": 0, "limit": 20000}
```

The response has `content`, `content_format`, `content_total_chars`, `content_offset`, `content_returned_chars`, `content_truncated`, and `content_next_offset`. If `content_next_offset` is not `null`, use it for the next call with the same format. Repeat until `null`. Offsets use JavaScript string positions, not byte counts or model tokens; use the returned offset rather than estimating it.

The default content limit is 50,000 characters, maximum 200,000. Supported formats are `markdown` (default), `html`, `text`, and `raw`. WYSIWYG pages use a Markdown export fallback when needed, requiring **Export Content** permission.

## Edit without losing source or tags

Read the current page and inspect `editor` before editing. Fetch every content chunk, and check for concurrent changes before saving a replacement. Updates replace the supplied source; they are not patches or automatic merges.

| Page editor | Read with `get_page` | Write with `update_page` |
|---|---|---|
| HTML/WYSIWYG | `format: "raw"` | `html` containing the complete revised editor source |
| Markdown | `format: "markdown"` | `markdown` containing the complete revised Markdown |

`format: "html"` is the rendered reader view: includes may be expanded and editor attributes filtered out. Saving it can lose those original structures. For Markdown pages, saving any `html` clears the stored Markdown source. Send one source format appropriate to the editor.

For example, update a Markdown page after reading its complete source:

```json
{"id": 42, "markdown": "# Onboarding\n\nThe complete revised page content goes here.", "changelog": "Clarify the first-day checklist"}
```

`changelog` is optional, 1–180 characters, on both `create_page` and `update_page`. BookStack v26.09+ saves it in page history; older versions ignore it.

### Update tags only

Read the existing tags, then send the complete desired list to `update_page` or `update_book`:

```json
{"id": 42, "tags": [{"name": "Environment", "value": "Production"}, {"name": "Reviewed", "value": ""}]}
```

Omitting `tags` preserves them; `tags: []` removes all. An empty `value` makes a name-only tag. Page tag-only updates need no `html` or `markdown` and preserve editor source. Book, chapter, page, and shelf create/update tools support tags; retain every tag you intend to keep when supplying a replacement.

### Create, move, or reorder

Create a Markdown page with `create_page`:

```json
{"name": "Deployment checklist", "book_id": 12, "chapter_id": 7, "markdown": "# Deployment checklist\n\n- Verify backups\n- Verify health"}
```

Move a page to a book's top level with `update_page`:

```json
{"id": 42, "book_id": 12, "chapter_id": 0, "priority": 10}
```

To move into a chapter, provide that chapter's ID and its book ID. `priority` is a non-negative integer; lower values sort first. `update_chapter` also supports `book_id` and `priority`.

## Upload a gallery image

Call `create_image` with an existing page ID and **exactly one** source:

```json
{"url": "https://images.example.com/architecture.png", "uploaded_to": 42, "name": "Architecture overview"}
```

For a local stdio client, the source can instead be `"file_path": "/absolute/path/architecture.png"`. Paths are resolved on the MCP server. Uploading to a remote server does not read the user's local filesystem.

PNG, JPEG, GIF, WebP, and SVG are supported up to 50 MiB. The response includes BookStack's hosted URL, thumbnails, and `content.html` / `content.markdown` snippets for insertion into the page. Uploading the image does not itself insert it into page source; perform a separate page update.

HTTP URL sources require `BOOKSTACK_IMAGE_ALLOWED_HOSTS=images.example.com` (including every redirect destination). HTTP local files require an explicit opt-in. Source downloads never receive the BookStack token. BookStack can impose smaller upload limits. `delete_image` deletes the image and its thumbnails and can break existing page references.

## Exports, attachments, comments, and recovery

- **Export:** pass `{"id": 42, "format": "pdf"}` to `export_page`, or use `html`, `markdown`, `plaintext`, or `zip`. Text formats return content; PDF/ZIP return BookStack web download URLs, which may require a separate browser login. A URL is not a downloaded local file.
- **Link attachment:** `create_attachment` takes `name`, `uploaded_to`, and `link`. File attachments already in BookStack can be listed/read, but this create tool adds URLs rather than uploading file bytes.
- **Comment:** `create_comment` takes `page_id` and `html`; use `parent_id` to reply. `update_comment` can change `html` or set `archived` to `true`/`false`. These endpoints require BookStack v25.11+.
- **Recovery:** get the **deletion ID** from `get_recycle_bin`, then call `restore_deleted` with `{"deletion_id": 123}`. This is not the original page/book/chapter ID. `permanently_delete` uses the same deletion ID and is irreversible. Do not assume attachments, images, or comments have the same recovery path as pages.

## Resources and prompts

| Resource template | Content |
|---|---|
| `bookstack://book/{id}` | Book metadata as JSON |
| `bookstack://page/{id}` | Markdown and page metadata |

Both templates provide ID completion through search. They use the same BookStack access as tools.

| MCP prompt | Arguments | Workflow |
|---|---|---|
| `answer_from_wiki` | `question` | Search, read, answer with citations |
| `find_pages` | `topic` | Ranked search results with previews and URLs |
| `summarize_book` | `book` (name or ID) | Structured book summary with source links |
| `recent_changes` | Optional `days` (string, default `"30"`) | Summarize recent updates |

Prompts return instructions for the assistant; they do not independently fetch all the content or enable writes. Resource and prompt menus depend on the client.
