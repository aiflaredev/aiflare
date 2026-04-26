---
name: prompt-evaluate
description: Evaluate the current session's user prompts against Claude Code best practices and save a coach-style report.
---

Evaluate the quality of the current session's user prompts and produce a **coach-style report meant to be read within a minute of the session ending**. This is not a long-form retrospective or archival report.

## Output language

Write the report in the same language as the project's recent git commit messages (check `git log --oneline -3`). This skill document is written in English for accessibility, but the report itself must match the project's language.

## Execution steps

1. Call the `get_session_prompts` MCP tool to retrieve the prompt content of the current session.
   - If a session ID is provided via `$ARGUMENTS`, pass it as `sessionId`.
   - Otherwise omit it (the current session is used automatically).
   - If the tool returns an error like `PROMPT_NO_CONTENT` or "no prompts found": inform the user with "No saved prompts exist for this session. Please run this in a session where at least one git commit has occurred." and exit.

2. **First, understand the full conversation context.** The content returned is JSON Lines (one JSON object per line, `role` is `"user"` or `"assistant"`, `content` is the text of that turn). Before evaluating, read the flow to understand "what goal the user was trying to achieve in this session", "what topics/tasks were exchanged", and "what context the later prompts presuppose from earlier conversation". Evaluating individual prompts without context makes it easy to undervalue short approval/rejection turns ("approve", "1", "B") — interpret these by pairing them with the options or questions the preceding assistant turn raised.

   Example JSON Lines format:

   ```jsonl
   {"role":"user","content":"/brainstorming @docs/... Please reference. When entering the account settings page ..."}
   {"role":"assistant","content":"I identified the root causes of both problems. ... Choose A/B or ..."}
   {"role":"user","content":"Is there a case where account settings are in a modal? Claude's doesn't seem to show as modal either."}
   {"role":"assistant","content":"Actual best practices ... Among options 1/2/3 ..."}
   {"role":"user","content":"Option 1"}
   ```

   In this example, a short user turn like "Option 1" must be interpreted as a decision on the options presented by the preceding assistant turn — it should not be evaluated as a "prompt lacking context."

3. Based on the conversation flow understood in step 2, analyze the prompts using the "internal evaluation lens" below, **strictly following** the "Evaluation philosophy" and "Anti-inflation guardrails". The 7 axes of the lens are **not an output structure** — they are an internal checklist you run through while reading the prompts.

4. Write a Markdown report following the 3-section structure in "Report format" and output it to the user. Do not list the 7 axes as sections. Do not output star ratings or total scores.

5. Call the `save_prompt_evaluation_report` MCP tool to save the report to the server.
   - `title`: the report title generated above
   - `content`: full report contents
   - `sessionId`: same value as step 1
   - If saving fails, explain the cause but since the report body was already shown above, the user can copy it.

6. Notify the save result in one line.

---

## Evaluation philosophy

- **Do not fill every axis every time.** Use only the evidence that exists in this session. Axes with no supporting case do not appear in the report.
- **A report's value comes from density, not length.** Every sentence must be grounded in a quotable prompt from the session, or be a sentence the user can paste directly into their next session.
- **The ultimate utility of the report = its ability to make the user behave differently in the next session.** It is an immediately-actionable prescription, not a contemplative retrospective.

## Anti-inflation guardrails

While writing the report, **strictly** follow the 6 rules below.

1. **Evidence principle**: Every item (praise or critique) must be grounded in a quotable prompt/turn from the session. Do not write items without citations.

2. **No hedging phrasing**: Do not use phrases like "this effectively amounts to ~", "can be seen as ~", "equivalent to ~" that force-fit a case. If the case doesn't exist, don't write that item at all.

3. **No intent inference**: Do not praise by guessing the user's internal motivation, knowledge, or intent. For example, phrases like "*mindful of* PR guidelines", "*referencing* CLAUDE.md" are unobservable claims and forbidden. Base everything on observable prompt text only.

4. **Bias calibration**: If the "What worked" section is longer or has more items than "What didn't work", reconsider. The default stance is "there is always something to improve." Even when a session is genuinely excellent, point out at least 1 strong item in "What didn't work".

5. **Sample guard**: If the prompt count is fewer than 3, output only 1 "What didn't work" item + 1 "Next-session template" and close with "Deep diagnosis omitted due to insufficient sample." Do not force 3 sections.

6. **Self-bias caution**: When evaluating sessions that develop or meta-handle this evaluation tool or skill itself, apply the rules especially strictly. The temptation to praise meta work is strong. For the same evidence, view it one level more critically than a normal session.

## Internal evaluation lens (not output)

The 7 criteria below are a **checklist you run internally while reading the prompts**. Do not surface them as section titles in the report. Source: [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices).

### 1. Give Claude ways to verify its own output

Whether the prompt includes success criteria, test cases, screenshots, or "this is what success looks like" conditions. Requests like "fix this", "make it better" with no way to verify are weaknesses.

### 2. Provide concrete context in the prompt

Whether filenames, component names, line numbers, and reproduction steps are specified. Requests with unbounded exploration scope like "fix the sidebar" are weaknesses. However, intentionally ambiguous prompts may be useful during exploration phases.

### 3. Use rich context-delivery mechanisms

Whether `@` file references, pasting errors/logs, screenshots, and relevant document URLs are used. Asking Claude to search, or paraphrasing errors into prose, are weaknesses.

### 4. Explore → Plan → Code pattern

