#!/usr/bin/env node
// AIFlare cross-platform installer (Node.js)
// Usage: curl -fsSL https://raw.githubusercontent.com/kwo2002/context-bridge/main/install.js | node

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const isWindows = process.platform === 'win32';
const useColor = process.stdout.isTTY;

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

function hookCommand(scriptName) {
  // Claude Code expands $CLAUDE_PROJECT_DIR itself (platform-agnostic, default bash shell on all OSes).
  // Quoting the variable handles paths with spaces; forward slashes work on Windows too.
  return `node "$CLAUDE_PROJECT_DIR"/.claude/hooks/${scriptName}`;
}

function buildSettingsJson() {
  return {
    hooks: {
      PostToolUse: [
        {
          matcher: 'Bash',
          hooks: [{
            type: 'command',
            command: hookCommand('post-tool-use-bash-git-commit.js'),
            if: 'Bash(*git commit*)',
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

function main() {
  for (const cmd of ['git', 'node']) {
    if (!commandExists(cmd)) {
      errlog(`${cmd} is required but not installed. Please install ${cmd} and try again.`);
      process.exit(1);
    }
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

  console.log('');
  console.log('Starting AIFlare installation...');
  console.log('');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aiflare-'));
  const cloneDir = path.join(tmpRoot, 'repo');

  try {
    try {
      execSync(`git clone --depth 1 https://github.com/kwo2002/context-bridge.git "${cloneDir}"`, { stdio: 'ignore' });
    } catch {
      errlog('Failed to clone Skill repository. Please check your network connection.');
      process.exit(1);
    }
    rmrf(path.join(cloneDir, '.git'));

    // Skills
    const skillsSource = path.join(cloneDir, 'skills');
    const skillsTarget = path.join('.claude', 'skills');
    if (!fs.existsSync(skillsSource)) {
      errlog('skills/ directory not found in cloned repository.');
      process.exit(1);
    }
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
    const mcpSource = path.join(cloneDir, 'mcp-server');
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

    // Hooks (Node.js variant)
    const hooksSource = path.join(cloneDir, 'hooks', 'node');
    const hooksTarget = path.join('.claude', 'hooks');
    if (fs.existsSync(hooksSource)) {
      rmrf(hooksTarget);
      copyTree(hooksSource, hooksTarget);
      info(`Hook scripts installed -> ${hooksTarget}`);
    } else {
      warn(`Hook scripts source not found: ${hooksSource}`);
    }

    // settings.local.json
    const settingsFile = path.join('.claude', 'settings.local.json');
    fs.mkdirSync('.claude', { recursive: true });
    const settingsContent = buildSettingsJson();
    if (!fs.existsSync(settingsFile)) {
      fs.writeFileSync(settingsFile, JSON.stringify(settingsContent, null, 2) + '\n');
      info(`Hooks config created -> ${settingsFile}`);
    } else {
      const backup = `${settingsFile}.bak`;
      fs.copyFileSync(settingsFile, backup);
      try {
        const existing = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        const merged = mergeHooks(existing, settingsContent);
        fs.writeFileSync(settingsFile, JSON.stringify(merged, null, 2) + '\n');
        info(`Hooks merged -> ${settingsFile} (backup: ${backup})`);
      } catch (e) {
        fs.copyFileSync(backup, settingsFile);
        warn(`Hook merge failed: ${e.message}. Original ${settingsFile} restored.`);
        const ref = path.join('.claude', 'aiflare_settings.reference.json');
        fs.writeFileSync(ref, JSON.stringify(settingsContent, null, 2) + '\n');
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

    // .gitignore
    const gitignorePath = '.gitignore';
    if (!fs.existsSync(gitignorePath)) fs.writeFileSync(gitignorePath, '');
    for (const entry of ['aiflare.yml', '.context-capture/', '.claude/settings.local.json']) {
      ensureGitignoreEntry(gitignorePath, entry);
    }

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

    // Verification
    console.log('');
    info('Verifying installation...');
    let verifyFailed = false;

    for (const ent of fs.readdirSync(skillsTarget, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const skillMd = path.join(skillsTarget, ent.name, 'SKILL.md');
      if (!fs.existsSync(skillMd)) {
        warn(`Skill missing SKILL.md: ${ent.name}`);
        verifyFailed = true;
      }
    }

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

    if (fs.existsSync(mcpJson)) {
      try { JSON.parse(fs.readFileSync(mcpJson, 'utf8')); }
      catch {
        warn(`${mcpJson} is not valid JSON`);
        verifyFailed = true;
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

main();
