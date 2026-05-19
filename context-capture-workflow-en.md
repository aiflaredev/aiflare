# AIFlare Capture System — How It Works

AIFlare combines two Claude Code mechanisms — **Hooks** and **Skills** — to automatically capture an AI agent's work context.

> **Hook system — external script invocation pattern**
>
> Six command hooks (`SessionStart`, `UserPromptSubmit`, `Stop`, `PostToolUse(Bash, if "Bash(git commit:*)")`, `PostToolUse(AskUserQuestion)`, `SessionEnd`) are registered in `settings.local.json`. Each one delegates to its own Node.js script under `.claude/hooks/{hook}.js`. Shared behavior lives in the `_common.js` module, and `install.js` installs the same `.js` hook set on every OS (macOS / Linux / Windows). The phase-by-phase flow descriptions below describe what happens *inside* those external hook scripts.
>
> `SessionStart` and `SessionEnd` do not make API calls — `SessionStart` only exports `CLAUDE_SESSION_ID` into `$CLAUDE_ENV_FILE`, and `SessionEnd` only cleans up.

---

## Overall Architecture

```
User input
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│  Claude Code Session                                     │
│                                                          │
│  ⓪ SessionStart Hook (on session start / resume)         │
│     → Export CLAUDE_SESSION_ID=<session_id> into         │
│       $CLAUDE_ENV_FILE so every Bash subprocess in this  │
│       session (capture.js included) can deterministically │
│       resolve the current session — required for correct  │
│       routing under parallel Claude Code sessions         │
│                                                          │
│  ① UserPromptSubmit Hook                                 │
│     → Append the user prompt as JSONL to a local file    │
│                                                          │
│  ② Stop Hook (when the AI response completes)            │
│     → Append the AI response (last_assistant_message)    │
│       as JSONL to the same file                          │
│                                                          │
│  ③ PostToolUse Hook (right after AskUserQuestion)        │
│     → Create a .pending-question-{SESSION_ID} flag file  │
│     → Used as the "this commit continues a question"     │
│       signal so the next commit is grouped               │
│       (continuation=true)                                │
│                                                          │
│  ④ PostToolUse Hook (after a git commit completes)       │
│     → PUT /api/v1/work-sessions/prompt (full JSONL)      │
│     → Extract the line-count-based delta → save delta    │
│     → Emit the message that forces the                   │
│       context-capture Skill to fire                      │
│                                                          │
│  ⑤ context-capture Skill runs                            │
│     → capture.js auto-reads the delta file               │
│     → Checks the .pending-question flag and decides      │
│       continuation                                       │
│     → POST /api/v1/captures (capture +                   │
│       conversationSnippet + continuation)                │
│     → Server resolves group_root_id, then stores         │
│       TimelineEntry                                      │
│     → Entry + conversation snippet are stored together   │
│                                                          │
│  ⑥ SessionEnd Hook                                       │
│     → Clean up prompt / offset / delta /                 │
│       pending-question files                             │
│                                                          │
└──────────────────────────────────────────────────────────┘
        │             │              │
        ▼             ▼              ▼
┌─────────────────────────────────────────────┐
│  AIFlare server                             │
│                                             │
│  PUT  /api/v1/work-sessions/prompt (prompt) │
│  POST /api/v1/captures           (capture)  │
│  POST /api/v1/captures/publish   (publish)  │
│  GET  /api/v1/.../conversations  (read)     │
│                                             │
└─────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  At git push time (pre-push hook)                        │
│                                                          │
│  ⑦ .git/hooks/pre-push runs                              │
│     → Collect the list of pushed commit hashes           │
│     → POST /api/v1/captures/publish                      │
│     → Flip LOCAL entries to PUSHED                       │
│     → Failures never block the push itself               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Phase 1: Conversation capture (UserPromptSubmit + Stop Hook)

**Trigger:**
- UserPromptSubmit: fires every time the user submits a prompt to Claude Code
- Stop: fires every time the Claude Code agent finishes a response

**Configuration:** `.claude/settings.local.json` → `hooks.UserPromptSubmit`, `hooks.Stop`

### Flow

```
User submits a prompt
    │
    ▼
