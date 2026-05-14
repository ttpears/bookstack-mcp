#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const version = pkg.version;
const stageDir = resolve(repoRoot, 'dist-mcpb');
const bundleName = `bookstack-mcp-${version}.mcpb`;
const bundlePath = resolve(repoRoot, bundleName);

const run = (cmd, opts = {}) =>
  execSync(cmd, { cwd: repoRoot, stdio: 'inherit', ...opts });

rmSync(stageDir, { recursive: true, force: true });
if (existsSync(bundlePath)) unlinkSync(bundlePath);
mkdirSync(stageDir, { recursive: true });

const tarball = execSync('npm pack --silent', { cwd: repoRoot, encoding: 'utf8' }).trim();
const tarballPath = resolve(repoRoot, tarball);

try {
  run(
    `npm install --prefix "${stageDir}" --omit=dev --no-audit --no-fund --no-package-lock --ignore-scripts "${tarballPath}"`
  );
} finally {
  if (existsSync(tarballPath)) unlinkSync(tarballPath);
}

for (const f of ['package.json', 'package-lock.json']) {
  const p = resolve(stageDir, f);
  if (existsSync(p)) unlinkSync(p);
}

const manifestTemplate = JSON.parse(
  readFileSync(resolve(repoRoot, 'mcpb/manifest.template.json'), 'utf8')
);
manifestTemplate.version = version;
writeFileSync(resolve(stageDir, 'manifest.json'), JSON.stringify(manifestTemplate, null, 2) + '\n');

run(`zip -qr "${bundlePath}" manifest.json node_modules`, { cwd: stageDir });

const sizeMb = (execSync(`stat -c %s "${bundlePath}"`, { encoding: 'utf8' }).trim() / 1024 / 1024).toFixed(2);
console.log(`Built ${bundleName} (${sizeMb} MB)`);
