#!/usr/bin/env node
'use strict';
const fs = require('fs');
const c = require('./_common');

const HOOK_NAME = 'post-tool-use-bash-git-commit';

async function uploadPromptFile(sessionId, gitRoot, endpoint, apiKey, log) {
  const promptFile = c.promptFilePath(sessionId, gitRoot);
  if (!fs.existsSync(promptFile)) return;
  const content = fs.readFileSync(promptFile, 'utf8');
  const payload = JSON.stringify({ claudeSessionId: sessionId, content });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${endpoint}/api/v1/work-sessions/prompt`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: payload,
      signal: controller.signal,
    });
    if (!res.ok) log.warn('prompt upload failed');
  } catch {
    log.warn('prompt upload failed');
  } finally {
    clearTimeout(timer);
  }
}

function updateDelta(sessionId, gitRoot) {
  const promptFile = c.promptFilePath(sessionId, gitRoot);
  const offsetFile = c.offsetFilePath(sessionId, gitRoot);
  const deltaFile  = c.deltaFilePath(sessionId, gitRoot);
  if (!fs.existsSync(promptFile)) return;
  let lastIndex = 0;
  if (fs.existsSync(offsetFile)) {
    lastIndex = parseInt(fs.readFileSync(offsetFile, 'utf8').trim(), 10) || 0;
  }
  const raw = fs.readFileSync(promptFile, 'utf8');
  // Mirror bash `wc -l`: count of newline characters.
  const total = (raw.match(/\n/g) || []).length;
  if (total > lastIndex) {
    const lines = raw.split('\n');
    fs.writeFileSync(deltaFile, lines.slice(lastIndex).join('\n'));
  }
  fs.writeFileSync(offsetFile, String(total));
}

(async () => {
  const inp = await c.readInput();
  if (!inp) return;
  const log = c.makeLogger(HOOK_NAME, inp.sessionId);
  const gitRoot = c.getGitRoot();
  if (!gitRoot) return;
  if (c.hasAiflareConfig(gitRoot)) {
    const cfg = c.readAiflareConfig(gitRoot);
    if (cfg) {
      await uploadPromptFile(inp.sessionId, gitRoot, cfg.endpoint, cfg.apiKey, log);
      updateDelta(inp.sessionId, gitRoot);
    }
  }
  if (c.hasContextCaptureSkill(gitRoot)) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: 'git commit completed. You must invoke the context-capture skill to capture the work context.',
      },
    }));
  }
})();