UserPromptSubmit Hook runs
    │
    ├─ Extract session_id, prompt from the hook input JSON
    │
    ├─ Create the .context-capture/ directory (mkdir -p)
    │
    └─ Append the user prompt as JSONL to the file
         .context-capture/.claude-prompts-{SESSION_ID}
         {"role":"user","content":"the user's input"}
    │
    ▼
Claude Code agent does the work + finishes the response
    │
    ▼
Stop Hook runs
    │
    ├─ Check stop_hook_active (exit if true to avoid infinite loops)
    │
    ├─ Extract session_id, last_assistant_message from the input JSON
    │
    └─ Append the AI response as JSONL to the same file
         .context-capture/.claude-prompts-{SESSION_ID}
         {"role":"assistant","content":"the full AI response"}
    │
    ▼
  Done (the PostToolUse Hook reads this file later)
```

### JSONL storage format

The prompt file (`.claude-prompts-{SESSION_ID}`) holds the user/AI conversation as alternating JSONL lines:

```jsonl
{"role":"user","content":"Change the config"}
{"role":"assistant","content":"Done. I updated the timeout in config.yml..."}
{"role":"user","content":"Add tests too"}
{"role":"assistant","content":"Added tests in ConfigServiceTest..."}
```

### Core concept: session ID

- `session_id` is the **session identifier Claude Code assigns automatically** (the `.session_id` field in the hook input JSON).
- One session ID maps to one Claude Code session.
- Consecutive prompts in the same session accumulate in the file for that session ID.
- When a new session starts, a new session ID is issued and a new file is naturally created.
- This session ID is wired up to a WorkSession through `claudeSessionId`, which lets the timeline group "one session → many commits."

### Files produced

| File | Purpose |
|------|---------|
| `.context-capture/.claude-prompts-{SESSION_ID}` | Accumulated user+AI conversation as JSONL (one JSON object per line) |

---

## Phase 2: AskUserQuestion detection (PostToolUse Hook, matcher="AskUserQuestion")

**Trigger:** fires immediately after Claude Code runs the `AskUserQuestion` built-in tool.

**Configuration:** `.claude/settings.local.json` → `hooks.PostToolUse` (the second entry, `matcher: "AskUserQuestion"`)

### Purpose

Provides the second signal (`continuation`) needed for timeline-entry grouping.

- In the "agent asks via `AskUserQuestion` → user answers → follow-up commit" scenario, the user's answer ends up in the delta and looks like "a fresh user message."
- These cases must still belong to the **same group**, so right after `AskUserQuestion` the hook drops a flag file marking "this next commit is a continuation of the question."

### Flow

```
Agent finishes calling AskUserQuestion
    │
    ▼
PostToolUse Hook(matcher="AskUserQuestion") runs
    │
    ├─ Extract session_id from the hook input
    ├─ Create the .context-capture/ directory
    └─ touch the empty file .pending-question-{SESSION_ID}
```

On the next commit, `capture.js` reads the flag, converts it to `continuation: true` in the payload, and deletes the file. If the flag file is not present, `continuation` is `false`.

### Files produced

| File | Created at | Removed at | Purpose |
|------|-----------|-----------|---------|
| `.context-capture/.pending-question-{SESSION_ID}` | Right after AskUserQuestion runs | When capture.js runs (or at SessionEnd) | Grouping continuation signal |

---

## Phase 3: Prompt upload + delta capture + Skill enforcement (PostToolUse Hook)

**Trigger:** fires immediately after Claude Code runs a `Bash` command matching the `git commit*` pattern.

**Configuration:** `.claude/settings.local.json` → `hooks.PostToolUse` (the first entry, `matcher: "Bash"` + `if: "Bash(git commit:*)"`)

### Three responsibilities

1. **Send the session conversation**: PUT the accumulated full-conversation JSONL to `PUT /api/v1/work-sessions/prompt`.
2. **Extract the delta**: using a line-count (message-index) file, pull only the new conversation lines since the last capture and save them as a delta file.
3. **Force the Skill to run**: emit a safety-net message that guarantees the context-capture Skill fires.

### Flow

```
Claude Code finishes Bash("git commit ...")
    │
    ▼
