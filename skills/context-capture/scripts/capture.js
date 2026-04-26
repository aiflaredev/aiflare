#!/usr/bin/env node
// AIFlare Capture Script (Node.js)
// Standalone script that can be run directly from subagents or hooks.
// Cross-platform; requires Node 18+ for the global fetch API.
//
// Usage:
//   node capture.js --title "title" --intent "intent" --commit-hash "abc123" --agent-type "CLAUDE_CODE" \
//     --claude-session-id "SESSION_ID" --changed-files "file1.kt,file2.kt" --tag "FEATURE" \
//     [--alternatives "alternatives"] [--diff-summary "diff summary"]
//
// If --claude-session-id is omitted, it is extracted from the most recent prompt file in .context-capture/.

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- Argument parsing ---
const FLAG_TO_ENV = {
  '--title':                'CB_TITLE',
  '--intent':               'CB_INTENT',
  '--commit-hash':          'CB_COMMIT_HASH',
  '--agent-type':           'CB_AGENT_TYPE',
  '--claude-session-id':    'CB_CLAUDE_SESSION_ID',
  '--changed-files':        'CB_CHANGED_FILES',
  '--tag':                  'CB_TAG',
  '--alternatives':         'CB_ALTERNATIVES',
  '--diff-summary':         'CB_DIFF_SUMMARY',
  '--conversation-snippet': 'CB_CONVERSATION_SNIPPET',
};

const args = {};
for (const envKey of Object.values(FLAG_TO_ENV)) {
  args[envKey] = process.env[envKey] || '';
}
if (!args.CB_AGENT_TYPE) args.CB_AGENT_TYPE = 'CLAUDE_CODE';

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const flag = argv[i];
  const envKey = FLAG_TO_ENV[flag];
  if (envKey === undefined) {
    process.stderr.write(`Unknown option: ${flag}\n`);
    process.exit(1);
  }
  if (i + 1 >= argv.length) {
    process.stderr.write(`Missing value for ${flag}\n`);
    process.exit(1);
  }
  args[envKey] = argv[++i];
}

let TITLE                = args.CB_TITLE;
let INTENT               = args.CB_INTENT;
let COMMIT_HASH          = args.CB_COMMIT_HASH;
const AGENT_TYPE         = args.CB_AGENT_TYPE;
let CLAUDE_SESSION_ID    = args.CB_CLAUDE_SESSION_ID;
const CHANGED_FILES      = args.CB_CHANGED_FILES;
const TAG                = args.CB_TAG;
const ALTERNATIVES       = args.CB_ALTERNATIVES;
const DIFF_SUMMARY       = args.CB_DIFF_SUMMARY;
let CONVERSATION_SNIPPET = args.CB_CONVERSATION_SNIPPET;

// --- Find git root ---
function gitOutput(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}

const gitRoot = gitOutput('git rev-parse --show-toplevel');
if (!gitRoot) {
  console.log('AIFlare capture skipped: not a git repository.');
  process.exit(0);
}

// --- Read aiflare.yml ---
const configFile = path.join(gitRoot, 'aiflare.yml');
if (!fs.existsSync(configFile)) {
  console.log('AIFlare capture skipped: aiflare.yml not found.');
  process.exit(0);
}

