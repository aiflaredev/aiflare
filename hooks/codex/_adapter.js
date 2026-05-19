// context-capture/hooks/codex/_adapter.js
'use strict';
const fs = require('fs');
const path = require('path');

const AGENT_TYPE = 'CODEX';
const PROMPT_PREFIX = '.codex-prompts-';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) { resolve(''); return; }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

async function readInput() {
  const raw = await readStdin();
  if (!raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  const sessionId = parsed && parsed.session_id;
  if (!sessionId) return null;
  return { input: parsed, sessionId };
}

// Codex has no SessionEnd. To prevent disk buildup, remove .codex-prompts-*
// (and sibling offset/delta/pending-question) files older than maxAgeMs whose
// sessionId is not the current one.
function cleanupStale(gitRoot, currentSessionId, maxAgeMs) {
  const dir = path.join(gitRoot, '.context-capture');
  if (!fs.existsSync(dir)) return;
  const now = Date.now();
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith(PROMPT_PREFIX) &&
        !name.startsWith('.codex-offset-') &&
        !name.startsWith('.codex-conversation-delta-') &&
        !name.startsWith('.codex-pending-question-')) continue;
    // Extract sessionId portion (after the prefix)
    const m = name.match(/^\.codex-(?:prompts|offset|conversation-delta|pending-question)-(.+)$/);
    if (!m) continue;
    if (m[1] === currentSessionId) continue;
    const full = path.join(dir, name);
    try {
      const st = fs.statSync(full);
      if (now - st.mtimeMs > maxAgeMs) fs.unlinkSync(full);
    } catch { /* ignore */ }
  }
}

module.exports = { AGENT_TYPE, PROMPT_PREFIX, readInput, cleanupStale };
