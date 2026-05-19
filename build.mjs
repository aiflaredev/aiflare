#!/usr/bin/env node
// installer/build.mjs
// Bundles distributable artifacts from two source roots into a single aiflare.zip,
// and copies install.js alongside it. Outputs land in ./dist/ for upload to aiflare.dev.
//
// Source roots:
//   ../context-capture/     — skills/, hooks/_common/, hooks/claude-code/, scripts/githooks/ (canon)
//   ../mcp-server/          — dist/, package.json, package-lock.json (TS source-of-truth)
//
// The ZIP layout matches what install.js expects: skills/, mcp-server/dist/,
// mcp-server/package.json, mcp-server/package-lock.json, hooks/_common/, hooks/claude-code/, scripts/.

import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { copyFile, chmod, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT_CC  = resolve(__dirname, '..', 'context-capture');
const SRC_ROOT_MCP = resolve(__dirname, '..', 'mcp-server');
const OUT_DIR      = resolve(__dirname, 'dist');
const ZIP_PATH     = resolve(OUT_DIR, 'aiflare.zip');

// Each entry has:
//   root  — absolute base directory to read from
//   src   — path relative to root (file or directory)
//   For 'directory': prefix = path inside the zip; glob = files to include
//   For 'file':      target = path inside the zip
const BUNDLE_ENTRIES = [
  { type: 'directory', root: SRC_ROOT_CC,  src: 'skills',     prefix: 'skills',          glob: '**/*' },
  { type: 'directory', root: SRC_ROOT_CC,  src: 'hooks/_common',     prefix: 'hooks/_common',     glob: '**/*' },
  { type: 'directory', root: SRC_ROOT_CC,  src: 'hooks/claude-code', prefix: 'hooks/claude-code', glob: '**/*' },
  { type: 'directory', root: SRC_ROOT_CC,  src: 'hooks/codex',       prefix: 'hooks/codex',       glob: '**/*' },
  { type: 'directory', root: SRC_ROOT_CC,  src: 'scripts',    prefix: 'scripts',         glob: '**/*' },
  { type: 'directory', root: SRC_ROOT_MCP, src: 'dist',       prefix: 'mcp-server/dist', glob: '**/*' },
  { type: 'file',      root: SRC_ROOT_MCP, src: 'package.json',      target: 'mcp-server/package.json' },
  { type: 'file',      root: SRC_ROOT_MCP, src: 'package-lock.json', target: 'mcp-server/package-lock.json' },
];

const IGNORE_PATTERNS = [
  '**/.DS_Store',
  '**/node_modules/**',
  '**/.git/**',
];

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function assertSourceExists() {
  for (const root of [SRC_ROOT_CC, SRC_ROOT_MCP]) {
    if (!(await pathExists(root))) {
      throw new Error(`Source root not found: ${root}`);
    }
  }
  for (const entry of BUNDLE_ENTRIES) {
    const p = resolve(entry.root, entry.src);
    if (!(await pathExists(p))) {
      throw new Error(`Required bundle source missing: ${p}`);
    }
  }
}

async function resetOutputDir() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
}

async function copyInstallScripts() {
  const from = resolve(__dirname, 'install.js');
  const to   = resolve(OUT_DIR, 'install.js');
  await copyFile(from, to);
  await chmod(to, 0o755);
  console.log(`[OK] copied ${to}`);
}

function createZip() {
  return new Promise((res, rej) => {
    const output  = createWriteStream(ZIP_PATH);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const bytes = archive.pointer();
      console.log(`[OK] aiflare.zip written (${bytes.toLocaleString()} bytes)`);
      res();
    });
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') console.warn('[!]', err.message);
      else rej(err);
    });
    archive.on('error', rej);
    archive.pipe(output);

    for (const entry of BUNDLE_ENTRIES) {
      const absSrc = resolve(entry.root, entry.src);
      if (entry.type === 'directory') {
        archive.glob(entry.glob, { cwd: absSrc, ignore: IGNORE_PATTERNS, dot: false }, { prefix: entry.prefix });
      } else {
        archive.file(absSrc, { name: entry.target });
      }
    }

    archive.finalize();
  });
}

async function main() {
  console.log(`[OK] context-capture root: ${SRC_ROOT_CC}`);
  console.log(`[OK] mcp-server root:      ${SRC_ROOT_MCP}`);
  console.log(`[OK] output:               ${OUT_DIR}`);
  await assertSourceExists();
  await resetOutputDir();
  await copyInstallScripts();
  await createZip();
  console.log('[OK] build complete');
}

main().catch((err) => {
  console.error('[X]', err.message);
  process.exit(1);
});
