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

**The default value is an empty string.** Fill this field only when **both** of the following conditions are met.

1. An **explicit discussion of alternatives** exists in the conversation context
   — not "remarks on a similar topic", but **concrete comparison** statements like "Y instead of X", "X or Y", "I considered X".
2. The rejected alternative and the rejection reason can be **directly extracted from the conversation**
   — not supplemented by model inference.

If either condition is not met, send an empty string.
Writing a "plausibly inferable alternative" is hallucination and is strictly forbidden.
A single hallucinated line destroys the credibility of the entire alternatives field.

---

**Pre-write detection step (mandatory, no bypass)**

Before starting to write, find one or more of the following signals in the conversation context.

| Signal type | Korean example | English example |
|---|---|---|
| Explicit comparison | "A 대신 B", "A냐 B냐" | "instead of A", "A vs B" |
| Explicit review and rejection | "A도 봤는데 X 때문에 안 함" | "considered A but" |
| Decision branching | "옵션 1·2 중 골라야 함" | "option 1 or option 2" |
| User's explicit refusal | "A 말고 B로 해줘" | "not A, use B" |

**If a signal is found**: include a one-line verbatim quote from the conversation segment containing the signal at the top of the alternatives body.
**If no signal is found**: `alternatives = ""` (empty string). Entering the write phase without passing the detection step is forbidden.

⚠️ "Similar conversation topic" ≠ "alternative discussion".
Example: If the user only said "Add a Redis cache", other caches (Caffeine, Memcached, etc.) are not alternatives (not discussed).

---

**Write format**

When a signal is found and you fill the field, place the verbatim quote at the top and the structured alternative block below it.

```
> Conversation quote: "[one-line excerpt]"

**Alternative — [Name]**
- Approach: [what was considered]
- Rejected because: [rejection reason, grounded in the conversation]
```

Repeat the block for each additional alternative.

---

**Example 1 — Empty string (most common case)**

Conversation context: "Add a RememberMe option to the login API" → implementation → tests → commit

Detection result: No alternative signal.

`alternatives = ""`

Explanation: The requirement was clear, the implementation path was singular, and no alternatives were compared in the conversation. An empty string is the correct answer.

---

**Example 2 — Empty string (similar topic but no explicit comparison)**

Conversation context: User says "Let's add a cache, with Redis" → model implements with Redis.

Detection result: No explicit comparison with other caches (Caffeine, Memcached, etc.).
The mere appearance of the topic "cache" is not a detection signal.

`alternatives = ""`

Explanation: Writing "Chose Redis over Caffeine because of the distributed environment" here would be hallucination.
The user never mentioned Caffeine, nor rejected it.

---

**Example 3 — Empty string (the model has alternatives in mind, but none in the conversation)**

Conversation context: "Fix this N+1 query" → model resolves it with fetch join.

Detection result: Other N+1 solutions like EntityGraph and @BatchSize exist in the model's knowledge,
but none of them were compared or discussed in the conversation with the user.

`alternatives = ""`

Explanation: The model may feel an urge to write "There were other methods, but fetch join was chosen."
That would be **inventing a conversation the user never saw.** An empty string is the correct answer.

---

**Example 4 — Filled case (rare, but a clear signal exists)**

Conversation context: User says "Improve the payment retry logic. Torn between Exponential Backoff vs Circuit Breaker."
→ Model compares the two.
→ User says "Let's go with Backoff. Circuit Breaker is overkill for our scale."

Detection result:
- Explicit comparison ✅ ("Backoff vs Circuit Breaker")
- Explicit rejection reason ✅ ("overkill for our scale")
- Quotable ✅

`alternatives`:

```
> Conversation quote: "Circuit Breaker is overkill for our scale"

**Alternative — Circuit Breaker pattern**
- Approach: Block all requests when failure rate exceeds a threshold
- Rejected because: Overkill for the current service scale (user's judgment)
```

---

**Post-write verification (mandatory)**

If you filled alternatives, verify the following before sending.

