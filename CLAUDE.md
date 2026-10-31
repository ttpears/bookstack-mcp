# Repository guidance for Claude Code

BookStack MCP is a TypeScript MCP server published as `bookstack-mcp`. Use [CONTRIBUTING.md](CONTRIBUTING.md) for development and [docs/README.md](docs/README.md) for user-facing documentation. Version and dependency declarations in `package.json` are authoritative.

## Commands

```bash
npm ci
npm run type-check
npm test
npm run build
python3 -m unittest discover -s scripts -p 'test_report_hol.py'
node scripts/check-plugin.mjs
```

Use Node 24 LTS or Node 22 for development. `npm run dev` starts `tsx src/index.ts`; it neither loads `.env` nor watches files. Use `node --env-file=.env --import tsx src/index.ts` when local configuration is needed, against a disposable wiki. Compiled output is in `dist/`; do not commit it.

## Architecture and implementation

- `src/index.ts` builds the MCP server, tools/resources, transports, and HTTP boundary.
- `src/bookstack-client.ts` wraps the BookStack API and shapes responses.
- `src/oauth/` holds Entra validation, broker routes, and in-memory/Redis stores.
- `src/session-registry.ts`, `src/request-credentials.ts`, and `src/image-source.ts` enforce session, credential, and upload boundaries.
- `src/util/` contains safe errors, bounded body reads, request budgets, and concurrency controls.
- `src/prompts.ts` supplies read-workflow instructions.

Add new read/write tools through the existing `readTool`/`writeTool` helpers so annotations and safe error handling remain consistent. Use `z.coerce.number()` for numeric client parameters, with integer/range validation where the field requires it. Keep tool JSON responses compact. Do not restore removed redundant fields or make per-result API calls just to enrich list output.

Write tools are registered only for a write-enabled server configuration. Non-OAuth mode uses `BOOKSTACK_ENABLE_WRITE`; HTTP OAuth mode selects a shared read/write BookStack service account by validated subject/role. Preserve authorization checks on every reused-session request and opt-in request credentials. Redis stores broker state, not live MCP sessions.

When editing pages, preserve the editor format: stored raw HTML for WYSIWYG, Markdown for Markdown-authored pages. Saving HTML clears Markdown source. Tags replace the full list; omission preserves existing tags. Avoid logging source content or credentials. Diagnostics go to stderr so stdout remains usable for stdio MCP.

## Packaging and releases

The npm package includes `dist`, `PRIVACY.md`, and `TERMS.md`; npm also includes standard README/license metadata. Claude, Codex, Cursor, and Gemini manifests share the same package version and exact npm launcher pin. Keep plugin assets below 5 MiB and reuse `assets/logo.png`. Run `scripts/check-plugin.mjs` after metadata changes.

Releases use [docs/RELEASING.md](docs/RELEASING.md). Synchronize all package/plugin versions for a runtime release. CI tags after merge; the release workflow waits for protected-environment approval, then publishes npm with OIDC provenance, the GitHub release/MCPB, and container images. Never run `npm publish` locally, add an `NPM_TOKEN`, manually bypass tagging, or weaken the release approval gate. Documentation-only changes normally do not need a release.

Never commit `.env`, tokens, or private wiki data. Commit messages should explain why; do not include AI attribution lines or emoji. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
