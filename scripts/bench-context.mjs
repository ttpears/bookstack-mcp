#!/usr/bin/env node
// Measure tools/list + a few read-only tool responses by speaking JSON-RPC
// over stdio to dist/index.js. Loads .env, prints sizes in bytes.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// Load .env
const env = { ...process.env };
try {
  for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
} catch {}

const child = spawn("node", [join(root, "dist/index.js")], {
  env,
  stdio: ["pipe", "pipe", "inherit"]
});

let buf = "";
const pending = new Map();
let nextId = 1;

child.stdout.on("data", (chunk) => {
  buf += chunk.toString("utf8");
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
    }
  }
});

function send(method, params) {
  const id = nextId++;
  const req = { jsonrpc: "2.0", id, method, params };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify(req) + "\n");
  });
}

function bytes(obj) {
  return Buffer.byteLength(JSON.stringify(obj), "utf8");
}

async function main() {
  // 1. initialize
  await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "bench", version: "0.0.0" }
  });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  const results = {};

  // 2. tools/list
  const toolsList = await send("tools/list", {});
  results["tools/list"] = bytes(toolsList.result);

  // 3. Pick a small sample of read-only tool calls
  const calls = [
    ["search_content", { query: "test", count: 5 }],
    ["get_books", { count: 5 }],
    ["get_pages", { count: 5 }],
    ["get_recent_changes", { limit: 5, days: 365 }],
    ["get_shelves", { count: 5 }],
  ];

  // Find any page id for get_page
  const pagesRes = await send("tools/call", { name: "get_pages", arguments: { count: 1 } });
  try {
    const payload = JSON.parse(pagesRes.result.content[0].text);
    const pageId = payload.data?.[0]?.id;
    if (pageId) calls.push(["get_page", { id: pageId, limit: 5000 }]);
  } catch {}

  // Find any book id
  const booksRes = await send("tools/call", { name: "get_books", arguments: { count: 1 } });
  try {
    const payload = JSON.parse(booksRes.result.content[0].text);
    const bookId = payload.data?.[0]?.id;
    if (bookId) calls.push(["get_book", { id: bookId }]);
  } catch {}

  for (const [name, args] of calls) {
    const r = await send("tools/call", { name, arguments: args });
    // Measure the result content as the LLM would see it
    const text = r.result?.content?.map(c => c.text ?? "").join("") ?? "";
    results[`tools/call:${name}`] = Buffer.byteLength(text, "utf8");
  }

  console.log(JSON.stringify(results, null, 2));
  child.kill();
}

main().catch((e) => { console.error(e); child.kill(); process.exit(1); });
