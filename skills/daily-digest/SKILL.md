---
name: daily-digest
description: Generate a daily digest report (DEV or PM audience), then save it to the server.
---

Generate a daily digest report. Two audiences are supported via argument: DEV (developer-facing) or PM (business-facing).

## Argument Parsing

Tokenize `$ARGUMENTS` by whitespace. Apply the rules in order:

1. If the first token is `dev` or `pm` (case-insensitive), interpret it as `audience` and consume it. Otherwise, audience defaults to `DEV`.
2. If the next remaining token (or the first token, when audience was not specified) matches `YYYY-MM-DD`, interpret it as `date`. Otherwise, omit `date` (the MCP tool will use today's date).
3. Ignore any further tokens.

Examples:
- `/daily-digest` → audience=DEV, date=today
- `/daily-digest 2026-04-09` → audience=DEV, date=2026-04-09
- `/daily-digest pm` → audience=PM, date=today
- `/daily-digest pm 2026-04-09` → audience=PM, date=2026-04-09
- `/daily-digest dev 2026-04-09` → audience=DEV, date=2026-04-09

## Writing Language

Before generating the report, run `git log --oneline -3` to detect the language used in recent commit messages. Write the entire report in that language.

## Steps

1. Parse arguments to determine `audience` and (optionally) `date`.
2. Call `get_daily_digest` MCP tool with `date` (if specified) and `audience`. The header in the returned data will indicate whether you are in DEV or PM mode.
3. Generate the report following the **DEV mode** or **PM mode** section below — only one applies based on the resolved audience. Do not mix the two.
4. Display the generated report to the user.
5. Call `save_daily_digest_report` MCP tool with `date`, `title`, `content`, and `audience`.
6. Display the save confirmation message.

---

## DEV mode

Apply this section ONLY when audience=DEV.

### Writing Style

All report content MUST be written in **formal report style**. Do not use conversational or casual tone.
- O: "Payment retry logic was implemented.", "A total of 3 commits were made."
- X: "We added some retry stuff.", "So basically 3 commits happened."

### Required Sections

- **Title**: A one-sentence summary of the day's key work (include the date)
- **Overview**: 2-3 sentences describing the overall work of the day (total commits, sessions, key areas)
- **Session Summary**: For each session, summarize what was done, key decisions made, and files changed
- **Tag Distribution**: Breakdown of work by type (FEATURE, BUGFIX, REFACTOR, etc.)
- **Most Changed Files**: List the most frequently changed files with context on why they were modified
- **Key Decisions**: Highlight important architectural or design decisions from the day

Technical vocabulary (commit hashes, file paths, class/function names, terms like "refactoring", "schema") is allowed.

---

## PM mode

Apply this section ONLY when audience=PM.

### Writing Style

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

All statements MUST be derived from the data returned by `get_daily_digest`. Do NOT add facts not present in the data (external meetings, customer feedback, schedules, etc.).

### Required Sections (5 — all mandatory)

Even if a section's data is sparse, do NOT omit it — instead state "Limited activity today" or equivalent. Section consistency must be preserved.

1. **Title**: A one-sentence summary including the date (e.g., `2026-05-09: Official launch of the payment module and monitoring beta in progress`)
2. **Today's Key Achievements**: 2–3 bullets describing user/business-facing progress. Extract user-facing items from `keyDecisions` and `tagBreakdown`.
3. **Key Decisions and Their Impact**: Re-narrate `keyDecisions` in non-technical vocabulary. For each decision, state its business/product impact in one sentence.
4. **Work Distribution**: From `sessions` and `mostChangedFiles`, describe per-session/per-area work focus. If work is concentrated in one area, state so explicitly.
5. **Reference Statistics**: Total commits, total sessions, tag breakdown — kept brief, in appendix tone.
