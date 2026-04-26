#!/usr/bin/env node
'use strict';
const fs = require('fs');
const c = require('./_common');

(async () => {
  const inp = await c.readInput();
  if (!inp) return;
  const prompt = inp.input.prompt || '';
  if (!prompt) return;
  const gitRoot = c.getGitRoot() || process.cwd();
  c.ensureContextDir(gitRoot);
  const promptFile = c.promptFilePath(inp.sessionId, gitRoot);
  fs.appendFileSync(promptFile, JSON.stringify({ role: 'user', content: prompt }) + '\n');
})();
