// context-capture/hooks/claude-code/_adapter.js
'use strict';

const AGENT_TYPE = 'CLAUDE_CODE';
const PROMPT_PREFIX = '.claude-prompts-';

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

module.exports = { AGENT_TYPE, PROMPT_PREFIX, readInput };
