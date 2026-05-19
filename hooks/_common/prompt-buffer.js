'use strict';
const fs = require('fs');
const path = require('path');

function ensureContextDir(gitRoot) {
  fs.mkdirSync(path.join(gitRoot, '.context-capture'), { recursive: true });
}

// prefix examples: '.claude-prompts-', '.codex-prompts-'
function promptFilePath(sid, root, prefix) {
  return path.join(root, '.context-capture', `${prefix}${sid}`);
}
function offsetFilePath(sid, root, prefix) {
  // Mirror prompt prefix: '.claude-prompts-' -> '.claude-offset-'
  const variant = prefix.replace('-prompts-', '-offset-');
  return path.join(root, '.context-capture', `${variant}${sid}`);
}
function deltaFilePath(sid, root, prefix) {
  const variant = prefix.replace('-prompts-', '-conversation-delta-');
  return path.join(root, '.context-capture', `${variant}${sid}`);
}
function pendingQuestionPath(sid, root, prefix) {
  const variant = prefix.replace('-prompts-', '-pending-question-')
                        .replace(/^\./, '.');
  // e.g., '.claude-prompts-' -> '.claude-pending-question-'
  return path.join(root, '.context-capture', `${variant}${sid}`);
}

function updateDelta(sid, root, prefix) {
  const promptFile = promptFilePath(sid, root, prefix);
  const offsetFile = offsetFilePath(sid, root, prefix);
  const deltaFile  = deltaFilePath(sid, root, prefix);
  if (!fs.existsSync(promptFile)) return;
  let lastIndex = 0;
  if (fs.existsSync(offsetFile)) {
    lastIndex = parseInt(fs.readFileSync(offsetFile, 'utf8').trim(), 10) || 0;
  }
  const raw = fs.readFileSync(promptFile, 'utf8');
  const total = (raw.match(/\n/g) || []).length;
  if (total > lastIndex) {
    const lines = raw.split('\n');
    fs.writeFileSync(deltaFile, lines.slice(lastIndex).join('\n'));
  }
  fs.writeFileSync(offsetFile, String(total));
}

module.exports = {
  ensureContextDir,
  promptFilePath,
  offsetFilePath,
  deltaFilePath,
  pendingQuestionPath,
  updateDelta,
};
