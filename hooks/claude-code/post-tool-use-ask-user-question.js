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
  promptBuf.ensureContextDir(gitRoot);
  fs.closeSync(fs.openSync(
    promptBuf.pendingQuestionPath(inp.sessionId, gitRoot, adapter.PROMPT_PREFIX), 'a'
  ));
})();
