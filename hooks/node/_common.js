'use strict';
// Claude Code hook common library. Do not execute directly.
// Each hook does: const c = require('./_common');

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

function getGitRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { return ''; }
}

function ensureContextDir(gitRoot) {
  fs.mkdirSync(path.join(gitRoot, '.context-capture'), { recursive: true });
}

const promptFilePath      = (sid, root) => path.join(root, '.context-capture', `.claude-prompts-${sid}`);
const offsetFilePath      = (sid, root) => path.join(root, '.context-capture', `.claude-offset-${sid}`);
const deltaFilePath       = (sid, root) => path.join(root, '.context-capture', `.claude-conversation-delta-${sid}`);
const pendingQuestionPath = (sid, root) => path.join(root, '.context-capture', `.pending-question-${sid}`);

function hasAiflareConfig(gitRoot) {
  return fs.existsSync(path.join(gitRoot, 'aiflare.yml'));
}

function readAiflareConfig(gitRoot) {
  const cfg = path.join(gitRoot, 'aiflare.yml');
  if (!fs.existsSync(cfg)) return null;
  const content = fs.readFileSync(cfg, 'utf8');
  const apiKeyMatch = content.match(/^api_key:\s*(.+)$/m);
  if (!apiKeyMatch) return null;
  const apiKey = apiKeyMatch[1].replace(/['"]/g, '').trim();
  if (!apiKey) return null;
  const endpointMatch = content.match(/^endpoint:\s*(.+)$/m);
  let endpoint = endpointMatch ? endpointMatch[1].replace(/['"]/g, '').trim() : '';
  if (!endpoint) endpoint = 'https://api.aiflare.dev';
  return { apiKey, endpoint };
}

function hasContextCaptureSkill(gitRoot) {
  return fs.existsSync(path.join(gitRoot, '.claude', 'skills', 'context-capture'));
}

function makeLogger(hookName, sessionId) {
  const sidShort = (sessionId || '').slice(0, 8);
  const emit = (level, msg) =>
    process.stderr.write(`[${level}] [hook=${hookName} session=${sidShort}] ${msg}\n`);
  return {
    info:  (m) => emit('INFO', m),
    warn:  (m) => emit('WARN', m),
    error: (m) => emit('ERROR', m),
  };
}

module.exports = {
  readInput,
  getGitRoot,
  ensureContextDir,
  promptFilePath,
  offsetFilePath,
  deltaFilePath,
  pendingQuestionPath,
  hasAiflareConfig,
  readAiflareConfig,
  hasContextCaptureSkill,
  makeLogger,
};
