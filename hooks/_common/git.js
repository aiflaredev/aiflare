'use strict';

// Recognize "git commit" invocations in a Bash command line.
// Supports compound commands (&&, ;, |) as well as plain invocations.
// The settings.json `if: Bash(git commit:*)` matcher handles context at the framework
// level, so this function does not need to reject every false-positive shell context.
function isGitCommitCommand(command) {
  if (!command || typeof command !== 'string') return false;
  return /(?:^|[\s;&|])git\s+commit(?:\s|$|;|&|\|)/.test(command);
}

module.exports = { isGitCommitCommand };