function extractValue(content, key) {
  const m = content.match(new RegExp(`^\\s*${key}\\s*:\\s*(.*)$`, 'm'));
  if (!m) return '';
  return m[1].replace(/^["']|["']$/g, '').trim();
}

const cfgContent = fs.readFileSync(configFile, 'utf8');
const API_KEY  = extractValue(cfgContent, 'api_key');
let   ENDPOINT = extractValue(cfgContent, 'endpoint');
if (!ENDPOINT) ENDPOINT = 'https://api.aiflare.dev';

if (!API_KEY) {
  console.log('AIFlare capture skipped: api_key missing in aiflare.yml.');
  process.exit(0);
}

// --- claude-session-id fallback: extract from most recent prompt file ---
if (!CLAUDE_SESSION_ID) {
  const ccDir = path.join(gitRoot, '.context-capture');
  if (fs.existsSync(ccDir)) {
    const candidates = fs.readdirSync(ccDir)
      .filter((n) => n.startsWith('.claude-prompts-'))
      .map((n) => ({ name: n, mtime: fs.statSync(path.join(ccDir, n)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (candidates.length > 0) {
      CLAUDE_SESSION_ID = candidates[0].name.replace(/^\.claude-prompts-/, '');
    }
  }
}

// --- conversation-snippet fallback: read from delta file ---
if (!CONVERSATION_SNIPPET && CLAUDE_SESSION_ID) {
  const deltaFile = path.join(gitRoot, '.context-capture', `.claude-conversation-delta-${CLAUDE_SESSION_ID}`);
  if (fs.existsSync(deltaFile)) {
    CONVERSATION_SNIPPET = fs.readFileSync(deltaFile, 'utf8');
    try { fs.unlinkSync(deltaFile); } catch { /* ignore */ }
  }
}

// --- continuation flag: true if AskUserQuestion fired immediately before the commit ---
let CONTINUATION = false;
if (CLAUDE_SESSION_ID) {
  const pendingFile = path.join(gitRoot, '.context-capture', `.pending-question-${CLAUDE_SESSION_ID}`);
  if (fs.existsSync(pendingFile)) {
    CONTINUATION = true;
    try { fs.unlinkSync(pendingFile); } catch { /* ignore */ }
  }
}

// --- Required field validation ---
if (!TITLE || !INTENT || !COMMIT_HASH || !CLAUDE_SESSION_ID || !CHANGED_FILES || !TAG) {
  process.stderr.write('Error: --title, --intent, --commit-hash, --claude-session-id, --changed-files, --tag are required.\n');
  process.exit(1);
}

// --- Build payload ---
const changedFilesArr = CHANGED_FILES.split(',').map((s) => s.trim()).filter(Boolean);
const branch = gitOutput('git rev-parse --abbrev-ref HEAD');

const payload = {
  title: TITLE,
  intent: INTENT,
  alternatives: ALTERNATIVES,
  diffSummary: DIFF_SUMMARY,
  commitHash: COMMIT_HASH,
  agentType: AGENT_TYPE,
  claudeSessionId: CLAUDE_SESSION_ID,
  changedFiles: changedFilesArr,
  tag: TAG,
  branch,
  continuation: CONTINUATION,
};
if (CONVERSATION_SNIPPET) payload.conversationSnippet = CONVERSATION_SNIPPET;

// --- Error log helper ---
const errLogDir = path.join(gitRoot, '.context-capture');
fs.mkdirSync(errLogDir, { recursive: true });

function pad2(n) { return String(n).padStart(2, '0'); }

function logError(msg) {
  const t = new Date();
  const stamp = `${t.getFullYear()}${pad2(t.getMonth() + 1)}${pad2(t.getDate())}${pad2(t.getHours())}${pad2(t.getMinutes())}${pad2(t.getSeconds())}`;
  const human = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())} ${pad2(t.getHours())}:${pad2(t.getMinutes())}:${pad2(t.getSeconds())}`;
  const logFile = path.join(errLogDir, `capture-error-${stamp}.log`);
  try {
    fs.appendFileSync(logFile, `[${human}] ${msg} | commit=${COMMIT_HASH} title=${TITLE}\n`);
  } catch { /* best effort */ }
}

// --- API call ---
(async () => {
  let res, body;
  try {
    res = await fetch(`${ENDPOINT}/api/v1/captures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify(payload),
    });
    body = await res.text();
  } catch (e) {
    const msg = `network error: ${e && e.message ? e.message : e}`;
    console.log(`AIFlare capture failed: ${msg}`);
    logError(msg);
    return;
  }

  switch (res.status) {
    case 201:
      console.log(`AIFlare capture complete: ${TITLE}`);
      break;
    case 400:
      console.log(`AIFlare capture failed: invalid request data — ${body}`);
      logError(`HTTP 400: invalid request data — ${body}`);
      break;
    case 401:
      console.log('AIFlare capture failed: API Key is invalid.');
      logError('HTTP 401: API Key is invalid');
      break;
    case 404:
      console.log('AIFlare capture failed: no project found for this API Key.');
      logError('HTTP 404: no project found for this API Key');
      break;
    case 429:
      console.log('AIFlare capture failed: rate limit exceeded.');
      logError('HTTP 429: rate limit exceeded');
      break;
    default:
      console.log(`AIFlare capture failed: HTTP ${res.status} — ${body}`);
      logError(`HTTP ${res.status}: ${body}`);
  }
})();
