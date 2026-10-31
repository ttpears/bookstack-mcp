# Contributing to BookStack MCP

Start with the [documentation index](docs/README.md) for user-facing behavior. Use a disposable BookStack instance for manual write testing; the automated suite uses fixtures/local mock servers and does not need production credentials.

## Development environment

Use **Node 24 LTS** (recommended) or Node 22, npm, and Python 3 for the HOL reporting tests. CI uses Node 22; the Docker image uses Node 24. The test command needs Node's test-file glob support introduced in Node 21, so the package's runtime `engines` minimum is not sufficient for development.

```bash
git clone https://github.com/ttpears/bookstack-mcp.git
cd bookstack-mcp
npm ci
npm run type-check
npm test
npm run build
python3 -m unittest discover -s scripts -p 'test_report_hol.py'
node scripts/check-plugin.mjs
```

`npm ci` uses the lockfile and runs the `prepare` build. The explicit build is still useful after editing source. Use `npm install` when deliberately changing dependencies and commit the lockfile with that change. Run `npm audit` when evaluating dependency security; do not apply `npm audit fix --force` without reviewing its compatibility impact.

### Run against a test wiki

Provision BookStack using its [official installation guidance](https://www.bookstackapp.com/docs/admin/installation/), on a disposable database and storage volume. Create a dedicated API user with the least permissions your test needs; enable **Access System API** and **Export Content** for WYSIWYG-to-Markdown fallback. Token ID and Secret are separate values.

```bash
cp .env.example .env
# Edit .env with your disposable BookStack URL and token pair.
node --env-file=.env --import tsx src/index.ts
```

This starts TypeScript in stdio mode and waits for an MCP client. It does not open a browser or print a prompt. `npm run dev` also runs the TypeScript entry point, but **does not load `.env` or enable file watching**. To watch explicitly:

```bash
node --watch --env-file=.env --import tsx src/index.ts
```

For a local HTTP test using the same private `.env`:

```bash
MCP_TRANSPORT=http MCP_HTTP_HOST=127.0.0.1 \
  node --env-file=.env --import tsx src/index.ts
```

This listens on port 8080 by default; change `MCP_HTTP_PORT` in the file if necessary. Set `MCP_TRANSPORT=http` in `.env` instead on shells without POSIX inline environment assignment. Do not expose this unauthenticated development listener publicly.

To test compiled code with an MCP client, configure its command as `node`, arguments as the absolute path to `dist/index.js`, and provide the required environment values. [MCP Inspector](https://github.com/modelcontextprotocol/inspector) can also inspect tools, resources, and prompts; keep tokens in private configuration rather than pasted into shared transcripts.

## Repository map

| Path | Responsibility |
|---|---|
| `src/index.ts` | Tool/resource registration, startup configuration, stdio and HTTP routing |
| `src/bookstack-client.ts` | BookStack API calls, response shaping, editor content, slug cache |
| `src/prompts.ts` | Four read-workflow prompt templates |
| `src/oauth/` | Entra OAuth broker, token validation, in-memory/Redis state |
| `src/session-registry.ts` | HTTP session lifetime and capacity |
| `src/request-credentials.ts` | Opt-in request credential context |
| `src/image-source.ts` | Image retrieval, file/host policy, size/type checks |
| `src/util/` | Body limits, rate-limit handling, concurrency, safe errors, word counts |
| `scripts/` | MCPB packaging, plugin consistency checks, HOL reporting and its tests |
| `.github/workflows/` | CI, image previews, HOL Guard, protected releases |

## Tests and review expectations

The TypeScript suite covers API tool behavior, tags, raw page source, revision summaries, images, request credentials, HTTP sessions/bodies, OAuth and atomic state consumption, safe errors, rate limits, and concurrency. Python tests cover the HOL reporting contract. The suite uses mock HTTP services and store fixtures; it does not replace testing interoperability against the BookStack/client versions affected by a change.

Run the checks above before submitting code, plus targeted manual testing when behavior depends on a real wiki, Redis deployment, or client UI. For a focused test during development:

```bash
node --import tsx --test src/page-raw-format.test.ts
```

Add regression coverage for meaningful behavior changes and security boundaries. For documentation changes, check commands against the implementation, validate relative links/anchors, parse JSON/YAML examples, and verify environment names/defaults. Do not freeze a test count or audit result into documentation; both change over time.

Preserve these behavior guarantees when changing tools:

- Read-only defaults and BookStack permission checks; OAuth role/subject binding on reused sessions.
- Numeric coercion for client compatibility and validation appropriate to IDs, offsets, sizes, and sort priorities.
- Compact responses with canonical URLs; bounded page content without duplicate source fields.
- HTML editor source versus Markdown source; full-list tag replacement semantics.
- Sanitized errors and stderr diagnostics, with no credential or private page-body logging.
- Explicit HTTP image-source controls and opt-in credential overrides.

## Submit a change

Create a focused branch, make the change, run relevant checks, then open a PR explaining the problem, resulting behavior, and validation. Update user-facing docs when tools, configuration, permissions, or deployment behavior changes. Keep `.env`, tokens, private wiki content, generated `dist/`, and package bundles out of Git.

Commit messages should explain the reason for the change. Do not add AI attribution lines or emoji. CI runs type checks, tests, a build, plugin checks, and HOL Guard; non-draft PRs also build a container preview. Same-repository PRs publish that preview; forks do not.

For vulnerabilities, use [private reporting](SECURITY.md#reporting-a-vulnerability) instead of a public issue containing exploit details.

## Versions and releases

Documentation-only changes normally need no package version bump. Runtime/package releases synchronize `package.json`, `package-lock.json`, and the Claude, Codex, and Gemini manifests. CI creates the version tag after merge, then publishing waits for the protected `release` environment approval. Follow the [release runbook](docs/RELEASING.md); never publish npm locally or remove the approval gate to bypass it.
