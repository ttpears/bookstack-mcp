#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const pkg = readJson('package.json');
const manifest = readJson('.codex-plugin/plugin.json');
const claude = readJson('.claude-plugin/plugin.json');
const gemini = readJson('gemini-extension.json');
const cursor = readJson('.cursor-plugin/plugin.json');
const mcp = readJson('.mcp.json');

assert.equal(manifest.name, pkg.name, 'Codex plugin name must match the npm package');
assert.equal(manifest.version, pkg.version, 'Codex plugin version must match the npm package');
assert.equal(claude.version, pkg.version, 'Claude plugin version must match the npm package');
assert.equal(gemini.version, pkg.version, 'Gemini extension version must match the npm package');
assert.equal(cursor.name, pkg.name, 'Cursor plugin name must match the npm package');
assert.equal(cursor.version, pkg.version, 'Cursor plugin version must match the npm package');
assert.equal(manifest.mcpServers, './.mcp.json', 'Codex must reference the scanned MCP config');
assert.equal(cursor.mcpServers, './.mcp.json', 'Cursor must reference the scanned MCP config');
assert.deepEqual(mcp.mcpServers, claude.mcpServers,
  'Codex and Claude must launch the same BookStack server');
assert.deepEqual(mcp.mcpServers, gemini.mcpServers,
  'Gemini must launch the same pinned BookStack server');
assert.deepEqual(mcp.mcpServers.bookstack, {
  command: 'npx',
  args: ['-y', `${pkg.name}@${pkg.version}`],
}, 'Plugin launchers must pin the exact matching npm release');

for (const [label, path] of [['Cursor logo', cursor.logo], ['Gemini icon', gemini.icon]]) {
  assert.equal(path, 'assets/logo.png', `${label} must use the shared optimized asset`);
  assert.ok(statSync(new URL(path, root)).size <= 5 * 1024 * 1024,
    `${label} must fit the directory file-size limit`);
}

// HOL checks these exact, case-sensitive interface keys. The local scanner
// classifies missing interface links as informational, so enforce them here.
const expectedLinks = {
  websiteURL: 'https://github.com/ttpears/bookstack-mcp',
  privacyPolicyURL: 'https://github.com/ttpears/bookstack-mcp/blob/main/PRIVACY.md',
  termsOfServiceURL: 'https://github.com/ttpears/bookstack-mcp/blob/main/TERMS.md',
};
for (const [field, url] of Object.entries(expectedLinks)) {
  assert.equal(manifest.interface?.[field], url, `${field} must point to the project's public documentation`);
}
for (const path of ['PRIVACY.md', 'TERMS.md']) {
  assert.ok(existsSync(fileURLToPath(new URL(path, root))), `${path} must exist`);
  assert.ok(pkg.files.includes(path), `${path} must ship in the npm package`);
}

console.log('Plugin identities, MCP configuration, and marketplace policy links are valid.');