Whether Plan Mode / brainstorming was requested for design before big changes and implementation followed approval. Requesting implementation of large refactors or new features without design, or conversely over-requesting plans for trivial work, are weaknesses.

### 5. Ask Claude to interview you

Whether the `AskUserQuestion` tool was invoked for interviewing at the start of a sizable feature. Throwing incomplete requirements as-is and re-explaining mid-implementation is a weakness.

### 6. Quick correction

Whether wrong directions were caught and reverted immediately (`Esc`, `Esc Esc`, "undo that", `/clear`). **Picking an option from a menu is not correction** — this misjudgment is common, so watch for it. Repeating the same correction or letting errors persist are weaknesses.

### 7. Session management

Whether `/clear` was used between unrelated tasks, and whether investigation was delegated to a subagent. Having completely different topics mixed in one session is a weakness.

Do not list ✅/⚠️/❌ for each criterion in the report. The diagnosis from this lens surfaces **only as evidence-based sentences** within the 3 report sections below.

---

## Report format

Follow the 3-section structure below. Do not include star ratings, per-axis section listings, or trailing sentences like "the evaluation result is for reference only".

```markdown
## Prompt quality evaluation — [one-line session summary]

**Session:** [1-sentence description of what was done]
**Prompt count:** N

---

### What worked in this session
- **[Action name]:** "session prompt quotation" → [one-line reason why it was effective]
- (1–3 items, cap 3)

### What didn't work in this session

**Repeating-pattern diagnosis** (1–2 items)
- **[Pattern name — 5–10 chars]**
  - **Observation:** 2–3 citations where the same weakness appears 2+ times
  - **Presumed cause:** 1-line hypothesis (mark as "presumed")
  - **Impact:** concrete cost such as round-trip count / rework scope / wrong-direction entry

**Before → After rewrites** (2–3 items)
- **Before:** "actual prompt quotation (abbreviate with … if needed)"
- **After:** "a stronger version with the minimum edit to Before"
- **Why:** one-line reasoning

### Next-session sentence templates
- `one-line prompt ready to paste` — [one-line note on when to use]
- (2–3 items, each template maps 1:1 to a weakness diagnosed above)
```

### Writing rules for each ingredient

**① What worked**

- Item format fixed: `- **[Action name]:** "quotation" → [one-line effect]`
- Do not overuse adverbs like "consistently", "precisely", "exemplarily". Observed facts only.
- Cap 3 items. Drop the weakest when exceeding.

**② Repeating-pattern diagnosis**

- Definition of "repeating": **the same weakness observed 2+ times** within the session. Single-occurrence cases are routed to ③ instead.
- Describe impact only as concrete cost — round-trip count, rework scope, context pollution, wrong-direction entry. Forbid abstract evaluations like "inefficient."
- If only 1 pattern is found, write only 1. Do not force 2 for volume.

**③ Before → After rewrites**

- After must be the **minimum edit** to Before. Do not replace the prompt with a completely different one. The user needs to feel "just add this one line" so it becomes habitual.
- Must include **at least 1** rewrite connected to the pattern in ②.
- Prompts praised in ① are excluded from rewrite targets.

**③b Next-session sentence templates**

- Item format: `` `one-line template` — [one-line note on when to use] ``
- Each template must be a **1:1 mapping** to a weakness diagnosed above. Forbid general advice without a mapping.
- Leave specific file/error message slots as `[...]` placeholders.

---

## Example report

Below is an example based on a fictional session (fixing a payment API bug). It is reference-only for format stability — actual reports must **not imitate this example** but be written with the evidence unique to the session being evaluated.

```markdown
## Prompt quality evaluation — Root-cause tracing and fix of payment API 500 errors

**Session:** A session that took intermittent 500 errors from the payment creation API through root-cause analysis → reproduction test → fix → merge
**Prompt count:** 11

---

### What worked in this session
- **Raw error delivery:** "Pasted full stack trace (PaymentService.kt:87 ...)" → giving the log verbatim instead of paraphrasing ended root-cause guessing in 1 round trip.
- **Direct file reference:** "`@src/payment/PaymentService.kt` check the retry logic in this file" → narrowed search scope via `@` reference so Claude read code directly without guessing.

### What didn't work in this session

**Repeating-pattern diagnosis**

- **Blank verification criteria**
  - **Observation:** "fix it" (turn 3), "fix this part" (turn 7) — both times "success condition" or "test case" was missing.
  - **Presumed cause:** Satisfied with precisely delivering the error message, the verification step was implicitly delegated.
  - **Impact:** Claude proposed a temporary patch, requiring a "run tests first" re-request that added 2 more round trips.

**Before → After rewrites**

- **Before:** "fix the retry logic"
- **After:** "Fix the retry logic. First write a failure-reproduction test, then after fixing confirm that the test passes."
- **Why:** Baking verification criteria (failing test → passing) into the prompt removes 2 round trips.

- **Before:** "fix this side"
- **After:** "Fix this side. Verify through `./gradlew test --tests PaymentServiceTest` passing."
- **Why:** Including verification inside Claude's loop removes the "run the build" re-prompt.

### Next-session sentence templates
- `Fix [file/module]. First write a test that reproduces the failure, then after fixing confirm it passes.` — when instructing a bug fix
- `After fixing, verify that [verification command] passes; if it fails, paste the log and trace the cause.` — append as the last line of every implementation instruction
```

End of example. Actual reports adopt only the structure of this example, and fill the content with evidence unique to the session being evaluated.
