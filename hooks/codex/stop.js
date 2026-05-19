#!/usr/bin/env node
'use strict';
const fs = require('fs');
const adapter = require('./_adapter');
const config = require('../_common/config');
const promptBuf = require('../_common/prompt-buffer');

(async () => {
  const inp = await adapter.readInput();
  if (!inp) return;
  if (inp.input.stop_hook_active === true) return;
  // Codex provides the final assistant message field — name may differ; we accept either.
  const lastMsg = inp.input.last_assistant_message
                 || inp.input.last_message
                 || '';
  if (!lastMsg) return;
  const gitRoot = config.getGitRoot() || (inp.input && inp.input.cwd) || process.cwd();
  promptBuf.ensureContextDir(gitRoot);
  const promptFile = promptBuf.promptFilePath(inp.sessionId, gitRoot, adapter.PROMPT_PREFIX);
  fs.appendFileSync(promptFile, JSON.stringify({ role: 'assistant', content: lastMsg }) + '\n');
})();
