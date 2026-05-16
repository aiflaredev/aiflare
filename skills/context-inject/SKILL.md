---
name: context-inject
description: Inject a previous Claude Code session's saved report into the current session's context, using a sessionId copied from the AIFlare web dashboard.
---

Inject a saved report from a previous Claude Code session (produced by `/summarize`) into the current session's context.

## Writing Language

Before generating the report, run `git log --oneline -3` to detect the language used in recent commit messages. Write the entire report in that language. For example, if commit messages are in Korean, write the report in Korean. If in English, write in English.

## Usage

```
/context-inject <sessionId>
```

`<sessionId>` is the past session's ID copied from the AIFlare web dashboard. It is NOT the current session.

## Instructions

1. Extract `sessionId` from `$ARGUMENTS`. If empty, output the following guidance and stop:

   > Provide the session ID as an argument. You can copy it from the web dashboard.
   > Usage: `/context-inject <sessionId>`

2. Call the `get_saved_session_report` MCP tool.
   - `sessionId`: pass the value from step 1 verbatim.

3. Output the string returned by the tool **verbatim** (no editing, summarizing, or reformatting).

4. If the output starts with any of the following, it is an **error response** — do not append any guidance and stop:
   - `AIFlare is not configured`
   - `sessionId is required`
   - `No saved report exists for this session`
   - `Error querying AIFlare:`

5. Otherwise the output is a **success response** (starts with `## Injected Session Report: ...`). Add a blank line and then the following confirmation as the last line:

   ```
   _The report above has been injected into the current session's context. I will continue from here._
   ```

6. For subsequent user questions, answer by referring to the injected report (especially questions about intent, rejected alternatives, or changed files).
