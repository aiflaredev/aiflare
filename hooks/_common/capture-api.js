'use strict';
const fs = require('fs');
const promptBuf = require('./prompt-buffer');

async function uploadPromptFile(sessionId, gitRoot, prefix, endpoint, apiKey, log) {
  const promptFile = promptBuf.promptFilePath(sessionId, gitRoot, prefix);
  if (!fs.existsSync(promptFile)) return;
  const content = fs.readFileSync(promptFile, 'utf8');
  const payload = JSON.stringify({ claudeSessionId: sessionId, content });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${endpoint}/api/v1/work-sessions/prompt`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: payload,
      signal: controller.signal,
    });
    if (!res.ok) log.warn('prompt upload failed');
  } catch {
    log.warn('prompt upload failed');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { uploadPromptFile };
