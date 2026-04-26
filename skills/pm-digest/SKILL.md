---
name: pm-digest
description: Generate a PM-oriented weekly digest report by reformatting the team's weekly digest data into business-facing vocabulary, then save it to the server.
---

Generate a weekly digest report from a PM (Project Manager) perspective. Unlike `/weekly-digest`, which uses the same underlying data, this skill re-narrates the content using non-technical vocabulary centered on business impact.

## Writing Language

Before generating the report, run `git log --oneline -3` to detect the language used in recent commit messages. Write the entire report in that language. For example, if commit messages are in Korean, write the report in Korean. If in English, write in English.

## Writing Style

All report content MUST be written in **formal report style**. Do not use conversational or casual tone.

### Forbidden vocabulary (NEVER include)

- Commit hashes (e.g., `abc1234`)
- File paths (e.g., `src/payment/PaymentService.kt`)
- Class/function names (e.g., `PaymentService`, `createPayment()`)
- Technical jargon: "refactoring", "migration", "endpoint", "query", "schema", "DI", "JPA", etc.

### Preferred vocabulary

- Product/feature unit naming: "checkout screen", "user signup flow", "admin page"
- Business impact framing: "internal stability improvement", "performance improvement", "user experience improvement"

### Hallucination guard

All statements MUST be derived from the data returned by `get_pm_digest`. Do NOT add facts not present in the data (external meetings, customer feedback, schedules, etc.).

## Instructions

1. Call the `get_pm_digest` MCP tool to retrieve the raw weekly digest data.
   - If a week is provided as an argument (`$ARGUMENTS` is not empty), pass it as `week`.
   - If no argument is given, omit `week` (the current week will be used automatically).

2. Based on the returned data, generate a PM digest report with the following **5 mandatory sections**. Even if a section's data is sparse, do NOT omit it — instead state "Limited activity this week" or equivalent. Section consistency must be preserved.

   - **Title**: A one-sentence summary including the week identifier (e.g., `2026-W15: Official launch of the payment module and monitoring beta in progress`)
   - **Key Achievements This Week**: 2–3 bullets describing user/business-facing progress this week. Extract user-facing items from `keyDecisions` and `tagBreakdown`.
   - **Key Decisions and Their Impact**: Re-narrate `keyDecisions` in non-technical vocabulary. For each decision, state its business/product impact in one sentence.
   - **Team Workload Distribution**: From `memberDigests`, describe per-member work areas and proportions. If work is concentrated in one area or skewed to one person, state so explicitly.
   - **Reference Statistics**: Total commits, active member count, tag breakdown — kept brief, in appendix tone.

3. Display the generated report to the user.

4. Call the `save_pm_digest_report` MCP tool to save the report to the server.
   - `week`: The week used in step 1 (ISO 8601 format, e.g., "2026-W15")
   - `title`: The title generated above
   - `content`: The full report content (Markdown)

5. Display a save confirmation message.