PostToolUse Hook runs (matcher: "Bash", if: "Bash(git commit:*)")
    │
    ├─ [0] Defense-in-depth command check (inside the hook script)
    │   Test tool_input.command against
    │   /(?:^|[\s;&|])git\s+commit(?:\s|$|;|&|\|)/
    │   If it doesn't match, exit immediately
    │   (a second safety net behind the matcher filter)
    │
    ├─ Check that aiflare.yml exists
    │
    ├─ [1] Send the full conversation JSONL
    │   Read the entire conversation file
    │   (.claude-prompts-{SESSION_ID}) and PUT it to
    │   /api/v1/work-sessions/prompt (5-second timeout)
    │
    ├─ [2] Extract delta (line-count based)
    │   ├─ Read the offset file (.claude-offset-{SESSION_ID})
    │   │   (missing → start at 0; stores the line count)
    │   ├─ Compare the file's TOTAL_LINES to the offset
    │   │   (measured by counting newline characters —
    │   │    same as bash `wc -l`)
    │   ├─ If TOTAL_LINES > LAST_INDEX:
    │   │   slice the lines after LAST_INDEX into the delta
    │   │   → save to .claude-conversation-delta-{SESSION_ID}
    │   └─ Update the offset file with the current TOTAL_LINES
    │
    └─ [3] Force the Skill to run
       Confirm .claude/skills/context-capture exists
       → emit the hookSpecificOutput message
       → the Claude Code agent invokes the context-capture Skill
```

### Delta extraction example

Suppose the user submits three prompts (with AI responses) during a session and makes two commits:

```
Conversation file (.claude-prompts-{SESSION_ID}):
┌─────────────────────────────────────────────────────────────┐
│ Line 1: {"role":"user","content":"Change the project config"} │
│ Line 2: {"role":"assistant","content":"Done. I updated..."}   │
│ Line 3: {"role":"user","content":"Add tests too"}             │
│ Line 4: {"role":"assistant","content":"Tests added."}         │
│                                                               │
│    ── First commit happens here ──                            │
│                                                               │
│ Line 5: {"role":"user","content":"Add an English translation"}│
│ Line 6: {"role":"assistant","content":"Translation added."}   │
│                                                               │
│    ── Second commit happens here ──                           │
└─────────────────────────────────────────────────────────────┘
```

**At the first commit:**

| Step | Value | Notes |
|------|-------|-------|
| Read offset file | File missing → `LAST_INDEX = 0` | First capture, so no index yet |
| Measure total lines | `TOTAL_LINES = 4` | 4 lines (2 user + 2 assistant) |
| Compare | `4 > 0` → delta exists | |
| Extract delta | `tail -n +1` → all 4 lines | The full user+AI JSONL |
| Save delta | `.claude-conversation-delta-{SESSION_ID}` | The file capture.js will read |
| Update index | Write `4` to the offset file | The starting line for the next capture |

**At the second commit:**

| Step | Value | Notes |
|------|-------|-------|
| Read offset file | `LAST_INDEX = 4` | The value written by the first capture |
| Measure total lines | `TOTAL_LINES = 6` | 2 lines added |
| Compare | `6 > 4` → delta exists | |
| Extract delta | `tail -n +5` → only lines after 4 | Lines 5 and 6 as JSONL |
| Save delta | `.claude-conversation-delta-{SESSION_ID}` | Overwrites the previous delta |
| Update index | Write `6` to the offset file | |

This way, at every commit, **only the new conversation lines (user+AI) since the previous capture** are extracted and stored as that commit's `EntryConversation`.

### Files produced / managed

| File | Purpose |
|------|---------|
| `.context-capture/.claude-offset-{SESSION_ID}` | Line count at the last capture (message index) |
| `.context-capture/.claude-conversation-delta-{SESSION_ID}` | New conversation JSONL since the previous capture (the delta) |

### Edge cases

| Situation | Effect |
|-----------|--------|
| capture.js arguments contain "git commit" (e.g., `--title "git commit fix"`) | The hook's internal regex does not treat tokens inside quotes as a separate command (it only matches when the preceding char is `[\s;&\|]` or the start of the string), so the hook exits immediately — no re-fire |
| First commit (no offset file) | `LAST_INDEX=0`, the entire conversation JSONL is extracted as the delta |
| No prompt file | Both `updateDelta` and `uploadPromptFile` exit silently at their existence checks |
| Missing aiflare.yml or api_key | Conversation upload and delta extraction are both skipped, but the Skill-enforcement step still runs |

---

## Phase 4: Context capture (context-capture Skill)

**Trigger:** activates automatically immediately after the AI agent runs `git commit`.

**Skill location:** `.claude/skills/context-capture/SKILL.md`

**Script:** `.claude/skills/context-capture/scripts/capture.js`

### Execution-path branches

| Situation | Handling |
|-----------|----------|
| The main session committed directly | The agent runs capture.js directly, following the procedure in SKILL.md |
| A subagent committed | Include capture.js execution instructions in the subagent's prompt |

### Main-session capture flow

```
git commit completes
    │
    ▼
