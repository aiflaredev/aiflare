#!/usr/bin/env node
// AIFlare cross-platform installer (Node.js, CommonJS)
// Usage (note: save as .cjs so this works in projects with "type": "module"):
//   curl -fsSL https://aiflare.dev/install.js -o install.cjs && node install.cjs && rm install.cjs
//   curl.exe -fsSL https://aiflare.dev/install.js -o install.cjs; node install.cjs; del install.cjs
//   iwr -useb https://aiflare.dev/install.js -OutFile install.cjs; node install.cjs; del install.cjs
//
// Override the bundle URL for local/preview testing:
//   AIFLARE_ZIP_URL=http://localhost:8123/aiflare.zip node install.cjs

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const readline = require('readline');
const { execSync } = require('child_process');

const isWindows = process.platform === 'win32';
const useColor = process.stdout.isTTY;
const ZIP_URL = process.env.AIFLARE_ZIP_URL || 'https://aiflare.dev/aiflare.zip';
const OTEL_DEFAULT_ENDPOINT = 'https://otel.aiflare.dev';
// Phase 2 모니터링 재오픈 시 true 로 토글 — 사용자 .claude/settings.local.json 에 OTel env 9개 주입.
// 자세한 결정 배경: docs/superpowers/plans/2026-05-16-monitoring-launch-hide.md
const INSTALL_OTEL_TELEMETRY = false;

const COLOR = {
  green:  useColor ? '\x1b[32m' : '',
  yellow: useColor ? '\x1b[33m' : '',
  red:    useColor ? '\x1b[31m' : '',
  bold:   useColor ? '\x1b[1m'  : '',
  cyan:   useColor ? '\x1b[36m' : '',
  reset:  useColor ? '\x1b[0m'  : '',
};

const info    = (m) => console.log(`${COLOR.green}[OK]${COLOR.reset} ${m}`);
const success = (m) => console.log(`${COLOR.green}${COLOR.bold}[OK] ${m}${COLOR.reset}`);
const warn    = (m) => console.log(`${COLOR.yellow}[!]${COLOR.reset} ${m}`);
const errlog  = (m) => console.error(`${COLOR.red}[X]${COLOR.reset} ${m}`);

function commandExists(cmd) {
  const probe = isWindows ? `where ${cmd}` : `command -v ${cmd}`;
  try {
    execSync(probe, { stdio: 'ignore', shell: true });
    return true;
  } catch {
    return false;
  }
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyTree(src, dst) {
  fs.cpSync(src, dst, { recursive: true });
}

function downloadToFile(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, (res) => {
      const status = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error(`Too many redirects: ${url}`));
        const next = new URL(res.headers.location, url).toString();
        return downloadToFile(next, dest, redirectsLeft - 1).then(resolve, reject);
      }
      if (status !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${status} from ${url}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close((err) => (err ? reject(err) : resolve())));
      file.on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
    });
    req.on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

function extractZip(zipPath, destDir) {
  if (isWindows) {
    // Windows 10 build 1803+ ships bsdtar (`tar.exe`) which extracts zip natively.
    try {
      execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: 'ignore' });
      return;
    } catch {
      // Fallback: PowerShell Expand-Archive (works on PowerShell 5.0+).
      const ps = `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`;
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, { stdio: 'ignore' });
    }
  } else {
    // macOS / Linux — use unzip.
    execSync(`unzip -q "${zipPath}" -d "${destDir}"`, { stdio: 'ignore' });
  }
}

function hookCommand(scriptName) {
  // Claude Code expands $CLAUDE_PROJECT_DIR itself (platform-agnostic, default bash shell on all OSes).
  // Quoting the variable handles paths with spaces; forward slashes work on Windows too.
  return `node "$CLAUDE_PROJECT_DIR"/.claude/hooks/${scriptName}`;
}

function buildCodexHooksJson() {
  // 명령어는 relative path 사용 — Codex는 hook을 프로젝트 루트 cwd로 실행한다는 전제.
  return {
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: 'node ./.codex/hooks/session-start.js' }] }
      ],
      PostToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: 'node ./.codex/hooks/post-tool-use-bash-git-commit.js' }]
        }
      ],
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: 'node ./.codex/hooks/user-prompt-submit.js' }] }
      ],
      Stop: [
        { hooks: [{ type: 'command', command: 'node ./.codex/hooks/stop.js', timeout: 10 }] }
      ],
    },
  };
}