- [ ] Is each alternative grounded in a **specific utterance** in the conversation? (Not the model's general knowledge.)
- [ ] Is the rejection reason **directly derived from the conversation**? (Not your inference.)
- [ ] Did you include a one-line verbatim quote at the top of the body?

⚠️ (For items that passed the detection step) if your confidence is **below 90%**, delete that alternative.
⚠️ If all alternatives are subject to deletion → send a total empty string.

Principle: A hallucinated line < an empty string. The former is more harmful to credibility.

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

> The `continuation` field is set automatically by capture.js. If the `AskUserQuestion` tool was executed immediately before, a flag file `.context-capture/.pending-question-{SESSION_ID}` exists, and capture.js detects it and sends `continuation: true`. The user or agent does not need to pass it manually.

Run the capture script (Node.js, cross-platform — requires Node 18+):

```bash
node .claude/skills/context-capture/scripts/capture.js \
  --title "title here" \
  --intent "intent here" \
  --commit-hash "commitHash here" \
  --claude-session-id "$CLAUDE_SESSION_ID" \
  --agent-type "CLAUDE_CODE" \
  --changed-files "file1.kt,file2.kt" \
  --tag "tag here (REFACTORING|FEATURE|BUGFIX|TEST|DOCS)" \
  --alternatives "alternatives here" \
  --diff-summary "diffSummary here"
```

> `$CLAUDE_SESSION_ID` is exported by the SessionStart hook into the session's environment file. Passing it explicitly is required so that captures are routed to the correct WorkSession even when multiple Claude Code sessions run in parallel against the same project. If the environment variable is empty (e.g., legacy install without the SessionStart hook), capture.js falls back to detecting the session from `.context-capture/.claude-prompts-*` by mtime — which is unreliable under parallel sessions.

If capture fails, never interrupt the current workflow. Only output a warning and continue with the original work.

## Subagent Commit Handling

Subagents (agents created via the Agent tool) do not have access to the Skill tool.
Therefore, when a subagent performs a git commit, include capture script execution instructions in the prompt.

When delegating work to a subagent, append the following instructions at the end of the prompt (cross-platform; the subagent's shell needs to support `$(...)` command substitution — Claude Code's default bash shell handles this on all OSes):

```
After completing git commit, you MUST run the following script.

⚠️ alternatives field writing rule: the default is an empty string ("").
Fill it only when one or more of the following signals are explicitly present in your work conversation:
- Explicit alternative comparison such as "Y instead of X", "X or Y", "I considered X"
- Explicit review and rejection such as "Considered A but didn't because of X"
- User's explicit refusal ("not A, use B")
- Decision-branching discussion ("must choose between option 1 and option 2")

If no signal exists, send an empty string (""). Filling alternatives by "plausibly imagining" them
is hallucination and is strictly forbidden. A hallucinated line is more harmful than an empty string.

Only when a signal exists, replace the `--alternatives ""` position in the script below with the
actual alternatives content (one-line verbatim quote + Alternative block).

node .claude/skills/context-capture/scripts/capture.js \
  --title "Work title (under 50 characters)" \
  --intent "Why this work was done (2-5 sentences)" \
  --commit-hash "$(git rev-parse HEAD)" \
  --claude-session-id "$CLAUDE_SESSION_ID" \
  --agent-type "CLAUDE_CODE" \
  --changed-files "$(git diff --name-only HEAD~1 HEAD | paste -sd',' -)" \
  --tag "One of REFACTORING|FEATURE|BUGFIX|TEST|DOCS" \
  --alternatives "" \
  --diff-summary "Summary of key changes"

`$CLAUDE_SESSION_ID` is exported by the SessionStart hook. The subagent inherits it from the parent shell, so it works in subagent contexts too.

Continue working even if the script fails.
```

The subagent knows its own work context best, making this the most accurate method.

If capture instructions were not included in the prompt, the controller should follow the "Procedure" section above to capture directly after the subagent completes.
If the subagent result does not include a commit hash, verify with `git log --oneline -1`.

## API Reference

See `references/capture-api.md` for the full capture API specification.
