#!/usr/bin/env node
'use strict';
const fs = require('fs');
const adapter = require('./_adapter');
const config = require('../_common/config');
const logger = require('../_common/logger');

const HOOK_NAME = 'session-start';
const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

(async () => {
  const inp = await adapter.readInput();
  if (!inp) return;
  const log = logger.makeLogger(HOOK_NAME, inp.sessionId);

  // Propagate session_id to subsequent shells. Codex does not expose CLAUDE_ENV_FILE;
  // we honor a Codex-specific env file if present (CODEX_ENV_FILE), otherwise we no-op
  // and capture.js falls back to the explicit --claude-session-id arg passed by skills.
  const envFile = process.env.CODEX_ENV_FILE || process.env.CLAUDE_ENV_FILE;
  if (envFile) {
    const safeId = String(inp.sessionId).replace(/'/g, "'\\''");
    try {
      fs.appendFileSync(envFile, `export CLAUDE_SESSION_ID='${safeId}'\n`);
    } catch (e) {
      log.warn(`failed to write CLAUDE_SESSION_ID to env file: ${e && e.message ? e.message : e}`);
    }
  }

  // Cleanup stale Codex temp files from previous sessions (no SessionEnd in Codex).
  const gitRoot = config.getGitRoot() || (inp.input && inp.input.cwd) || process.cwd();
  try { adapter.cleanupStale(gitRoot, inp.sessionId, STALE_MS); }
  catch (e) { log.warn(`cleanupStale failed: ${e && e.message ? e.message : e}`); }
})();