function mergeCodexHooks(existing, ours) {
  const result = { ...existing, hooks: { ...(existing.hooks || {}) } };
  for (const [event, ourEntries] of Object.entries(ours.hooks)) {
    const cur = Array.isArray(result.hooks[event]) ? result.hooks[event] : [];
    const seen = new Set(cur.map((e) => JSON.stringify(e)));
    const next = [...cur];
    for (const e of ourEntries) {
      const key = JSON.stringify(e);
      if (!seen.has(key)) { next.push(e); seen.add(key); }
    }
    result.hooks[event] = next;
  }
  return result;
}

// Minimal TOML emitter for our specific shape (no general-purpose parse).
// We only need to write/merge a single [mcp_servers.aiflare] section.
function serializeCodexMcpToml({ entryPath }) {
  // Escape backslash and double-quote in TOML strings (basic strings).
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return [
    '[mcp_servers.aiflare]',
    'command = "node"',
    `args = [ "${esc(entryPath)}" ]`,
    '',
  ].join('\n');
}

function installCodexMcpServerToml({ entryPath }) {
  const file = path.join('.codex', 'config.toml');
  const ourSection = serializeCodexMcpToml({ entryPath });
  fs.mkdirSync('.codex', { recursive: true });

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, ourSection);
    info(`Codex MCP config created -> ${file}`);
    return;
  }

  const backup = `${file}.bak`;
  fs.copyFileSync(file, backup);
  try {
    const existing = fs.readFileSync(file, 'utf8');
    // Match the entire [mcp_servers.aiflare] block: header + key=value lines until
    // the next [section] header or end of file.
    const blockRe = /\[mcp_servers\.aiflare\][\s\S]*?(?=\n\[|$)/;
    let merged;
    if (blockRe.test(existing)) {
      // Replace the existing aiflare block. Ensure trailing newline before next section.
      merged = existing.replace(blockRe, ourSection.trimEnd());
    } else {
      // Append, ensuring blank line separation.
      const sep = existing.endsWith('\n') ? '\n' : '\n\n';
      merged = existing + sep + ourSection;
    }
    fs.writeFileSync(file, merged);
    info(`Codex MCP config merged -> ${file} (backup: ${backup})`);
  } catch (e) {
    fs.copyFileSync(backup, file);
    warn(`Codex MCP TOML merge failed: ${e.message}. Original ${file} restored.`);
  }
}

function buildSettingsJson() {
  return {
    hooks: {
      // SessionStart exports CLAUDE_SESSION_ID into $CLAUDE_ENV_FILE so capture.js
      // (and other Bash subprocesses) can resolve the current session deterministically.
      // Without this, parallel Claude Code sessions on the same project mis-route captures
      // because capture.js falls back to a "most-recent-mtime of .claude-prompts-*" heuristic.
      SessionStart: [
        { hooks: [{ type: 'command', command: hookCommand('session-start.js') }] },
      ],
      PostToolUse: [
        {
          matcher: 'Bash',
          hooks: [{
            type: 'command',
            command: hookCommand('post-tool-use-bash-git-commit.js'),
            if: 'Bash(git commit:*)',
          }],
        },
        {
          matcher: 'AskUserQuestion',
          hooks: [{
            type: 'command',
            command: hookCommand('post-tool-use-ask-user-question.js'),
          }],
        },
      ],
      UserPromptSubmit: [
        { matcher: '', hooks: [{ type: 'command', command: hookCommand('user-prompt-submit.js') }] },
      ],
      Stop: [
        { matcher: '', hooks: [{ type: 'command', command: hookCommand('stop.js'), timeout: 10 }] },
      ],
      SessionEnd: [
        { hooks: [{ type: 'command', command: hookCommand('session-end.js') }] },
      ],
    },
  };
}

const AIFLARE_SIGNATURES = [
  'aiflare.yml',
  '.context-capture',
  'api/v1/work-sessions',
  'api/v1/captures',
  '.claude/hooks/',
  '.claude\\hooks\\',
];

function containsAiflareSignature(value) {
  if (value == null) return false;
  if (typeof value === 'string') return AIFLARE_SIGNATURES.some((s) => value.includes(s));
  if (Array.isArray(value)) return value.some(containsAiflareSignature);
  if (typeof value === 'object') return Object.values(value).some(containsAiflareSignature);
  return false;
}

