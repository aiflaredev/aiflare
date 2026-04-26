---
name: weekly-digest
description: Generate a weekly digest report summarizing the week's work, then save it to the server.
---

Generate a weekly digest report.

## Writing Language

Before generating the report, run `git log --oneline -3` to detect the language used in recent commit messages. Write the entire report in that language. For example, if commit messages are in Korean, write the report in Korean. If in English, write in English.

## Writing Style

All report content MUST be written in **formal report style**. Do not use conversational or casual tone.
- O: "OAuth Authorization Code Flow with PKCE was selected.", "A total of 47 commits were made across 12 sessions."
- X: "We went with OAuth.", "The team was busy this week."

## Instructions

1. Call the `get_weekly_digest` MCP tool to retrieve weekly digest data.
   - If a week is provided as an argument (`$ARGUMENTS` is not empty), pass it as `week`.
   - If no argument is given, omit `week` (the current week will be used automatically).

2. Based on the returned data, generate a digest report with the following sections. **Key decisions MUST be the centerpiece of the report** — this is the primary value that differentiates AIFlare from git log.

   - **Title**: A one-sentence summary of the week's key work (include the week identifier)
   - **Overview**: 2-3 sentences describing the overall activity (total commits, sessions, active members, key areas)
   - **Key Decisions**: For each decision, describe what was chosen, why (intent), and what alternatives were rejected. Group by theme if multiple decisions relate to the same area. This section should be the longest and most detailed.
   - **Member Summary**: For each active member, summarize their key contributions and sessions
   - **Tag Distribution**: Breakdown of work by type (FEATURE, BUGFIX, REFACTORING, etc.)
   - **Most Changed Files**: List the most frequently changed files with context on why they were hotspots
   - **Continuity Notes**: Highlight any work that spans multiple members or builds on previous sessions

3. Display the generated report to the user.

4. Call the `save_weekly_digest_report` MCP tool to save the report to the server.
   - `week`: The week used in step 1 (ISO 8601 format, e.g., "2026-W15")
   - `title`: The title generated above
   - `content`: The full report content (Markdown)

5. Display a save confirmation message.
