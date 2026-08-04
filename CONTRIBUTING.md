# Contributing to bookstack-mcp

## What this server does

`bookstack-mcp` exposes a BookStack wiki to an AI assistant (Claude Code, Cowork,
or any MCP-compatible client) as a set of callable tools — searching pages,
reading content, and optionally creating/editing pages and books. It's how an
AI session answers questions out of a BookStack instance, and how it can make
edits there if write mode is enabled.

## Getting it running locally

**Don't point this at a production BookStack instance while developing.** Stand
up a throwaway local copy first and point everything at that. A minimal
`docker-compose.yml` for a disposable BookStack + database:

```yaml
services:
  bookstack-db:
    image: mariadb:11.4
    environment:
      MARIADB_ROOT_PASSWORD: local-dev-only
      MARIADB_DATABASE: bookstack
      MARIADB_USER: bookstack
      MARIADB_PASSWORD: local-dev-only
    volumes: [bookstack-db:/var/lib/mysql]
  bookstack:
    image: lscr.io/linuxserver/bookstack:latest
    environment:
      APP_URL: http://localhost:6875
      APP_KEY: base64:SVGvKZ8b6l0Y1n4kZ0pQ2xW7mJ3rT5uH8cA1dE9fG2s=
      DB_HOST: bookstack-db
      DB_USERNAME: bookstack   # not DB_USER — see Gotchas
      DB_PASSWORD: local-dev-only
      DB_DATABASE: bookstack
    ports: ["6875:80"]
    depends_on: [bookstack-db]
volumes:
  bookstack-db:
```

```bash
docker compose up -d
```

Requires **Node 22** specifically — the test runner needs glob support that
only landed in Node 21+, and older versions fail with a confusing "Could not
find" error rather than anything indicating a version problem.

A few things that weren't obvious the first time through:

- BookStack's container env vars must be `DB_USERNAME`/`DB_PASSWORD`, not the
  older LSIO-style `DB_USER`/`DB_PASS` — get the name wrong and you get a
  silent 500 with no hint why. First container start also takes about a
  minute for DB migrations; a 500 during that window just means it's not
  ready yet.
- The API token BookStack gives you (Edit Profile → API Tokens) is actually
  **two separate values** — a Token ID and a Token Secret, both shown once on
  the creation screen. `.env` wants both (`BOOKSTACK_TOKEN_ID` /
  `BOOKSTACK_TOKEN_SECRET`); copying only one string will leave you stuck.
- If you're developing over SSH and viewing BookStack from your local
  browser, `localhost:6875` refers to your machine, not the remote host — use
  an SSH local port-forward tunnel to reach it.
- **`npm run dev` does not load `.env` at all** — see Gotchas below for why,
  and what to run instead.

```bash
npm install
cp .env.example .env
# fill in BOOKSTACK_BASE_URL, BOOKSTACK_TOKEN_ID, BOOKSTACK_TOKEN_SECRET
# BOOKSTACK_ENABLE_WRITE=true is safe against a local throwaway instance
node --env-file=.env --import tsx src/index.ts
```

## Running the tests

```bash
npm test
```

This runs Node's built-in test runner (`node --test`) against `src/**/*.test.ts`.
Passing looks like:

```
✔ constructor rejects max < 1
✔ allows up to `max` holders concurrently and queues the rest
✔ run() releases the permit even when fn throws
✔ bounds real concurrency under a burst
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

Worth knowing going in: this is currently 4 tests, all covering the
concurrency limiter (`BOOKSTACK_MAX_CONCURRENCY`) — there's no coverage yet of
the actual BookStack API calls, error handling, or caching behavior. Coverage
here is thin; don't treat it as representative of this project's other repos
(`mediawiki-mcp`, `content-mcp`), which are considerably better covered.

## Making a change

```bash
git switch main && git pull
git switch -c fix/short-description   # or feat/, ci/, docs/
# ...make your change...
git add -A && git commit
git push -u origin fix/short-description
gh pr create --fill
```

Commit messages explain **why**, not what — the diff already shows what
changed. No AI attribution lines or emoji in commits. Never commit `.env`,
tokens, or secrets. The maintainer reviews and approves PRs; merging is safe
and reversible once approved.

## How it ships

Merging a change that bumps the version in `package.json` cuts a git tag,
which kicks off the release workflow — but that workflow **pauses and waits
for maintainer approval** before anything actually publishes to npm. A merge
never ships anything on its own.

## Gotchas

- **`npm run dev` (`tsx src/index.ts`) does not load `.env`.** There's no
  `dotenv` import and no `--env-file` flag anywhere in the repo, and
  `BOOKSTACK_BASE_URL` is read directly from `process.env` via
  `getRequiredEnvVar`. So filling in `.env` per the setup steps silently does
  nothing if you run the documented `npm run dev`. Use
  `node --env-file=.env --import tsx src/index.ts` instead. The same gap
  exists in `mediawiki-mcp`, so the real fix is likely one shared change
  (either the `dev` script or a `dotenv` import) rather than two separate
  patches — a known issue, not yet fixed as of this PR.
- **Needs Node 22 specifically** for the test runner's glob support — anything
  older fails with a misleading error.
- **Test coverage is thin** — 4 tests, all about the concurrency limiter, and
  it wasn't running in CI until recently.
- **`npm install` reports a double-digit number of audit vulnerabilities** on
  a fresh install. Worth a look eventually, not a blocker for local dev.
- Once running, the server sits in stdio mode waiting for an MCP client to
  talk to it — that's expected behavior, not a hang.
