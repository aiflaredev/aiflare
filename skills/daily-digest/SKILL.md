---
name: daily-digest
description: Generate a daily digest report summarizing the day's work, then save it to the server.
---

Generate a daily digest report.

## Writing Language

Before generating the report, run `git log --oneline -3` to detect the language used in recent commit messages. Write the entire report in that language. For example, if commit messages are in Korean, write the report in Korean. If in English, write in English.

## Writing Style

All report content MUST be written in **formal report style**. Do not use conversational or casual tone.
- O: "Payment retry logic was implemented.", "A total of 3 commits were made."
- X: "We added some retry stuff.", "So basically 3 commits happened."

## Instructions

1. Call the `get_daily_digest` MCP tool to retrieve daily digest data.
   - If a date is provided as an argument (`$ARGUMENTS` is not empty), pass it as `date`.
   - If no argument is given, omit `date` (today's date will be used automatically).

2. Based on the returned data, generate a digest report in English with the following sections:
   - **Title**: A one-sentence summary of the day's key work (include the date)
   - **Overview**: 2-3 sentences describing the overall work of the day (total commits, sessions, key areas)
   - **Session Summary**: For each session, summarize what was done, key decisions made, and files changed
   - **Tag Distribution**: Breakdown of work by type (FEATURE, BUGFIX, REFACTOR, etc.)
   - **Most Changed Files**: List the most frequently changed files with context on why they were modified
   - **Key Decisions**: Highlight important architectural or design decisions from the day

3. Display the generated report to the user.

4. Call the `save_daily_digest_report` MCP tool to save the report to the server.
   - `date`: The date used in step 1 (YYYY-MM-DD format)
   - `title`: The title generated above
   - `content`: The full report content (Markdown)

5. Display a save confirmation message.
