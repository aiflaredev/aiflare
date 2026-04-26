#!/usr/bin/env node
'use strict';
const fs = require('fs');
const c = require('./_common');

(async () => {
  const inp = await c.readInput();
  if (!inp) return;
  if (inp.input.stop_hook_active === true) return;
  const lastMsg = inp.input.last_assistant_message || '';
  if (!lastMsg) return;
  const gitRoot = c.getGitRoot() || process.cwd();
  c.ensureContextDir(gitRoot);
  const promptFile = c.promptFilePath(inp.sessionId, gitRoot);
  fs.appendFileSync(promptFile, JSON.stringify({ role: 'assistant', content: lastMsg }) + '\n');
})();
