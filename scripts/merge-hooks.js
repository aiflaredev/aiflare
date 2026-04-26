#!/usr/bin/env node
// Merges AIFlare hook definitions into an existing settings.local.json.
// Preserves user hooks, concatenates per-event arrays, removes prior AIFlare
// entries to keep the merge idempotent across re-installs.
//
// Usage: node merge-hooks.js <dst-settings-json> <src-aiflare-json>

const fs = require('fs');

const [, , dstPath, srcPath] = process.argv;
if (!dstPath || !srcPath) {
  console.error('Usage: node merge-hooks.js <dst> <src>');
  process.exit(1);
}

const AIFLARE_SIGNATURES = [
  'aiflare.yml',
  '.context-capture',
  'api/v1/work-sessions',
  'api/v1/captures',
  '.claude/hooks/'
];

function containsAiflareSignature(value) {
  if (value == null) return false;
  if (typeof value === 'string') {
    return AIFLARE_SIGNATURES.some((sig) => value.includes(sig));
  }
  if (Array.isArray(value)) {
    return value.some(containsAiflareSignature);
  }
  if (typeof value === 'object') {
    return Object.values(value).some(containsAiflareSignature);
  }
  return false;
}

let dst, src;
try {
  dst = JSON.parse(fs.readFileSync(dstPath, 'utf8'));
} catch (err) {
  console.error(`Failed to parse ${dstPath}: ${err.message}`);
  process.exit(1);
}
try {
  src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
} catch (err) {
  console.error(`Failed to parse ${srcPath}: ${err.message}`);
  process.exit(1);
}

dst.hooks = dst.hooks || {};
const mergedEvents = [];

for (const [event, srcEntries] of Object.entries(src.hooks || {})) {
  if (!Array.isArray(srcEntries)) continue;
  const existing = Array.isArray(dst.hooks[event]) ? dst.hooks[event] : [];
  const preserved = existing.filter((entry) => !containsAiflareSignature(entry));
  dst.hooks[event] = [...preserved, ...srcEntries];
  mergedEvents.push(event);
}

fs.writeFileSync(dstPath, JSON.stringify(dst, null, 2) + '\n');
console.log(`Merged hooks: ${mergedEvents.join(', ')}`);
