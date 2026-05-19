#!/usr/bin/env node
'use strict';
const adapter = require('./_adapter');
const config = require('../_common/config');
const promptBuf = require('../_common/prompt-buffer');
const captureApi = require('../_common/capture-api');
const git = require('../_common/git');
const logger = require('../_common/logger');

const HOOK_NAME = 'post-tool-use-bash-git-commit';

(async () => {
  const inp = await adapter.readInput();
  if (!inp) return;
  // Filter: tool_name == Bash + command is a `git commit` invocation
  const toolName = inp.input.tool_name;
  if (toolName !== 'Bash') return;
  const command = inp.input.tool_input && inp.input.tool_input.command;
  if (!git.isGitCommitCommand(command)) return;

  const log = logger.makeLogger(HOOK_NAME, inp.sessionId);
  const gitRoot = config.getGitRoot();
  if (!gitRoot) return;
  promptBuf.ensureContextDir(gitRoot);
  const cfg = config.readAiflareConfig(gitRoot);
  if (cfg) {
    await captureApi.uploadPromptFile(
      inp.sessionId, gitRoot, adapter.PROMPT_PREFIX,
      cfg.endpoint, cfg.apiKey, log,
    );
    promptBuf.updateDelta(inp.sessionId, gitRoot, adapter.PROMPT_PREFIX);
  }
})();
