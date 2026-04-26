---
name: context-capture
description: >
  Whether right before or right after a git commit, you MUST invoke this skill if there is even a 1% chance it is related to a commit.
  This skill captures work context (intent, alternatives considered, key diff summary) to the AIFlare server.
  Activate for any situation related to git commit, committing, context bridge, capture, work history, or timeline.
  This must run automatically whenever a commit occurs, even if the user does not explicitly request it.
  This skill must also be invoked when a subagent performs a git commit.
  Skipping this skill is absolutely not permitted. Do not omit it for any reason.
---

# Context Capture

## This skill is not optional — if there is a commit, you MUST run it

Invoke this skill before or immediately after executing a git commit.
If there is even a 1% chance a situation is related to a commit, invoke it.
Skipping this skill is not permitted.

### If you have these thoughts, stop immediately and run this skill

| Thought | Correct Action |
|---------|----------------|
| "The commit message is enough" | **Capture now.** Commit messages only record "what." The "why" can only be preserved by capturing now. |
| "The next task is urgent" | **Capture first.** It takes 30 seconds. Lost context cannot be recovered. |
| "I can do it later" | **Now is the only moment.** Conversation context only exists right now. |
| "I don't remember if I ran the capture script" | **Run it now.** Duplicate captures are harmless, but missed captures are permanent loss. |
| "This is a trivial commit with nothing to capture" | **Capture anyway.** Even trivial changes may need context later. |
| "The subagent probably already handled it" | **Verify.** Do not assume without confirmation. |

Capture is a mandatory final step of the commit workflow. Even if it fails, do not interrupt the current work.

## Why this capture matters

Commit messages only record "what changed." But what you really need 6 months later when revisiting the code is
"why it was built this way" — what alternatives were considered, why this approach was chosen, and what risks were accepted.
All of this information is in your conversation context right now. Right after a commit is the only moment this information can be recorded.

## Choosing the execution path

This skill has two execution paths:

| Situation | Execution Method |
|-----------|-----------------|
| **Committing directly in the main session** | Follow the "Procedure" section below |
| **Subagent committed** | Follow the "Subagent Commit Handling" section |

## Procedure

### 1. Check configuration file

Read `aiflare.yml` in the project root using the Read tool.

Extract the `api_key` and `endpoint` values from the file. If the file does not exist or values are missing:

> "AIFlare configuration file (aiflare.yml) is missing or api_key/endpoint is not set. Skipping capture."

Output this message and **abort the capture**. Continue with the current work.

### 2. Extract commit hash and changed files

```bash
git rev-parse HEAD
git log -1 --format=%s HEAD
git diff --name-only HEAD~1 HEAD
```

Use the results of these three commands for the `commitHash`, `title`, and `changedFiles` fields respectively.

### 3. Generate summary data

Review the conversation context of this work session and generate the fields below.

**IMPORTANT — Language rule**: All text fields (intent, alternatives, diffSummary) MUST be written in the same language as the project's recent git commit messages. Check `git log --oneline -3` to determine the language. For example, if commit messages are in Korean, write all fields in Korean. If in English, write in English. This skill document is written in English for accessibility, but the captured content must match the project's language.

#### General writing principles

Apply to all text fields (intent, alternatives, diffSummary):

- **Use Markdown**: Structure with line breaks (`\n`), bullets (`- `), and bold (`**...**`).
- **One paragraph = one topic**: Do not cram multiple ideas into a single sentence. Use line breaks when the topic changes.
- **Write for the future reader**: Ask yourself, "Can a developer seeing this code for the first time in 6 months understand this?"
- **Use specific nouns**: Instead of "performance improvement," write "Removed N+1 query, reducing list query response time from 200ms to 50ms."

---

#### Auto-extracted fields

These fields use command output as-is.

**title** (required): Use the result of `git log -1 --format=%s HEAD` as-is.

**commitHash** (required): The `git rev-parse HEAD` value extracted in step 2.

**agentType** (required): Select the value matching your agent type.
- Claude Code → `CLAUDE_CODE`
- Gemini CLI → `GEMINI_CLI`
- Codex → `CODEX`
- Other → `OTHER`

**changedFiles** (required): List of files changed in this commit. Use the result of `git diff --name-only HEAD~1 HEAD`.
- Example: `["src/main/kotlin/PaymentService.kt", "src/test/kotlin/PaymentServiceTest.kt"]`

**tag** (required): A tag representing the nature of this work. Choose one of the following.
- `REFACTORING`: Code structure improvement (no behavior change)
- `FEATURE`: New feature addition
- `BUGFIX`: Bug fix
- `TEST`: Test addition/modification
- `DOCS`: Documentation creation/modification

---

#### intent (required)

The reason and background for this work. Write in a **Problem → Solution → Effect** 3-part structure, separating each part with `\n\n`.

**Structure template:**

```
**Problem**: The issue with existing behavior or the background requiring change (1-2 sentences)

**Solution**: The approach taken in this change (1-2 sentences)

**Effect**: What changes as a result — performance, stability, usability, etc. (1 sentence)
```

**Good example:**

```
**Problem**: Payment retries used Fixed Retry (3-second intervals),
causing simultaneous retries to pile up during server overload, worsening outages.
This pattern occurred 3 times in March alone.

**Solution**: Applied Exponential Backoff + Jitter to distribute
retry requests across the time axis.
Max retry attempts: 5, initial interval: 1s, max interval: 32s.

**Effect**: Ensures server recovery time + prevents simultaneous retry storms.
The previous outage pattern is not expected to recur.
```

**Bad example:**

