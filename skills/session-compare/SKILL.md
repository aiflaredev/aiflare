---
name: session-compare
description: Compare two Claude Code sessions side by side, then save the comparison report to the server.
---

Generate a session comparison report.

## Writing Language

Before generating the report, run `git log --oneline -3` to detect the language used in recent commit messages. Write the entire report in that language. For example, if commit messages are in Korean, write the report in Korean. If in English, write in English.

## Writing Style

All report content MUST be written in **formal report style**. Do not use conversational or casual tone.
- O: "Work continuity between the two sessions was confirmed.", "AuthService.kt was modified in both sessions."
- X: "Looks like work continued across sessions.", "AuthService.kt got changed in both."

## Instructions

1. Call the `get_session_compare` MCP tool to retrieve session comparison data.
   - If one session ID is provided as an argument (`$ARGUMENTS` contains one value), pass it as `sessionId1` (current session vs specified session).
   - If two session IDs are provided (space-separated), pass them as `sessionId1` and `sessionId2`.
   - If no argument is given, omit both (current session vs previous session will be used automatically).

2. Based on the returned data, generate a comparison report in English with the following sections:
   - **Title**: A one-sentence summary of the comparison (include both session names)
   - **Session 1 Summary**: Session name, date, commit count, tag distribution, changed files, key decisions
   - **Session 2 Summary**: Same structure as Session 1
   - **Comparison Analysis**:
     - Overlapping files (files changed in both sessions)
     - New files in Session 2 (files only in the later session)
     - Whether this is continued work or a direction change
     - Tag shift analysis (did the type of work change?)
   - **Conclusion**: 1-2 sentences on work continuity and any notable direction changes

3. Display the generated report to the user.

4. Call the `save_session_compare_report` MCP tool to save the report to the server.
   - `sessionId1`: The first session ID from the comparison data
   - `sessionId2`: The second session ID from the comparison data
   - `title`: The title generated above
   - `content`: The full report content (Markdown)

5. Display a save confirmation message.
