# Install Command Anatomy

The full command is a three-stage flow — **download → run → cleanup** — chained together with `&&` on a single line.

```
curl -fsSL https://aiflare.dev/install.js -o install.cjs && node install.cjs && rm install.cjs
└─────────── 1 ────────────────────────────────────┘    └──── 2 ────┘   └──── 3 ────┘
```

## Stages

| # | Command | What it does |
| --- | --- | --- |
| 1 | `curl -fsSL https://aiflare.dev/install.js -o install.cjs` | Fetch the body of install.js from the remote and **save it to the current directory as `install.cjs`** |
| 2 | `node install.cjs` | Run the saved file with Node.js → performs the actual installation (creates `.claude/skills/`, `.claude/hooks/`, `.claude/mcp-server/`, etc.) |
| 3 | `rm install.cjs` | Delete the temporary `install.cjs` file (cleanup) |

`&&` means "run the next stage only if the previous one succeeded." If any stage fails, execution stops there and the rest is skipped.

## Why save it as `.cjs`?

The remote URL is named `install.js`, but it's saved locally as `install.cjs`. Here's why:

- If the user's project `package.json` has `"type": "module"`, `.js` files are interpreted as ESM, which breaks the `require()` calls inside the install script.
- The `.cjs` extension **always forces CommonJS** interpretation, so it's safe in any project.

The URL itself could be renamed to `install.cjs`, but the convention is to keep the user-facing message as `install.js` and only swap the extension at download time.

## What's left after it runs

- The `install.cjs` file is gone (removed in stage 3).
- Instead, the following are created/modified in the project:
  - `.claude/skills/` — 7 skill directories
  - `.claude/hooks/` — Node.js hook scripts
  - `.claude/mcp-server/` — MCP server (npm install runs automatically)
  - `.mcp.json` — `aiflare` MCP server entry
  - `.claude/settings.local.json` — Claude Code hook settings
  - `.git/hooks/pre-push` — pre-push hook
  - `CLAUDE.md` — adds a one-line context-capture directive
  - `.gitignore` — adds `aiflare.yml`, `.context-capture/`, `.claude/settings.local.json`

In short, the one-line command **fetches a temporary bootstrapper, runs it, and erases its tracks**.

## Platform variants

### macOS / Linux

```bash
curl -fsSL https://aiflare.dev/install.js -o install.cjs && node install.cjs && rm install.cjs
```

### Windows (PowerShell + curl.exe, Win10 build 1803+)

```powershell
curl.exe -fsSL https://aiflare.dev/install.js -o install.cjs; node install.cjs; del install.cjs
```

### Windows (PowerShell + Invoke-WebRequest, PS 3.0+)

```powershell
iwr -useb https://aiflare.dev/install.js -OutFile install.cjs; node install.cjs; del install.cjs
```

Unlike bash's `&&`, PowerShell's `;` **runs the next stage even if the previous one failed**. For more safety, you can wrap it in try/catch or add `$?` checks.

## Prerequisites

Before running the install command, the user's project root must have:

1. **A git repo** (initialized with `git init`)
2. **`aiflare.yml`** — downloaded after signing up at aiflare.dev, placed at the project root
3. **Node.js 18+**, **git**, and (Mac/Linux only) **unzip**