function mergeHooks(dst, src) {
  dst.hooks = dst.hooks || {};
  for (const [event, srcEntries] of Object.entries(src.hooks || {})) {
    if (!Array.isArray(srcEntries)) continue;
    const existing = Array.isArray(dst.hooks[event]) ? dst.hooks[event] : [];
    const preserved = existing.filter((e) => !containsAiflareSignature(e));
    dst.hooks[event] = [...preserved, ...srcEntries];
  }
  return dst;
}

function mergeMcp(dst, src) {
  dst.mcpServers = dst.mcpServers || {};
  for (const [name, cfg] of Object.entries(src.mcpServers || {})) {
    dst.mcpServers[name] = cfg;
  }
  return dst;
}

function ensureGitignoreEntry(gitignorePath, entry) {
  let content = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const lines = content.split(/\r?\n/);
  if (lines.includes(entry)) {
    info(`${entry} already in .gitignore`);
    return;
  }
  if (content.length > 0 && !content.endsWith('\n')) content += '\n';
  content += `${entry}\n`;
  fs.writeFileSync(gitignorePath, content);
  info(`Added ${entry} to .gitignore`);
}

function parseAiflareYml(text) {
  // NOTE: simple parser for aiflare.yml (api_key, endpoint, otel_endpoint).
  // Comment-strip happens before quote handling, so '#' inside quoted values
  // would be corrupted. None of our 3 known fields can contain '#', so this
  // is acceptable. If new fields with '#' are added, replace this parser.
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    // bare YAML key: letter/underscore start, then alphanumeric/underscore
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[m[1]] = value;
  }
  return result;
}

function buildOtelEnv({ api_key, otel_endpoint }) {
  const endpoint = otel_endpoint || OTEL_DEFAULT_ENDPOINT;
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
    OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
    OTEL_EXPORTER_OTLP_HEADERS: `Authorization=Bearer ${api_key}`,
    OTEL_METRICS_INCLUDE_SESSION_ID: 'false',
    OTEL_METRICS_INCLUDE_ACCOUNT_UUID: 'false',
    OTEL_METRICS_INCLUDE_VERSION: 'true',
  };
}

function mergeOtelEnv(dst, otelEnv) {
  if (!dst.env || typeof dst.env !== 'object') dst.env = {};
  for (const [k, v] of Object.entries(otelEnv)) {
    dst.env[k] = v;
  }
  return dst;
}

function selectAgents({ argvAgent, hasClaudeDir, hasCodexDir, isInteractive }) {
  if (argvAgent) {
    const v = String(argvAgent).toLowerCase();
    if (v === 'claude') return { installClaude: true, installCodex: false };
    if (v === 'codex')  return { installClaude: false, installCodex: true };
    if (v === 'both')   return { installClaude: true, installCodex: true };
    throw new Error(`Invalid --agent value: ${argvAgent} (expected claude|codex|both)`);
  }
  if (!isInteractive) {
    if (hasClaudeDir && hasCodexDir) return { installClaude: true, installCodex: true };
    if (hasCodexDir)                 return { installClaude: false, installCodex: true };
    return { installClaude: true, installCodex: false };
  }
  throw new Error('selectAgents: isInteractive=true requires caller-supplied prompt result');
}

