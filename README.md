# AIFlare

AIFlare hooks into your AI coding workflow to capture the **why** behind every commit. As you and your AI agent work, AIFlare records intent, alternatives considered, and diff summaries — turning your conversations into a searchable timeline you can revisit weeks or months later.

> **Supported agent:** AIFlare currently supports **Claude Code only.** Support for other agents (Gemini CLI, Codex, etc.) is on the roadmap.

With AIFlare, you can:

- **Preserve the why, not just the what** — every commit is paired with intent, rejected alternatives, and a per-file diff summary
- **Generate reports on demand** — daily, weekly, and PM-oriented digests built from your captured sessions
- **Evaluate your prompting** — coach-style feedback on the quality of the prompts you sent during a session
- **Compare sessions side by side** — see how work continued (or pivoted) between sessions
- **Onboard faster** — show new teammates the prompt → discussion → commit pathway

## Why AIFlare

- **Commit messages aren't enough** — the *why* lives in the conversation, not the diff. AIFlare captures it before it's lost.
- **Automatic on commit** — a Claude Code hook fires the capture skill the moment you `git commit`. No manual step required, even when a subagent commits.
- **Slash-command reports** — `/summarize`, `/daily-digest`, `/weekly-digest`, `/pm-digest`, `/prompt-evaluate`, `/session-compare`.
- **MCP-native** — the bundled MCP server exposes session data through Claude Code (and any other MCP-aware client when supported).
- **Two-step setup** — drop in `aiflare.yml` and run a single installer; skills, hooks, and MCP server are wired up for you.

## Table of Contents

- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Skills](#skills)
- [MCP Tools](#mcp-tools)
- [Hooks](#hooks)
- [Configuration](#configuration)
- [Security & Privacy](#security--privacy)
- [Troubleshooting](#troubleshooting)
- [Uninstall](#uninstall)
- [Getting Help](#getting-help)
- [License](#license)

## Requirements

- Git
- Node.js 18+
- macOS, Linux, or Windows
- [Claude Code](https://claude.ai/code) installed and authenticated — **the only supported agent at this time**
- An AIFlare account and `aiflare.yml` (download from [aiflare.dev](https://aiflare.dev))

## Quick Start

```bash
# 1) Sign up at https://aiflare.dev, generate an API key,
#    and place the downloaded aiflare.yml at your project root.

# 2) From the project root, run the installer.

# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/aiflaredev/aiflare/main/install.js -o install.js && node install.js && rm install.js

# Windows (PowerShell, with curl.exe — Windows 10 build 1803+)
curl.exe -fsSL https://raw.githubusercontent.com/aiflaredev/aiflare/main/install.js -o install.js; node install.js; del install.js

# Windows (PowerShell, with Invoke-WebRequest — works on any PowerShell 3.0+)
iwr -useb https://raw.githubusercontent.com/aiflaredev/aiflare/main/install.js -OutFile install.js; node install.js; del install.js
```

The installer will:

- Install Claude Code skills under `.claude/skills/`
- Install hook scripts under `.claude/hooks/` (OS-appropriate variants)
- Install the bundled MCP server under `.claude/mcp-server/` and run `npm install`
- Merge entries into `.claude/settings.local.json` and `.mcp.json` (existing files are backed up before merge)
- Install a Git `pre-push` hook
- Append `aiflare.yml`, `.context-capture/`, and `.claude/settings.local.json` to `.gitignore`
- Add a directive to `CLAUDE.md` instructing the agent to invoke `context-capture` after `git commit`

After installation, just commit normally — capture runs automatically.

## How It Works

```
You + Claude Code                          AIFlare API
       │                                        │
       │  conversation, prompts, decisions      │
       │                                        │
       ▼                                        │
   git commit ─────► PostToolUse hook ─────►    │
       │                fires                   │
       │           context-capture skill        │
       │                                        │
       ▼                                        ▼
  commit recorded                         intent · alternatives ·
                                          diffSummary stored
                                          alongside commit hash
```

When you (or a subagent) run `git commit`, the `PostToolUse` hook matching `Bash(*git commit*)` fires the `context-capture` skill. The skill reads the active conversation, generates the `intent` / `alternatives` / `diffSummary` fields, and POSTs them to the endpoint defined in `aiflare.yml` — keyed by commit hash.

You can later query that data through slash commands or the MCP tools.

## Skills

AIFlare installs a set of Claude Code skills as slash commands. All reports are written in the language of your recent commit messages (English, Korean, etc.) — detected automatically from `git log --oneline -3`.

| Skill              | Slash Command         | Purpose                                                                                              |
| ------------------ | --------------------- | ---------------------------------------------------------------------------------------------------- |
| `context-capture`  | _(automatic)_         | Captures intent, alternatives, and diff summary after each `git commit`. Runs automatically.        |
| `summarize`        | `/summarize`          | Summarizes a session and emits a structured **continuation directive** for the next agent to pick up |
| `daily-digest`     | `/daily-digest`       | Daily report: commits, sessions, tag distribution, hottest files, key decisions                      |
| `weekly-digest`    | `/weekly-digest`      | Weekly report centered on **key decisions** with rejected alternatives                               |
| `pm-digest`        | `/pm-digest`          | Same week as `weekly-digest`, re-narrated in non-technical, business-impact language for PMs         |
| `prompt-evaluate`  | `/prompt-evaluate`    | Coach-style review of the prompts you sent in a session, with paste-ready next-session templates     |
| `session-compare`  | `/session-compare`    | Side-by-side comparison of two sessions (overlapping files, direction change, tag shift)             |

### Slash Command Reference

#### `/summarize [session-id]`

| Parameter    | Required | Description                                                                                  |
| ------------ | -------- | -------------------------------------------------------------------------------------------- |
| `session-id` | optional | Session to summarize (e.g., `2026-04-26-abc123de-...`). Omit to summarize the current session. |

**Examples:**

```
/summarize
/summarize 2026-04-26-abc123de-f456-7890-abcd-ef1234567890
```

#### `/daily-digest [date]`

| Parameter | Required | Description                                                                |
| --------- | -------- | -------------------------------------------------------------------------- |
| `date`    | optional | Date in `YYYY-MM-DD` format. Omit to use today's date.                     |

**Examples:**

```
/daily-digest
/daily-digest 2026-04-25
```

#### `/weekly-digest [week]`

| Parameter | Required | Description                                                                  |
| --------- | -------- | ---------------------------------------------------------------------------- |
| `week`    | optional | ISO 8601 week (e.g., `2026-W17`). Omit to use the current week.              |

**Examples:**

```
/weekly-digest
/weekly-digest 2026-W17
```

#### `/pm-digest [week]`

| Parameter | Required | Description                                                                  |
| --------- | -------- | ---------------------------------------------------------------------------- |
| `week`    | optional | ISO 8601 week (e.g., `2026-W17`). Omit to use the current week.              |

Uses the same data as `/weekly-digest` but re-narrates it in business-impact language. The week argument has identical semantics.

#### `/prompt-evaluate [session-id]`

| Parameter    | Required | Description                                                                                                           |
| ------------ | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `session-id` | optional | Session whose prompts will be evaluated. Omit to use the current session.                                             |

If the resolved session has no captured prompts (e.g., no commit has occurred yet), the skill exits with a message and saves nothing.

**Examples:**

```
/prompt-evaluate
/prompt-evaluate 2026-04-26-abc123de-f456-7890-abcd-ef1234567890
```

#### `/session-compare [session-id-1] [session-id-2]`

Two **optional** positional arguments separated by a space. Behavior depends on how many you supply:

| Arguments         | Comparison                                                  |
| ----------------- | ----------------------------------------------------------- |
| _(none)_          | Current session ↔ previous session (auto-resolved)         |
| `<id>`            | Current session ↔ `<id>`                                    |
| `<id-1> <id-2>`   | `<id-1>` ↔ `<id-2>` (current session is not involved)       |

**Examples:**

```
/session-compare
/session-compare 2026-04-25-abc123de-...
/session-compare 2026-04-25-abc123de-... 2026-04-26-def456gh-...
```

#### `context-capture` _(automatic)_

This skill is invoked automatically by the `PostToolUse` Bash hook on `git commit` — you do not call it as a slash command. The skill reads the conversation, builds the capture payload, and invokes the underlying script:

```bash
node .claude/skills/context-capture/scripts/capture.js \
  --title <commit-subject> \
  --intent <why-text> \
  --commit-hash <hash> \
  --agent-type CLAUDE_CODE \
  --changed-files <comma-separated-paths> \
  --tag <FEATURE|BUGFIX|REFACTORING|TEST|DOCS> \
  [--alternatives <text>] \
  [--diff-summary <text>]
```

For subagent commits the same script is appended to the subagent prompt so the subagent can run it after committing. See [Capture Fields](#capture-fields) for the meaning of each flag.

### Capture Fields

Each capture stores the following structured fields, built from the active conversation:

| Field           | Required | Description                                                                                  |
| --------------- | -------- | -------------------------------------------------------------------------------------------- |
| `title`         | yes      | Commit subject (`git log -1 --format=%s HEAD`)                                               |
| `commitHash`    | yes      | Commit hash (`git rev-parse HEAD`)                                                           |
| `agentType`     | yes      | Currently always `CLAUDE_CODE`. The schema also accepts `GEMINI_CLI`, `CODEX`, and `OTHER`, reserved for future agent support. |
| `changedFiles`  | yes      | Files in the commit (`git diff --name-only HEAD~1 HEAD`)                                     |
| `tag`           | yes      | One of `FEATURE`, `BUGFIX`, `REFACTORING`, `TEST`, `DOCS`                                    |
| `intent`        | yes      | Why this work was done — written in **Problem → Solution → Effect** structure                |
| `alternatives`  | optional | Alternatives considered, each with approach + rejection reason                               |
| `diffSummary`   | optional | Per-file bullets of meaningful changes (excludes formatting / import cleanup)                |

## MCP Tools

The bundled `@aiflare/mcp-server` exposes the following tools. AIFlare currently wires this server up for **Claude Code only** — other MCP-aware clients are not yet officially supported.

| Tool                              | Description                                               |
| --------------------------------- | --------------------------------------------------------- |
| `get_session_summary`             | Fetch raw data for a session                              |
| `get_session_prompts`             | Fetch JSONL of user/assistant turns for prompt evaluation |
| `get_daily_digest`                | Fetch raw data for a day's commits and sessions           |
| `get_weekly_digest`               | Fetch raw data for a week                                 |
| `get_pm_digest`                   | Fetch the week's data filtered for PM-oriented framing    |
| `get_session_compare`             | Fetch comparison data for two sessions                    |
| `get_recent_captures`             | Fetch recent captures across the project                  |
| `get_file_history`                | Fetch the capture history for a single file               |
| `save_session_report`             | Save a session summary report                             |
| `save_daily_digest_report`        | Save a daily digest report                                |
| `save_weekly_digest_report`       | Save a weekly digest report                               |
| `save_pm_digest_report`           | Save a PM digest report                                   |
| `save_prompt_evaluation_report`   | Save a prompt evaluation report                           |
| `save_session_compare_report`     | Save a session comparison report                          |

The installer registers the server in your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "aiflare": {
      "command": "node",
      "args": [".claude/mcp-server/dist/index.js"]
    }
  }
}
```

## Hooks

The installer registers five Claude Code hooks via `.claude/settings.local.json`:

| Hook                                              | Trigger                                       | What it does                                                            |
| ------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| `PostToolUse` ⟶ `Bash` (matches `*git commit*`)   | After a Bash tool call running `git commit`   | Fires the context-capture flow                                          |
| `PostToolUse` ⟶ `AskUserQuestion`                 | After every `AskUserQuestion`                 | Marks the next capture as a continuation of an interrupted flow         |
| `UserPromptSubmit`                                | Every user prompt                             | Persists the prompt for `/prompt-evaluate`                              |
| `Stop`                                            | Agent finishes a turn                         | Records turn boundaries (10s timeout)                                   |
| `SessionEnd`                                      | Claude Code session ends                      | Flushes any pending capture state                                       |

Cross-platform variants (`.sh`, `.ps1`, `.js`) are installed under `.claude/hooks/` — the installer picks the right family for your OS.

A Git `pre-push` hook is also installed at `.git/hooks/pre-push`. If a hook is already present, AIFlare skips overwriting and prints the manual-merge command.

## Configuration

### `aiflare.yml`

Sits at the project root and is **never** committed (the installer adds it to `.gitignore`).

```yaml
api_key: <your-api-key>
endpoint: https://api.aiflare.dev
```

If the file is missing or either field is empty, the capture script logs a warning and exits cleanly without blocking your commit.

### `.claude/settings.local.json`

The installer merges its hook entries into your existing `settings.local.json`. A backup is written to `settings.local.json.bak` before merging. If the merge fails, the original is restored and a reference copy is saved to `.claude/aiflare_settings.reference.json` for manual merging.

### `.mcp.json`

Same merge-with-backup strategy as above. If you already have an MCP config, only the `aiflare` entry is added.

### `CLAUDE.md`

The installer appends:

```
After git commit, you must always run the context-capture skill.
```

This directive ensures the skill runs even on commits performed inside subagents (subagents do not have access to the Skill tool, so the directive is what enforces capture in those cases).

## Security & Privacy

- **`aiflare.yml` holds your API key** — never commit it. The installer adds it to `.gitignore` automatically.
- **Captured data leaves your machine** — `intent`, `alternatives`, `diffSummary`, commit hash, and changed file paths are POSTed to the endpoint configured in `aiflare.yml`.
- **No raw source is transmitted** — only the per-file change summary the agent generates. Repository contents stay local.
- **Failure is non-blocking** — if capture fails (network, auth, etc.) the script logs the error and lets your commit complete normally.

## Troubleshooting

| Issue                                             | Solution                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `aiflare.yml not found in project root`           | Sign up at [aiflare.dev](https://aiflare.dev), download `aiflare.yml`, place it at the repo root, re-run the installer    |
| `Not a git repository`                            | Run the installer from inside a Git repo                                                                                  |
| Capture skill not firing on commit                | Confirm `.claude/settings.local.json` contains the `PostToolUse` Bash entry; re-run the installer to refresh hooks         |
| `Cannot find module '@modelcontextprotocol/sdk'`  | Run `npm install` inside `.claude/mcp-server`                                                                             |
| Slash commands not visible                        | Restart Claude Code so it re-scans `.claude/skills/`                                                                      |
| Existing `pre-push` hook                          | The installer does **not** overwrite — manually merge `scripts/githooks/pre-push` into your existing hook                  |

## Uninstall

To completely remove AIFlare from your project, follow the steps below. None of these are destructive to your code or git history — they only undo what the installer added.

### 1. Remove AIFlare files

```bash
# AIFlare skills (only the ones AIFlare installs — keep any unrelated skills you have)
rm -rf .claude/skills/context-capture
rm -rf .claude/skills/summarize
rm -rf .claude/skills/daily-digest
rm -rf .claude/skills/weekly-digest
rm -rf .claude/skills/pm-digest
rm -rf .claude/skills/prompt-evaluate
rm -rf .claude/skills/session-compare

# Hook scripts and MCP server
rm -rf .claude/hooks
rm -rf .claude/mcp-server

# API key (optional — keep this file if you plan to reinstall later)
rm aiflare.yml
```

### 2. Remove the `aiflare` entry from `.mcp.json`

Open `.mcp.json` and delete the `aiflare` block under `mcpServers`. If `aiflare` was the only server, the file can be removed entirely:

```bash
rm .mcp.json   # only if you have no other MCP servers
```

### 3. Remove AIFlare hooks from `.claude/settings.local.json`

Open `.claude/settings.local.json` and remove every `hooks` entry whose `command` references `.claude/hooks/...` (the AIFlare hook scripts). The relevant entries are:

- `PostToolUse` ⟶ `Bash` (matches `*git commit*`)
- `PostToolUse` ⟶ `AskUserQuestion`
- `UserPromptSubmit`
- `Stop`
- `SessionEnd`

If those were the only hooks, you can simply delete the entire file:

```bash
rm .claude/settings.local.json
```

### 4. Remove the `pre-push` Git hook

Only delete this if it was installed by AIFlare (i.e., you did not have a custom hook before installing):

```bash
rm .git/hooks/pre-push
```

### 5. Remove the `CLAUDE.md` directive

Open `CLAUDE.md` and delete the line:

```
After git commit, you must always run the context-capture skill.
```

If `CLAUDE.md` only contained that line, the file can be deleted.

### 6. Clean up `.gitignore` (optional)

The installer added these entries:

```
aiflare.yml
.context-capture/
.claude/settings.local.json
```

Remove any you no longer need. Most users will want to keep `.claude/settings.local.json` ignored regardless of AIFlare.

### 7. Verify

```bash
# Confirm no AIFlare paths remain
ls .claude/hooks 2>/dev/null
ls .claude/mcp-server 2>/dev/null
grep -l 'aiflare' .mcp.json .claude/settings.local.json 2>/dev/null
```

Empty output from all three commands confirms a clean uninstall. Your captured data still lives on the AIFlare server — visit [aiflare.dev](https://aiflare.dev) to manage or delete it from there.

## Getting Help

- **GitHub Issues:** Report bugs or request features at <https://github.com/aiflaredev/aiflare/issues>
- **Website:** <https://aiflare.dev>

## License

MIT — see [LICENSE](LICENSE).
