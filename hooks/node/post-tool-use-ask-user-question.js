#!/usr/bin/env node
'use strict';
const fs = require('fs');
const c = require('./_common');

(async () => {
  const inp = await c.readInput();
  if (!inp) return;
  const gitRoot = c.getGitRoot() || process.cwd();
  c.ensureContextDir(gitRoot);
  fs.closeSync(fs.openSync(c.pendingQuestionPath(inp.sessionId, gitRoot), 'a'));
})();