// Arrow-key menu using raw stdin. Requires TTY (caller must check).
// Fallback: if raw mode is unavailable, falls back to a single-line readline prompt.
function promptAgentChoice({ hasClaudeDir, hasCodexDir }) {
  return new Promise((resolve) => {
    const detected = hasClaudeDir && hasCodexDir ? 'both' : hasCodexDir ? 'codex' : 'claude';
    const items = [
      { value: 'claude', label: 'Claude Code' },
      { value: 'codex',  label: 'Codex' },
      { value: 'both',   label: 'Both' },
    ];
    let idx = Math.max(0, items.findIndex((it) => it.value === detected));

    const stdin = process.stdin;
    const stdout = process.stdout;

    // Raw-mode availability check. Some environments (CI pipes, non-TTY) lack setRawMode.
    if (typeof stdin.setRawMode !== 'function') {
      const rl = readline.createInterface({ input: stdin, output: stdout });
      rl.question(`Which agent(s) to install for? [claude/codex/both] (detected: ${detected}): `, (ans) => {
        rl.close();
        const v = (ans || '').trim().toLowerCase() || detected;
        try { resolve(selectAgents({ argvAgent: v, hasClaudeDir, hasCodexDir, isInteractive: false })); }
        catch (e) { errlog(e.message); process.exit(1); }
      });
      return;
    }

    const HIDE_CURSOR = '\x1b[?25l';
    const SHOW_CURSOR = '\x1b[?25h';
    const HEADER = 'Which agent(s) to install for? (Use ↑↓ to select, Enter to confirm)\n\n';

    function render(first) {
      if (!first) {
        // Move cursor up by (header + blank + items.length) lines and clear each
        const lines = HEADER.split('\n').length - 1 + items.length;
        for (let i = 0; i < lines; i++) stdout.write('\x1b[1A\x1b[2K');
      }
      stdout.write(HEADER);
      for (let i = 0; i < items.length; i++) {
        const selected = i === idx;
        const marker = selected ? '> ' : '  ';
        const labelStyled = selected ? `${COLOR.cyan}${items[i].label}${COLOR.reset}` : items[i].label;
        const note = items[i].value === detected ? `  ${COLOR.green}(detected)${COLOR.reset}` : '';
        stdout.write(`  ${marker}${labelStyled}${note}\n`);
      }
    }

    const wasRaw = stdin.isRaw;
    stdout.write(HIDE_CURSOR);
    render(true);
    try { stdin.setRawMode(true); } catch { /* ignore — covered by the fallback above */ }
    stdin.resume();
    stdin.setEncoding('utf8');

    function teardown() {
      stdin.removeListener('data', onData);
      try { stdin.setRawMode(Boolean(wasRaw)); } catch { /* ignore */ }
      stdin.pause();
      stdout.write(SHOW_CURSOR);
    }

    function onData(key) {
      if (key === '') { // Ctrl+C
        teardown();
        stdout.write('\nCancelled.\n');
        process.exit(1);
      }
      if (key === '\r' || key === '\n') { // Enter
        teardown();
        const chosen = items[idx].value;
        try { resolve(selectAgents({ argvAgent: chosen, hasClaudeDir, hasCodexDir, isInteractive: false })); }
        catch (e) { errlog(e.message); process.exit(1); }
        return;
      }
      if (key === '\x1b[A' || key === 'k') { // Up
        idx = (idx - 1 + items.length) % items.length;
        render(false);
        return;
      }
      if (key === '\x1b[B' || key === 'j') { // Down
        idx = (idx + 1) % items.length;
        render(false);
        return;
      }
      // Numeric shortcuts: 1/2/3 select directly
      if (key === '1' || key === '2' || key === '3') {
        idx = Number(key) - 1;
        render(false);
        return;
      }
    }

    stdin.on('data', onData);
  });
}

