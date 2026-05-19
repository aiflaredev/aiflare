#!/usr/bin/env node
'use strict';
const fs = require('fs');
const adapter = require('./_adapter');
const config = require('../_common/config');
const promptBuf = require('../_common/prompt-buffer');

(async () => {
  const inp = await adapter.readInput();
  if (!inp) return;
  const gitRoot = config.getGitRoot() || process.cwd();
  for (const fn of [
    promptBuf.promptFilePath, promptBuf.offsetFilePath,
    promptBuf.deltaFilePath, promptBuf.pendingQuestionPath,
  ]) {
    try { fs.unlinkSync(fn(inp.sessionId, gitRoot, adapter.PROMPT_PREFIX)); } catch { /* ignore */ }
  }
})();