```
The existing Fixed Retry approach caused simultaneous retries to pile up during server overload, worsening outages. Applied Exponential Backoff + Jitter to distribute retry requests and secure server recovery time.
```

(No line breaks, no Problem/Solution/Effect separation, no specific numbers)

**Checklist:**
- Is the issue with existing behavior explicitly stated?
- Is the approach taken in this change specifically described?
- Is the effect/expected outcome included?
- Are Problem/Solution/Effect separated by line breaks?

---

#### alternatives (optional)

Alternatives that were considered but not chosen. Separate each alternative with a bold title + bullets for approach/rejection reason.

**Structure template:**

```
**Alternative 1 — [Name]**
- Approach: [What was considered]
- Rejected because: [Why it was not chosen]

**Alternative 2 — [Name]**
- Approach: [What was considered]
- Rejected because: [Why it was not chosen]
```

**An empty string ("no alternatives") is only permitted when:**
- The requirements are clear enough that there is practically only one implementation approach (e.g., typo fix, config value change)
- No alternatives were discussed during the conversation, and no reasonable alternatives come to mind

Before writing, review the conversation context and verify whether any approaches were discussed.

**Good example:**

```
**Alternative 1 — Increase Fixed Retry interval (3s→10s)**
- Approach: Keep existing logic but increase interval to reduce load
- Rejected because: Simultaneous requests could still pile up depending on traffic patterns.
  Only a temporary mitigation, not a fundamental solution.

**Alternative 2 — Introduce Circuit Breaker pattern**
- Approach: Block requests entirely when failure rate exceeds threshold
- Rejected because: Excessive complexity for the current service scale.
  Backoff alone was deemed sufficiently effective.
```

**Bad example:**

```
There were other approaches but this one was the best.
```

(No alternative names, no rejection reasons, no structure)

**Checklist:**
- Have you reviewed all approaches discussed during the conversation?
- Does each alternative have a name?
- Are rejection reasons specific? (Not just "too complex" — give concrete reasons)
- Are alternatives separated by line breaks?

---

#### diffSummary (optional)

Summarize key changes as per-file bullets.

**Structure template:**

```
- **filename**: Summary of changes
- **filename**: Summary of changes
```

**Include**: Business logic changes, schema/entity changes, API changes, config changes, dependency changes

**Exclude**: Import cleanup, formatting, auto-generated files, simple test assert additions without logic changes

**Good example:**

```
- **PaymentRetryService.kt**: Replaced retry logic from FixedDelay to ExponentialBackoff.
  maxAttempts=5, initialInterval=1000ms, multiplier=2.0, maxInterval=32000ms.
- **application.yml**: Added 3 retry-related settings
  (maxAttempts, initialInterval, multiplier)
- **PaymentRetryServiceTest.kt**: Added 3 backoff behavior verification tests
  (normal retry, max interval reached, jitter range verification)
```

**Bad example:**

```
PaymentRetryService.kt: Changed retry logic. application.yml: Added settings. PaymentRetryServiceTest.kt: Added tests.
```

(No line breaks, no specifics, impossible to tell what changed and how)

**Checklist:**
- Are key logic changes separated by file?
- Is "what changed and how" specifically described for each file?
- Are non-essential changes like import cleanup and formatting excluded?

### 4. Run capture script

Pass the data generated in step 3 as arguments to the capture script.
The script handles config file reading, JSON generation, API calls, and result processing.

> `continuation` 필드는 capture.js 가 자동으로 세팅한다. 직전에 `AskUserQuestion` tool 이 실행되었다면 `.context-capture/.pending-question-{SESSION_ID}` 플래그 파일이 존재하고, capture.js 가 이를 감지해 `continuation: true` 를 전송한다. 사용자나 에이전트가 직접 넘길 필요는 없다.

Run the capture script (Node.js, cross-platform — requires Node 18+):

```bash
node .claude/skills/context-capture/scripts/capture.js \
  --title "title here" \
  --intent "intent here" \
  --commit-hash "commitHash here" \
  --agent-type "CLAUDE_CODE" \
  --changed-files "file1.kt,file2.kt" \
  --tag "tag here (REFACTORING|FEATURE|BUGFIX|TEST|DOCS)" \
  --alternatives "alternatives here" \
  --diff-summary "diffSummary here"
```

If capture fails, never interrupt the current workflow. Only output a warning and continue with the original work.

## Subagent Commit Handling

Subagents (agents created via the Agent tool) do not have access to the Skill tool.
Therefore, when a subagent performs a git commit, include capture script execution instructions in the prompt.

When delegating work to a subagent, append the following instructions at the end of the prompt (cross-platform; the subagent's shell needs to support `$(...)` command substitution — Claude Code's default bash shell handles this on all OSes):

```
After completing git commit, you MUST run the following script:

node .claude/skills/context-capture/scripts/capture.js \
  --title "Work title (under 50 characters)" \
  --intent "Why this work was done (2-5 sentences)" \
  --commit-hash "$(git rev-parse HEAD)" \
  --agent-type "CLAUDE_CODE" \
  --changed-files "$(git diff --name-only HEAD~1 HEAD | paste -sd',' -)" \
  --tag "One of REFACTORING|FEATURE|BUGFIX|TEST|DOCS" \
  --alternatives "Alternatives considered (empty string if none)" \
  --diff-summary "Summary of key changes"

Continue working even if the script fails.
```

The subagent knows its own work context best, making this the most accurate method.

If capture instructions were not included in the prompt, the controller should follow the "Procedure" section above to capture directly after the subagent completes.
If the subagent result does not include a commit hash, verify with `git log --oneline -1`.

## API Reference

See `references/capture-api.md` for the full capture API specification.
