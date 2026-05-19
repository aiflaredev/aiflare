#!/usr/bin/env node
'use strict';
const fs = require('fs');
const adapter = require('./_adapter');
const logger = require('../_common/logger');

const HOOK_NAME = 'session-start';

// Propagates the current Claude Code session_id to all subsequent Bash subprocesses
// in this session via $CLAUDE_ENV_FILE (official mechanism).
//
// Why: capture.js (run via Bash tool by the agent) needs the session_id, but the agent
// itself does not see it. Without this hook capture.js falls back to "most recent
// .claude-prompts-* file by mtime", which is wrong when multiple Claude Code sessions
// run in parallel against the same project — leading to entries being attached to the
// wrong WorkSession and grouped under the wrong group_root_id.
//
// Fires on session start AND resume (source: startup|resume|clear|compact).
(async () => {
  const inp = await adapter.readInput();
  if (!inp) return;
  const envFile = process.env.CLAUDE_ENV_FILE;
  if (!envFile) return;
  const log = logger.makeLogger(HOOK_NAME, inp.sessionId);
  const safeId = String(inp.sessionId).replace(/'/g, "'\\''");
  try {
    fs.appendFileSync(envFile, `export CLAUDE_SESSION_ID='${safeId}'\n`);
  } catch (e) {
    log.warn(`failed to write CLAUDE_SESSION_ID to env file: ${e && e.message ? e.message : e}`);
  }
})();
