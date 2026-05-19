---
name: why
description: Explain why agent-written code was written the way it is, by retrieving the original intent, alternatives, and conversation captured at commit time, paired with a line-around diff computed locally from git. Use when debugging code an AI agent wrote.
---

Explain why a line of code (or file) exists, pairing each touching commit's
AIFlare-captured context (when available) with a locally-computed diff hunk.

## When to use

When debugging code an AI agent wrote — before guessing why it is structured a
certain way, retrieve the original intent. The `why` MCP tool runs git locally
to find the commits that touched the target:

- With `line`: `git log -L {line},{line}:{file}` — line-tracked across in-file
  refactors; file renames are not followed.
- Without `line`: `git log -- {file}` — every commit that touched the file;
  renames are not followed.

For each of those commits it fetches the captured intent, alternatives, and
conversation from AIFlare, and separately runs `git show` locally to extract a
diff hunk (line-targeted when `line` is given, first hunk otherwise). Up to
the 5 most recent commits are returned as a timeline (latest on top).

## Instructions

1. Determine the file and (optionally) the line the user is asking about.
   - If `$ARGUMENTS` is given as `<file>:<line>` (e.g. `src/foo/Bar.kt:42`),
     split it into `file` and `line`.
   - If only a file path is given, omit `line` to get file-level history.
   - If no argument is given, infer the file and line from the current
     debugging context.

2. Call the `why` MCP tool with `file` and (optionally) `line`.

3. Present the returned timeline to the user. Each entry includes:
   - **Title** and **Tag** for quick orientation
   - **Intent** — why the agent wrote it this way
   - **Alternatives considered** — options the agent rejected (when present)
   - **Diff around this line** / **Key changes** — the actual code change
   - **Conversation behind this commit** — original session excerpt (when present)

   Ground your debugging in the captured intent — do not guess at the original
   design when it is available. The most recent commit is at the top; older
   commits below show how the line evolved.

4. If the tool reports any of the following, tell the user plainly and
   continue with normal debugging. Do not fabricate intent.
   - `... none are captured in AIFlare.` — commits exist but no captures
   - `No commit history found for ...` — file/line is untracked or empty
   - `Not in a git repository.` — run from inside a git working tree
   - `git query failed — check the file path ...` — bad path or out-of-range line
   - `AIFlare is not configured. ...` — `aiflare.yml` missing or has no `api_key`
   - `Error querying AIFlare: ...` — backend/network error

5. If the response says `Showing the 5 most recent of N commits.` (timeline) or
   `Checked the 5 most recent of N commits, but none are captured in AIFlare.`
   (no-capture fallback), the target has a longer history than the 5-commit
   cap. Mention this when the older commits might matter (e.g., to find the
   original introduction).
