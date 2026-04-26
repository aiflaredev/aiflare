#!/usr/bin/env node
'use strict';
const fs = require('fs');
const c = require('./_common');

(async () => {
  const inp = await c.readInput();
  if (!inp) return;
  const gitRoot = c.getGitRoot() || process.cwd();
  // Clean up the 4 files in .context-capture/ on session end. No-op if files don't exist.
  for (const fn of [c.promptFilePath, c.offsetFilePath, c.deltaFilePath, c.pendingQuestionPath]) {
    try { fs.unlinkSync(fn(inp.sessionId, gitRoot)); } catch { /* ignore */ }
  }
})();