async function main() {
  for (const cmd of ['git', 'node']) {
    if (!commandExists(cmd)) {
      errlog(`${cmd} is required but not installed. Please install ${cmd} and try again.`);
      process.exit(1);
    }
  }
  if (!isWindows && !commandExists('unzip')) {
    errlog('unzip is required but not installed. Please install unzip and try again.');
    process.exit(1);
  }

  let gitRoot;
  try {
    gitRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    errlog('Not a git repository. Please run from the project root.');
    process.exit(1);
  }
  if (!gitRoot) {
    errlog('Not a git repository. Please run from the project root.');
    process.exit(1);
  }
  process.chdir(gitRoot);

  const ymlPath = path.join(gitRoot, 'aiflare.yml');
  if (!fs.existsSync(ymlPath)) {
    errlog('aiflare.yml not found in project root.');
    console.log('');
    console.log('  Setup steps:');
    console.log('    1) Sign up & generate an API key at https://aiflare.dev');
    console.log(`    2) Place the downloaded aiflare.yml in ${gitRoot}`);
    console.log('    3) Re-run this installer');
    console.log('');
    process.exit(1);
  }

  let aiflareConfig;
  try {
    aiflareConfig = parseAiflareYml(fs.readFileSync(ymlPath, 'utf8'));
  } catch (e) {
    errlog(`Failed to read aiflare.yml: ${e.message}`);
    process.exit(1);
  }
  if (!aiflareConfig.api_key) {
    errlog('aiflare.yml is missing required field: api_key');
    console.log('');
    console.log('  To fix: re-download aiflare.yml from https://aiflare.dev');
    console.log('');
    process.exit(1);
  }
  const otelEnv = INSTALL_OTEL_TELEMETRY
    ? buildOtelEnv({
        api_key: aiflareConfig.api_key,
        otel_endpoint: aiflareConfig.otel_endpoint,
      })
    : null;

  const argvAgent = (() => {
    const i = process.argv.indexOf('--agent');
    return i >= 0 ? process.argv[i + 1] : null;
  })();
  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;
  const hasClaudeDir = fs.existsSync('.claude');
  const hasCodexDir  = fs.existsSync('.codex');
  let agentChoice;
  if (isInteractive && !argvAgent) {
    agentChoice = await promptAgentChoice({ hasClaudeDir, hasCodexDir });
  } else {
    agentChoice = selectAgents({ argvAgent, hasClaudeDir, hasCodexDir, isInteractive: false });
  }
  info(`Installing for: ${agentChoice.installClaude ? 'Claude Code ' : ''}${agentChoice.installCodex ? 'Codex' : ''}`);

  console.log('');
  console.log('Starting AIFlare installation...');
  console.log('');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aiflare-'));
  const cloneDir = path.join(tmpRoot, 'repo');
  const zipPath  = path.join(tmpRoot, 'aiflare.zip');
  fs.mkdirSync(cloneDir, { recursive: true });

  try {
    try {
      await downloadToFile(ZIP_URL, zipPath);
    } catch (e) {
      errlog(`Failed to download bundle from ${ZIP_URL}: ${e.message}`);
      process.exit(1);
    }
    try {
      extractZip(zipPath, cloneDir);
    } catch (e) {
      errlog(`Failed to extract bundle ${zipPath}: ${e.message}`);
      process.exit(1);
    }

    // ── Claude Code install block ────────────────────────────────────────────
    const skillsSource = path.join(cloneDir, 'skills');
    const mcpSource    = path.join(cloneDir, 'mcp-server');

    if (!fs.existsSync(skillsSource)) {
      errlog('skills/ directory not found in bundle.');
      process.exit(1);
    }

    if (agentChoice.installClaude) {
    // Skills
    const skillsTarget = path.join('.claude', 'skills');
    fs.mkdirSync(skillsTarget, { recursive: true });
    for (const ent of fs.readdirSync(skillsSource, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const target = path.join(skillsTarget, ent.name);
      if (fs.existsSync(target)) {
        rmrf(target);
        warn(`Replaced existing skill: ${ent.name}`);
      }
      copyTree(path.join(skillsSource, ent.name), target);
      info(`Skill installed -> ${target}`);
    }

    // Drop non-Node script variants from each skill (keep *.js, remove *.sh and *.ps1)
    for (const ent of fs.readdirSync(skillsTarget, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const scriptsDir = path.join(skillsTarget, ent.name, 'scripts');
      if (!fs.existsSync(scriptsDir)) continue;
      for (const f of fs.readdirSync(scriptsDir)) {
        if (f.endsWith('.sh') || f.endsWith('.ps1')) {
          try { fs.unlinkSync(path.join(scriptsDir, f)); } catch { /* ignore */ }
        }
      }
    }

    // MCP server
    const mcpTarget = path.join('.claude', 'mcp-server');
    if (fs.existsSync(mcpSource)) {
      rmrf(mcpTarget);
      copyTree(mcpSource, mcpTarget);
      if (commandExists('npm')) {
        try {
          execSync('npm install --production --silent', { cwd: mcpTarget, stdio: 'ignore' });
        } catch { /* non-fatal */ }
      }
      info(`MCP Server ready -> ${mcpTarget}`);
    }

    // Hooks (Claude Code variant: _common + claude-code)
    // source 트리에서는 hooks/_common/과 hooks/claude-code/가 형제이므로
    // entrypoint는 require('../_common/...') 형태다. 설치 시 _common/을 hooks 폴더
    // 안으로 평탄화하므로 require 경로도 require('./_common/...')로 일괄 치환한다.
    const hooksTarget = path.join('.claude', 'hooks');
    const claudeHooksSrc = path.join(cloneDir, 'hooks', 'claude-code');
    const commonHooksSrc = path.join(cloneDir, 'hooks', '_common');
    if (fs.existsSync(claudeHooksSrc) && fs.existsSync(commonHooksSrc)) {
      rmrf(hooksTarget);
      copyTree(claudeHooksSrc, hooksTarget);
      copyTree(commonHooksSrc, path.join(hooksTarget, '_common'));
      // Flatten require paths: '../_common/X' -> './_common/X'
      for (const f of fs.readdirSync(hooksTarget)) {
        const full = path.join(hooksTarget, f);
        if (fs.statSync(full).isFile() && f.endsWith('.js')) {
          const src = fs.readFileSync(full, 'utf8');
          fs.writeFileSync(full, src.replace(/require\('\.\.\/_common\//g, "require('./_common/"));
        }
      }
      info(`Hook scripts installed -> ${hooksTarget}`);
    } else {
      warn(`Hook scripts source not found: ${claudeHooksSrc} or ${commonHooksSrc}`);
    }

    // settings.local.json
    const settingsFile = path.join('.claude', 'settings.local.json');
    fs.mkdirSync('.claude', { recursive: true });
    const settingsContent = buildSettingsJson();
    if (!fs.existsSync(settingsFile)) {
      if (otelEnv) mergeOtelEnv(settingsContent, otelEnv);
      fs.writeFileSync(settingsFile, JSON.stringify(settingsContent, null, 2) + '\n');
      info(`Hooks config created -> ${settingsFile}${otelEnv ? ' (with OTel env)' : ''}`);
    } else {
      const backup = `${settingsFile}.bak`;
      fs.copyFileSync(settingsFile, backup);
      try {
        const existing = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        const merged = mergeHooks(existing, settingsContent);
        if (otelEnv) mergeOtelEnv(merged, otelEnv);
        fs.writeFileSync(settingsFile, JSON.stringify(merged, null, 2) + '\n');
        info(`Hooks merged -> ${settingsFile}${otelEnv ? ' (with OTel env)' : ''} (backup: ${backup})`);
      } catch (e) {
        fs.copyFileSync(backup, settingsFile);
        warn(`Settings merge failed: ${e.message}. Original ${settingsFile} restored.`);
        const referenceContent = otelEnv
          ? mergeOtelEnv({ ...settingsContent }, otelEnv)
          : { ...settingsContent };
        const ref = path.join('.claude', 'aiflare_settings.reference.json');
        fs.writeFileSync(ref, JSON.stringify(referenceContent, null, 2) + '\n');
        console.log(`  Reference saved to ${ref} for manual merge.`);
      }
    }

    // .mcp.json
    const mcpJson = '.mcp.json';
    const mcpConfig = {
      mcpServers: {
        aiflare: {
          command: 'node',
          args: ['.claude/mcp-server/dist/index.js'],
        },
      },
    };
    if (!fs.existsSync(mcpJson)) {
      fs.writeFileSync(mcpJson, JSON.stringify(mcpConfig, null, 2) + '\n');
      info(`MCP config created -> ${mcpJson}`);
    } else {
      const backup = `${mcpJson}.bak`;
      fs.copyFileSync(mcpJson, backup);
      try {
        const existing = JSON.parse(fs.readFileSync(mcpJson, 'utf8'));
        const merged = mergeMcp(existing, mcpConfig);
        fs.writeFileSync(mcpJson, JSON.stringify(merged, null, 2) + '\n');
        info(`MCP config merged -> ${mcpJson} (backup: ${backup})`);
      } catch (e) {
        fs.copyFileSync(backup, mcpJson);
        warn(`MCP config merge failed: ${e.message}. Original ${mcpJson} restored.`);
        const ref = path.join('.claude', 'mcp.reference.json');
        fs.writeFileSync(ref, JSON.stringify(mcpConfig, null, 2) + '\n');
        console.log(`  Reference saved to ${ref} for manual merge.`);
      }
    }

    // CLAUDE.md
    const claudeMd = 'CLAUDE.md';
    const directive = 'After git commit, you must always run the context-capture skill.';
    if (!fs.existsSync(claudeMd)) {
      fs.writeFileSync(claudeMd, directive + '\n');
      info('CLAUDE.md created with directive');
    } else {
      const md = fs.readFileSync(claudeMd, 'utf8');
      if (!md.includes('context-capture')) {
        fs.appendFileSync(claudeMd, '\n' + directive + '\n');
        info('Directive added to CLAUDE.md');
      } else {
        info('context-capture directive already exists in CLAUDE.md');
      }
    }
    } // end if (agentChoice.installClaude)

    // ── Codex install block ──────────────────────────────────────────────────
    if (agentChoice.installCodex) {
      // Skills (Codex — REPO scope)
      const codexSkillsTarget = path.join('.agents', 'skills');
      fs.mkdirSync(codexSkillsTarget, { recursive: true });
      for (const ent of fs.readdirSync(skillsSource, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const target = path.join(codexSkillsTarget, ent.name);
        if (fs.existsSync(target)) { rmrf(target); warn(`Replaced existing codex skill: ${ent.name}`); }
        copyTree(path.join(skillsSource, ent.name), target);
        info(`Codex skill installed -> ${target}`);
      }

      // Drop non-Node script variants from each codex skill (mirror Claude block)
      for (const ent of fs.readdirSync(codexSkillsTarget, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const scriptsDir = path.join(codexSkillsTarget, ent.name, 'scripts');
        if (!fs.existsSync(scriptsDir)) continue;
        for (const f of fs.readdirSync(scriptsDir)) {
          if (f.endsWith('.sh') || f.endsWith('.ps1')) {
            try { fs.unlinkSync(path.join(scriptsDir, f)); } catch { /* ignore */ }
          }
        }
      }

      // MCP server (Codex)
      const codexMcpTarget = path.join('.codex', 'mcp-server');
      if (fs.existsSync(mcpSource)) {
        rmrf(codexMcpTarget);
        copyTree(mcpSource, codexMcpTarget);
        if (commandExists('npm')) {
          try { execSync('npm install --production --silent', { cwd: codexMcpTarget, stdio: 'ignore' }); }
          catch { /* non-fatal */ }
        }
        info(`Codex MCP Server ready -> ${codexMcpTarget}`);
      }

      // Hooks (Codex variant: _common + codex)
      const codexHooksTarget = path.join('.codex', 'hooks');
      const codexHooksSrc = path.join(cloneDir, 'hooks', 'codex');
      const commonHooksSrc = path.join(cloneDir, 'hooks', '_common');
      if (fs.existsSync(codexHooksSrc) && fs.existsSync(commonHooksSrc)) {
        rmrf(codexHooksTarget);
        copyTree(codexHooksSrc, codexHooksTarget);
        copyTree(commonHooksSrc, path.join(codexHooksTarget, '_common'));
        // Flatten require paths: '../_common/X' -> './_common/X'
        for (const f of fs.readdirSync(codexHooksTarget)) {
          const full = path.join(codexHooksTarget, f);
          if (fs.statSync(full).isFile() && f.endsWith('.js')) {
            const src = fs.readFileSync(full, 'utf8');
            fs.writeFileSync(full, src.replace(/require\('\.\.\/_common\//g, "require('./_common/"));
          }
        }
        info(`Codex hook scripts installed -> ${codexHooksTarget}`);
      } else {
        warn(`Codex hook source not found: ${codexHooksSrc} or ${commonHooksSrc}`);
      }

      // .codex/hooks.json (Codex hook 등록)
      const codexHooksJson = path.join('.codex', 'hooks.json');
      fs.mkdirSync('.codex', { recursive: true });
      const codexHooksContent = buildCodexHooksJson();
      if (!fs.existsSync(codexHooksJson)) {
        fs.writeFileSync(codexHooksJson, JSON.stringify(codexHooksContent, null, 2) + '\n');
        info(`Codex hooks config created -> ${codexHooksJson}`);
      } else {
        const backup = `${codexHooksJson}.bak`;
        fs.copyFileSync(codexHooksJson, backup);
        try {
          const existing = JSON.parse(fs.readFileSync(codexHooksJson, 'utf8'));
          const merged = mergeCodexHooks(existing, codexHooksContent);
          fs.writeFileSync(codexHooksJson, JSON.stringify(merged, null, 2) + '\n');
          info(`Codex hooks merged -> ${codexHooksJson} (backup: ${backup})`);
        } catch (e) {
          fs.copyFileSync(backup, codexHooksJson);
          warn(`Codex hooks merge failed: ${e.message}. Original ${codexHooksJson} restored.`);
        }
      }

      // .codex/config.toml — mcp_servers 등록
      installCodexMcpServerToml({ entryPath: path.join('.codex', 'mcp-server', 'dist', 'index.js') });

      // AGENTS.md (Codex 지시문)
      const agentsMd = 'AGENTS.md';
      const directive = 'After git commit, you must always run the context-capture skill.';
      if (!fs.existsSync(agentsMd)) {
        fs.writeFileSync(agentsMd, directive + '\n');
        info('AGENTS.md created with directive');
      } else {
        const md = fs.readFileSync(agentsMd, 'utf8');
        if (!md.includes('context-capture')) {
          fs.appendFileSync(agentsMd, '\n' + directive + '\n');
          info('Directive added to AGENTS.md');
        } else {
          info('context-capture directive already exists in AGENTS.md');
        }
      }
    } // end if (agentChoice.installCodex)

    // ── Common items (always run) ────────────────────────────────────────────

    // .gitignore
    const gitignorePath = '.gitignore';
    if (!fs.existsSync(gitignorePath)) fs.writeFileSync(gitignorePath, '');
    const ignoreEntries = ['aiflare.yml', '.context-capture/'];
    if (agentChoice.installClaude) ignoreEntries.push('.claude/settings.local.json');
    if (agentChoice.installCodex)  ignoreEntries.push('.codex/hooks.json');
    for (const entry of ignoreEntries) ensureGitignoreEntry(gitignorePath, entry);

    // pre-push hook (bash; works on Unix and Git Bash on Windows)
    const prePushSource = path.join(cloneDir, 'scripts', 'githooks', 'pre-push');
    const prePushTarget = path.join('.git', 'hooks', 'pre-push');
    if (fs.existsSync(prePushSource)) {
      if (fs.existsSync(prePushTarget)) {
        warn(`Existing ${prePushTarget} found. Will not overwrite.`);
        console.log('  Please merge manually:');
        console.log(`    cat ${prePushSource}`);
      } else {
        fs.copyFileSync(prePushSource, prePushTarget);
        try { fs.chmodSync(prePushTarget, 0o755); } catch { /* Windows: ignore */ }
        info(`pre-push hook installed -> ${prePushTarget}`);
      }
    } else {
      warn(`pre-push hook script not found: ${prePushSource}`);
    }

    // Verification
    console.log('');
    info('Verifying installation...');
    let verifyFailed = false;

    // Verify Claude skills
    if (agentChoice.installClaude) {
      const skillsTarget = path.join('.claude', 'skills');
      for (const ent of fs.readdirSync(skillsTarget, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const skillMd = path.join(skillsTarget, ent.name, 'SKILL.md');
        if (!fs.existsSync(skillMd)) {
          warn(`Skill missing SKILL.md: ${ent.name}`);
          verifyFailed = true;
        }
      }

      const mcpTarget = path.join('.claude', 'mcp-server');
      if (fs.existsSync(mcpTarget)) {
        const mcpEntry = path.join(mcpTarget, 'dist', 'index.js');
        if (!fs.existsSync(mcpEntry)) {
          warn(`MCP server entry point missing: ${mcpEntry}`);
          verifyFailed = true;
        } else {
          try {
            execSync(`node --check "${mcpEntry}"`, { stdio: 'ignore' });
          } catch {
            warn(`MCP server entry point failed syntax check: ${mcpEntry}`);
            verifyFailed = true;
          }
        }
      }

      const mcpJson = '.mcp.json';
      if (fs.existsSync(mcpJson)) {
        try { JSON.parse(fs.readFileSync(mcpJson, 'utf8')); }
        catch {
          warn(`${mcpJson} is not valid JSON`);
          verifyFailed = true;
        }
      }
    }

    // Verify Codex MCP server
    if (agentChoice.installCodex) {
      const codexMcpTarget = path.join('.codex', 'mcp-server');
      if (fs.existsSync(codexMcpTarget)) {
        const mcpEntry = path.join(codexMcpTarget, 'dist', 'index.js');
        if (!fs.existsSync(mcpEntry)) {
          warn(`Codex MCP server entry point missing: ${mcpEntry}`);
          verifyFailed = true;
        } else {
          try {
            execSync(`node --check "${mcpEntry}"`, { stdio: 'ignore' });
          } catch {
            warn(`Codex MCP server entry point failed syntax check: ${mcpEntry}`);
            verifyFailed = true;
          }
        }
      }
    }

    if (!verifyFailed) info('All components verified');

    console.log('');
    const bar = '========================================';
    console.log(`${COLOR.cyan}${bar}${COLOR.reset}`);
    success('Installation complete!');
    console.log(`${COLOR.cyan}${bar}${COLOR.reset}`);
  } finally {
    rmrf(tmpRoot);
  }
}

if (require.main === module) {
  main().catch((err) => {
    errlog(err.stack || err.message);
    process.exit(1);
  });
}

module.exports = {
  parseAiflareYml,
  buildOtelEnv,
  mergeOtelEnv,
  selectAgents,
  serializeCodexMcpToml,
  installCodexMcpServerToml,
};
