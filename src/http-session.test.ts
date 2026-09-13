import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { spawn, ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Black-box tests over the real HTTP transport. The session-termination contract in
// MCP's Streamable HTTP spec is a status-code contract, so it can only be verified
// against an actual server socket — not by unit-testing SessionRegistry in isolation.
//
// Spec (2025-06-18, Session Management):
//   3. "The server MAY terminate the session at any time, after which it MUST respond
//       to requests containing that session ID with HTTP 404 Not Found."
//   4. "When a client receives HTTP 404 in response to a request containing an
//       Mcp-Session-Id, it MUST start a new session by sending a new InitializeRequest
//       without a session ID attached."
// 404 is therefore the *only* signal that tells a client to re-initialize. A server
// that answers a terminated session with 400 leaves the client with no defined
// recovery path, and the connector stays down until a human reconnects it.

const PORT = 8411;
const BASE = `http://127.0.0.1:${PORT}`;
const MCP = `${BASE}/mcp`;
const UNKNOWN_SESSION = "00000000-0000-4000-8000-000000000000";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

let server: ChildProcess;

const initializeBody = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "session-contract-test", version: "1.0.0" }
  }
};

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream"
};

async function waitForReady(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) {
        await res.text();
        return;
      }
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server did not become ready on ${BASE} within ${timeoutMs}ms`);
}

before(async () => {
  server = spawn(
    process.execPath,
    ["--import", "tsx", join(repoRoot, "src", "index.ts")],
    {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        MCP_TRANSPORT: "http",
        MCP_HTTP_HOST: "127.0.0.1",
        MCP_HTTP_PORT: String(PORT),
        MCP_OAUTH_ENABLE: "false",
        // Never contacted: no test here invokes a tool.
        BOOKSTACK_BASE_URL: "http://127.0.0.1:9/unused",
        BOOKSTACK_TOKEN_ID: "test",
        BOOKSTACK_TOKEN_SECRET: "test"
      }
    }
  );
  await waitForReady();
});

after(() => {
  server?.kill("SIGTERM");
});

describe("Streamable HTTP session contract", () => {
  test("initialize issues a session id", async () => {
    const res = await fetch(MCP, {
      method: "POST",
      headers: MCP_HEADERS,
      body: JSON.stringify(initializeBody)
    });
    await res.text();
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("mcp-session-id"), "expected an Mcp-Session-Id header");
  });

  // Spec §3: a session the server no longer holds MUST answer 404, not 400.
  // This is the case produced in production by the idle sweep and by any restart,
  // since sessions live only in process memory.
  for (const method of ["POST", "GET", "DELETE"] as const) {
    test(`${method} with a terminated session id answers 404 Not Found`, async () => {
      const res = await fetch(MCP, {
        method,
        headers: {
          ...MCP_HEADERS,
          "Mcp-Session-Id": UNKNOWN_SESSION
        },
        ...(method === "POST"
          ? { body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) }
          : {})
      });
      const body = await res.text();

      assert.equal(
        res.status,
        404,
        `${method} returned ${res.status}; spec §3 requires 404 so the client re-initializes. Body: ${body}`
      );
    });
  }

  test("terminated session error uses JSON-RPC code -32001", async () => {
    const res = await fetch(MCP, {
      method: "POST",
      headers: { ...MCP_HEADERS, "Mcp-Session-Id": UNKNOWN_SESSION },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" })
    });
    const body = (await res.json()) as { error?: { code?: number } };
    assert.equal(body.error?.code, -32001, "expected -32001 Session not found, matching the MCP SDK");
  });

  // Spec §2: 400 stays correct for a non-initialize request carrying NO session header.
  test("request without a session id still answers 400 Bad Request", async () => {
    const res = await fetch(MCP, {
      method: "POST",
      headers: MCP_HEADERS,
      body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/list" })
    });
    await res.text();
    assert.equal(res.status, 400);
  });
});
