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
  // Defense-in-depth: even in environments where the `if` filter in settings.local.json is ignored
  // (Claude Code below v2.1.85, or fallback firing due to unparseable compound commands),
  // exit immediately if the command is not a git commit.
  const cmd = (inp.input && inp.input.tool_input && inp.input.tool_input.command) ||
              (inp.input && inp.input.command) || '';
  if (!git.isGitCommitCommand(cmd)) return;
  const log = logger.makeLogger(HOOK_NAME, inp.sessionId);
  const gitRoot = config.getGitRoot();
  if (!gitRoot) return;
  promptBuf.ensureContextDir(gitRoot);
  if (config.hasAiflareConfig(gitRoot)) {
    const cfg = config.readAiflareConfig(gitRoot);
    if (cfg) {
      await captureApi.uploadPromptFile(
        inp.sessionId, gitRoot, adapter.PROMPT_PREFIX,
        cfg.endpoint, cfg.apiKey, log,
      );
      promptBuf.updateDelta(inp.sessionId, gitRoot, adapter.PROMPT_PREFIX);
    }
  }
  if (config.hasContextCaptureSkill(gitRoot)) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: 'git commit completed. You must invoke the context-capture skill to capture the work context.',
      },
    }));
  }
})();
