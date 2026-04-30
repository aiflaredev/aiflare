#!/usr/bin/env node
// installer/build.mjs
// Reads ../context-capture/ as canon source and emits:
//   ./dist/install.sh, ./dist/install.ps1, ./dist/aiflare.zip
// The ZIP mirrors context-capture/ structure 1:1 so that install.sh / install.ps1
// can reference $CLONE_DIR/skills, $CLONE_DIR/mcp-server, etc. unchanged.

import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { copyFile, chmod, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT  = resolve(__dirname, '..', 'context-capture');
const OUT_DIR   = resolve(__dirname, 'dist');
const ZIP_PATH  = resolve(OUT_DIR, 'aiflare.zip');

const BUNDLE_ENTRIES = [
  { type: 'directory', src: 'skills',                  glob: '**/*' },
  { type: 'directory', src: 'mcp-server',              glob: '**/*' },
  { type: 'directory', src: 'hooks/node',              glob: '**/*' },
  { type: 'directory', src: 'scripts',                 glob: '**/*' },
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
  if (!(await pathExists(SRC_ROOT))) {
    throw new Error(`Source not found: ${SRC_ROOT}`);
  }
  for (const entry of BUNDLE_ENTRIES) {
    const p = resolve(SRC_ROOT, entry.src);
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
      const absSrc = resolve(SRC_ROOT, entry.src);
      if (entry.type === 'directory') {
        archive.glob(entry.glob, { cwd: absSrc, ignore: IGNORE_PATTERNS, dot: false }, { prefix: entry.src });
      } else {
        archive.file(absSrc, { name: entry.src });
      }
    }

    archive.finalize();
  });
}

async function main() {
  console.log(`[OK] source: ${SRC_ROOT}`);
  console.log(`[OK] output: ${OUT_DIR}`);
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
