#!/usr/bin/env node
'use strict';
const fs = require('fs');
const adapter = require('./_adapter');
const config = require('../_common/config');
const promptBuf = require('../_common/prompt-buffer');

(async () => {
  const inp = await adapter.readInput();
  if (!inp) return;
  const prompt = inp.input.prompt || '';
  if (!prompt) return;
  const gitRoot = config.getGitRoot() || (inp.input && inp.input.cwd) || process.cwd();
  promptBuf.ensureContextDir(gitRoot);
  const promptFile = promptBuf.promptFilePath(inp.sessionId, gitRoot, adapter.PROMPT_PREFIX);
  fs.appendFileSync(promptFile, JSON.stringify({ role: 'user', content: prompt }) + '\n');
})();
