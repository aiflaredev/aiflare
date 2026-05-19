'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getGitRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { return ''; }
}

function hasAiflareConfig(gitRoot) {
  return fs.existsSync(path.join(gitRoot, 'aiflare.yml'));
}

function readAiflareConfig(gitRoot) {
  const cfg = path.join(gitRoot, 'aiflare.yml');
  if (!fs.existsSync(cfg)) return null;
  const content = fs.readFileSync(cfg, 'utf8');
  const apiKeyMatch = content.match(/^api_key:\s*(.+)$/m);
  if (!apiKeyMatch) return null;
  const apiKey = apiKeyMatch[1].replace(/['"]/g, '').trim();
  if (!apiKey) return null;
  const endpointMatch = content.match(/^endpoint:\s*(.+)$/m);
  let endpoint = endpointMatch ? endpointMatch[1].replace(/['"]/g, '').trim() : '';
  if (!endpoint) endpoint = 'https://api.aiflare.dev';
  return { apiKey, endpoint };
}

function hasContextCaptureSkill(gitRoot) {
  return fs.existsSync(path.join(gitRoot, '.claude', 'skills', 'context-capture'));
}

module.exports = { getGitRoot, hasAiflareConfig, readAiflareConfig, hasContextCaptureSkill };