context-capture Skill activates
    │
    ├─ 1. Read aiflare.yml
    │      → extract api_key, endpoint
    │      → if missing, skip capture (work continues)
    │
    ├─ 2. Pull commit info
    │      $ git rev-parse HEAD           → commitHash
    │      $ git diff --name-only HEAD~1  → changedFiles
    │
    ├─ 3. Generate summary fields from the conversation
    │      The agent analyzes its own context to produce:
    │      ┌──────────────────────────────────────────┐
    │      │ title:        Work title (≤ 50 chars)    │
    │      │ intent:       Why this change is needed  │
    │      │ alternatives: Considered but not chosen  │
    │      │ diffSummary:  Summary of the key changes │
    │      │ tag:          FEATURE|BUGFIX|REFACTORING │
    │      │               |TEST|DOCS                 │
    │      │ agentType:    CLAUDE_CODE                │
    │      └──────────────────────────────────────────┘
    │
    ▼
    4. Run capture.js
```

### Inside capture.js

```
capture.js runs
    │
    ├─ Parse arguments (--title, --intent, --commit-hash,
    │                   --conversation-snippet, ...)
    │
    ├─ Read api_key, endpoint from aiflare.yml
    │
    ├─ claudeSessionId fallback (resolution order)
    │   1. --claude-session-id argument (preferred — passed
    │      by the skill template using $CLAUDE_SESSION_ID)
    │   2. $CLAUDE_SESSION_ID env var (exported by the
    │      SessionStart hook into $CLAUDE_ENV_FILE; reliable
    │      under parallel sessions because env vars are
    │      bound to the session's process tree)
    │   3. Most recent .claude-prompts-* file by mtime
    │      (legacy heuristic — only correct for single-
    │      session installs; kept for backward compatibility
    │      with installs that pre-date the SessionStart hook)
    │
    ├─ conversationSnippet fallback (auto-read delta file)
    │   When --conversation-snippet is omitted:
    │   if .claude-conversation-delta-{SESSION_ID} exists,
    │   read its content as conversationSnippet,
    │   then delete the file
    │
    ├─ Compute the continuation flag
    │   If .pending-question-{SESSION_ID} exists,
    │   set CONTINUATION=true and delete the file;
    │   otherwise false
    │
    ├─ Validate required fields
    │   (title, intent, commitHash, claudeSessionId,
    │    changedFiles, tag)
    │
    ├─ Build the JSON payload → /tmp/cb-capture-payload-{PID}.json
    │   `continuation` is always included
    │   `conversationSnippet` is included only if present
    │
    ▼
POST {endpoint}/api/v1/captures
    {
      "title": "Fix createdBy issue on signup",
      "intent": "When AuditorAware was anonymousUser...",
      "alternatives": "Considered manually setting SecurityContext...",
      "diffSummary": "Updated JpaAuditingConfig.kt...",
      "commitHash": "ce30efd",
      "agentType": "CLAUDE_CODE",
      "claudeSessionId": "session-abc123",
      "changedFiles": ["JpaAuditingConfig.kt", "OrgService.kt"],
      "tag": "BUGFIX",
      "continuation": false,
      "conversationSnippet": "fix the createdBy bug\nadd tests too"
    }
    Headers:
      Content-Type: application/json
      X-API-Key: {api_key}
    │
    ├─ 201 Created → capture succeeded
    │   → Server resolves group_root_id (see Phase 5)
    │   → TimelineEntry is created (with groupRoot)
    │   → If conversationSnippet is present, EntryConversation
    │     is stored alongside it
    │
    ├─ 400 → invalid request data
    ├─ 401 → API key invalid
    ├─ 404 → no project linked
    ├─ 429 → rate limit exceeded (60 req/min)
    └─ other → server error
    │
    ▼
  Temp files cleaned up; even if capture fails, work continues
```

---

## Phase 5: Server-side group resolution (group_root_id resolver)

**Location:** `CaptureService.resolveGroupRootId(...)` — inside `POST /api/v1/captures` handling.

**Purpose:** group consecutive commits stemming from a single user request so the timeline can express their relationship.

### Data model

The `timeline_entries` table has a nullable self-reference column:

```sql
group_root_id VARCHAR(36) NULL REFERENCES timeline_entries(id)
```

- `group_root_id = NULL`: the entry is the group root, or it stands alone.
- `group_root_id = X`: this entry belongs to the group whose root has id=X.
- Self-references are not used (a root is always represented as NULL).

The response DTO (`TimelineEntryResponse`) exposes this as `groupRootId: String?`. The frontend uses `COALESCE(groupRootId, id)` as the group key.

### Inputs

- `workSessionId`: the WorkSession the current capture belongs to
- `conversationSnippet`: the delta JSONL sent by capture.js
- `continuation`: whether the commit immediately followed `AskUserQuestion`

### Rules

Look up the most recent `TimelineEntry` in the same `workSessionId` ordered by `created_at DESC`:

```
No previous entry → this entry is the root (group_root_id = NULL)

Previous entry exists:
  deltaHasUserMessage == false → same group
                                  (agent committed continuously alone)
  deltaHasUserMessage == true:
    continuation == true  → same group
                            (continuation of an AskUserQuestion)
    continuation == false → new group
                            (the user started a new request)
```

For "same group", `group_root_id = previous.group_root_id ?: previous.id`.

### How `deltaHasUserMessage` is decided

Parse the `conversationSnippet` (JSONL) line by line; if any line has `role == "user"`, return true.

### Scenario examples

**(A) Agent commits multiple times alone**
```
T0 User: "Do A, B, C"
T1 commit A → delta has user → root     (101, root=NULL)
T2 commit B → delta no user  → same     (102, root=101)
T3 commit C → delta no user  → same     (103, root=101)
```

**(B) AskUserQuestion in the middle**
```
T0 User: "Refactor this"
T1 commit part1 → root                   (201, root=NULL)
T2 Agent runs AskUserQuestion → .pending-question is created
T3 User: "Pick option B"
T4 commit part2 → delta has user
                  + continuation=true → same  (202, root=201)
```

**(C) New user request**
```
T0 User: "Do A" → commit                 (301, root=NULL)
T1 User: "Now do B" (plain text) → commit
   delta has user, continuation=false → new root  (302, root=NULL)
```

### Limitations

- **Plain-text questions are not detected**: if the agent asks the user via plain text (not `AskUserQuestion`) and the user replies, there is no `continuation` signal, so the next commit is split into a new group.
- **Other agents**: Gemini CLI, Codex, etc. don't have `AskUserQuestion`, so `continuation` is always false. Only the default rule "user input = new group" applies.
- **Captures without a WorkSession**: if `workSessionId` is NULL, grouping is skipped and the entry is treated as a root.

---

## End-to-end timeline example

The user asks: "Build a Getting Started guide page."

```
Time →

[1] UserPromptSubmit Hook
    → creates .context-capture/.claude-prompts-sess-abc
    → {"role":"user","content":"Build a Getting Started guide page"}

[1.5] Stop Hook (AI response complete)
    → {"role":"assistant","content":"I'll build the Getting Started page..."}

[2] git commit completes → PostToolUse Hook
    → PUT /work-sessions/prompt (full conversation JSONL)
    → Delta extracted (line-count based): conversation since the previous capture
    → saved as .claude-conversation-delta-sess-abc

[3] context-capture Skill (commit: e395786)
    → capture.js auto-reads the delta file
    → POST /captures {
         title: "Add Korean translation keys for the Getting Started guide",
         claudeSessionId: "sess-abc",
         commitHash: "e395786", tag: "FEATURE",
         conversationSnippet: "{\"role\":\"user\",...}\n{\"role\":\"assistant\",...}"
       }
    → 201 Created (TimelineEntry + EntryConversation stored)

[4] User submits another prompt: "Add English and Chinese too"
    → UserPromptSubmit Hook → {"role":"user","content":"Add English and Chinese too"}

[4.5] Stop Hook (AI response complete)
    → {"role":"assistant","content":"Added English and Chinese translations."}

[5] git commit completes → PostToolUse Hook
    → Delta extracted (line-count based): only the conversation since the last index

[6] context-capture Skill (commit: 782facb)
    → POST /captures {
         conversationSnippet: "{\"role\":\"user\",...}\n{\"role\":\"assistant\",...}", ...
       }

[7] Session ends → SessionEnd Hook
    → cleans up .context-capture/{prompts, offset, delta, pending-question}-sess-abc
```

### How it shows up in the AIFlare dashboard

```
┌─ Session: sess-abc ───────────────────────────────────────┐
│                                                            │
│  📝 e395786 - Add Korean translation keys for Getting...   │
│     Intent: Added docs.gettingStarted keys to ko.json...   │
│     💬 User: "Build a Getting Started guide page"          │
│     💬 AI: "I'll build the Getting Started page..."        │
│                                                            │
│  📝 782facb - Add English/Chinese translations for Getting │
│     Intent: Mirrored translation keys in en.json, zh.json  │
│     💬 User: "Add English and Chinese too"                 │
│     💬 AI: "Added English and Chinese translations."       │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Configuration files at a glance

### aiflare.yml (project root, gitignored)

```yaml
api_key: "cb_live_a7f2k9x3mP8qR1vN5tY0wB4j"
endpoint: "localhost:8080"
```

### .claude/settings.local.json (Hook configuration)

Each command hook's `command` field is a single-line invocation of the corresponding Node.js script under `.claude/hooks/{name}.js`. All behavior lives in those external scripts.

`install.js` merges in these six hooks:

| Hook | Event | External script | Role |
|------|-------|-----------------|------|
| `SessionStart` | When a session starts or resumes | `session-start.js` | Export `CLAUDE_SESSION_ID=<session_id>` into `$CLAUDE_ENV_FILE` so subsequent Bash subprocesses (notably `capture.js`) can resolve the current session deterministically — required for correct routing under parallel Claude Code sessions |
| `UserPromptSubmit` | When a prompt is submitted | `user-prompt-submit.js` | Append the user input as JSONL to a local file |
| `Stop` | When the AI response finishes | `stop.js` | Append the AI response (`last_assistant_message`) as JSONL to the same file |
| `PostToolUse` | `Bash` matcher + `if: "Bash(git commit:*)"` | `post-tool-use-bash-git-commit.js` | Send conversation JSONL + extract line-count delta + force Skill invocation (with the hook's internal regex double-check) |
| `PostToolUse` | Right after `AskUserQuestion` | `post-tool-use-ask-user-question.js` | Create the `.pending-question-{SESSION_ID}` flag file (the `continuation` grouping signal) |
| `SessionEnd` | When the session ends | `session-end.js` | Clean up conversation/offset/delta/pending-question files (no API call) |

### .claude/hooks/ (external hook scripts)

A single Node.js implementation. On install they are copied into `.claude/hooks/`. `_common.js` is require-only, so it does not need a separate executable bit, and the same single set is installed regardless of OS (macOS / Linux / Windows).

| File | Role |
|------|------|
| `_common.js` | Shared library (camelCase). `readInput`, `getGitRoot`, `ensureContextDir`, `promptFilePath`, `offsetFilePath`, `deltaFilePath`, `pendingQuestionPath`, `hasAiflareConfig`, `readAiflareConfig`, `hasContextCaptureSkill`, `makeLogger` (info/warn/error emit factory) — 11 in total |
| `session-start.js` | On session start/resume, append `export CLAUDE_SESSION_ID='<session_id>'` to `$CLAUDE_ENV_FILE` so all Bash subprocesses in this session inherit the correct session id (the capture.js routing depends on this) |
| `user-prompt-submit.js` | User prompt → append one JSONL line |
| `stop.js` | `last_assistant_message` → append one JSONL line (skip if `stop_hook_active=true`) |
| `post-tool-use-bash-git-commit.js` | Right after a git commit. Defense-in-depth regex check → `uploadPromptFile` → `updateDelta` → emit the Skill-enforcement message |
| `post-tool-use-ask-user-question.js` | Right after AskUserQuestion, touch the `.pending-question` marker |
| `session-end.js` | At session end, clean up the four files in `.context-capture/` |

`install.js` builds the `settings.local.json` hook entries directly in code and merges them with the user's existing settings. There are no OS-specific template files.

### .claude/skills/context-capture/ (Skill directory)

| File | Role |
|------|------|
| `SKILL.md` | Skill definition, execution procedure, subagent handling guide |
| `scripts/capture.js` | Standalone API-call script (auto-reads the delta file) |
| `scripts/pre-push` | The pre-push hook script (install.js copies it to `.git/hooks/pre-push`) |
| `references/capture-api.md` | Capture API reference document |

### .context-capture/ directory (runtime files, gitignored)

| File pattern | Created at | Removed at | Purpose |
|--------------|-----------|-----------|---------|
| `.claude-prompts-{SESSION_ID}` | UserPromptSubmit + Stop | SessionEnd | Accumulated user+AI conversation JSONL |
| `.claude-offset-{SESSION_ID}` | PostToolUse (first commit) | SessionEnd | Line count at the last capture (message index) |
| `.claude-conversation-delta-{SESSION_ID}` | PostToolUse (at commit time) | capture.js (after reading) | New conversation JSONL since the previous capture |
| `.pending-question-{SESSION_ID}` | PostToolUse (right after AskUserQuestion) | capture.js (after reading) or SessionEnd | Grouping continuation signal |

### .githooks/ (Git hook directory)

| File | Role |
|------|------|
| `pre-push` | The hook that flips LOCAL entries to PUSHED on `git push` |

---

## Phase 6: Push-state transition (pre-push hook)

**Trigger:** when `git push` runs, Git automatically executes `.git/hooks/pre-push`.

**Installation:** `install.js` copies the bundled `scripts/githooks/pre-push` to `.git/hooks/pre-push` and sets the executable bit. If a hook already exists, it does not overwrite it; instead it prints manual-merge instructions.

### Flow

```
git push runs
    │
    ▼
pre-push hook fires
    │
    ├─ Confirm aiflare.yml exists
    │   (if missing, exit silently; the push proceeds normally)
    │
    ├─ Extract API Key, Endpoint
    │
    ├─ Parse push info from stdin
    │   (local_ref, local_sha, remote_ref, remote_sha)
    │
    ├─ Collect the list of pushed commit hashes
    │   $ git log remote_sha..local_sha --format="%H"
    │
    ├─ Extract the branch name
    │   refs/heads/feature/auth → feature/auth
    │
    ▼
POST {endpoint}/api/v1/captures/publish
    {
      "commitHashes": ["abc123", "def456", "ghi789"],
      "branch": "feature/auth"
    }
    Headers:
      Content-Type: application/json
      X-API-Key: {api_key}
    │
    ├─ Server processing:
    │   Pass 1: commitHash match → flip those LOCAL entries to PUSHED
    │   Pass 2: any remaining LOCAL entries on the same
    │           (projectId, branch) → flip to PUSHED in bulk
    │
    └─ Failures don't block: the push proceeds normally (|| true)
```

### Push-state matching strategy

| Match strategy | Description | Target |
|----------------|-------------|--------|
| commitHash match | Entry whose hash exactly matches a pushed hash | Standard commit → push flow |
| Branch-based fallback | Bulk-flip remaining LOCAL entries on the same project/branch | When rebase/amend changed the hashes |
| Manual change | Author flips to PUSHED in the dashboard | Environments without the hook installed |

### Installed files

| File | Role |
|------|------|
| `.git/hooks/pre-push` | Where install.js installs the hook on each machine (untracked, must be installed per machine) |
| `scripts/githooks/pre-push` | The bundled source (install.js copies from here) |

---

## Phase 7: Conversation snippet retrieval (Entry Conversations API)

**Trigger:** rendering of the "Related conversation" section when the frontend opens an entry's detail view.

**Endpoint:** `GET /api/v1/projects/{projectId}/entries/{entryId}/conversations`

### Data model

```
TimelineEntry (1) ←──── (N) EntryConversation
                              │
                              ├─ id (UUID)
                              ├─ entry_id (FK)
                              ├─ content (TEXT, JSONL format)
                              ├─ created_at
                              └─ ... (BaseEntity fields)
```

The `content` field stores a JSONL string:
```jsonl
{"role":"user","content":"change the config"}
{"role":"assistant","content":"Done. I updated..."}
```

### Flow

```
Frontend opens an entry detail view
    │
    ▼
GET /api/v1/projects/{projectId}/entries/{entryId}/conversations
    │
    ├─ Auth: JWT Bearer token
    ├─ Permission: PROJECT_READ (PROJECT_OWNER, PROJECT_ADMIN, MEMBER)
    │
    ├─ Verify the entry belongs to the given project
    │
    ▼
Response:
    {
      "success": true,
      "response": {
        "conversations": [
          {
            "id": "conv-uuid",
            "content": "change the project config\nadd tests too",
            "createdAt": "2026-04-05T10:00:00Z"
          }
        ]
      }
    }
```

### Storage flow summary

```
UserPromptSubmit → accumulate user input as JSONL
    ↓
Stop → accumulate AI response as JSONL (same file)
    ↓
git commit → PostToolUse Hook
    ↓
Extract delta (line-count based, JSONL after the last index) → save delta file
    ↓
capture.js → auto-reads the delta file
    ↓
POST /captures { conversationSnippet: "delta JSONL" }
    ↓
CaptureService → store TimelineEntry + EntryConversation
    ↓
GET .../conversations → frontend parses JSONL and renders by role
```

---

## Failure safety

Every capture step is designed so that **failures never interrupt the user's current work**:

- `aiflare.yml` missing → silently skip
- API call fails → print a warning and continue
- Hook throws an error → `exit 0` so the Claude Code session is unaffected
- Subagent fails to capture → controller falls back and captures directly
- pre-push hook not installed → entries stay in `LOCAL` state, but can be flipped to `PUSHED` manually
- pre-push hook API call fails → push still succeeds; only the `LOCAL` badge stays
- delta file missing → capture happens without `conversationSnippet` (the entry is still created, just no conversation snippet)
- offset file corrupted/deleted → the next capture extracts the entire conversation as the delta (no data loss)
- `.pending-question` flag missing → captured as `continuation=false`, so a continuation commit after `AskUserQuestion` may end up in a new group (the entry itself is still created)
- Stop hook with `stop_hook_active=true` → exits immediately to prevent infinite loops (expected behavior)
