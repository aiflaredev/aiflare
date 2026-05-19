'use strict';

function makeLogger(hookName, sessionId) {
  const sidShort = (sessionId || '').slice(0, 8);
  const emit = (level, msg) =>
    process.stderr.write(`[${level}] [hook=${hookName} session=${sidShort}] ${msg}\n`);
  return {
    info:  (m) => emit('INFO', m),
    warn:  (m) => emit('WARN', m),
    error: (m) => emit('ERROR', m),
  };
}

module.exports = { makeLogger };
