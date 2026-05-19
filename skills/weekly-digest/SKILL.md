---
name: weekly-digest
description: Generate a weekly digest report (DEV or PM audience), then save it to the server.
---

Generate a weekly digest report. Two audiences are supported via argument: DEV (developer-facing) or PM (business-facing).

## Argument Parsing

Tokenize `$ARGUMENTS` by whitespace. Apply the rules in order:

1. If the first token is `dev` or `pm` (case-insensitive), interpret it as `audience` and consume it. Otherwise, audience defaults to `DEV`.
2. If the next remaining token (or the first token, when audience was not specified) matches `YYYY-Www`, interpret it as `week`. Otherwise, omit `week` (the MCP tool will use the current week).
3. Ignore any further tokens.

Examples:
- `/weekly-digest` → audience=DEV, week=current
- `/weekly-digest 2026-W15` → audience=DEV, week=2026-W15
- `/weekly-digest pm` → audience=PM, week=current
- `/weekly-digest pm 2026-W15` → audience=PM, week=2026-W15
- `/weekly-digest dev 2026-W15` → audience=DEV, week=2026-W15

## Writing Language

Before generating the report, run `git log --oneline -3` to detect the language used in recent commit messages. Write the entire report in that language.

## Steps

1. Parse arguments to determine `audience` and (optionally) `week`.
2. Call `get_weekly_digest` MCP tool with `week` (if specified) and `audience`. The header in the returned data will indicate whether you are in DEV or PM mode.
3. Generate the report following the **DEV mode** or **PM mode** section below — only one applies based on the resolved audience. Do not mix the two.
4. Display the generated report to the user.
5. Call `save_weekly_digest_report` MCP tool with `week`, `title`, `content`, and `audience`.
6. Display the save confirmation message.

---

## DEV mode

Apply this section ONLY when audience=DEV.

### Writing Style

All report content MUST be written in **formal report style**. Do not use conversational or casual tone.
- O: "OAuth Authorization Code Flow with PKCE was selected.", "A total of 47 commits were made across 12 sessions."
- X: "We went with OAuth.", "The team was busy this week."

### Required Sections

Key decisions MUST be the centerpiece of the report — this is the primary value that differentiates AIFlare from git log.

- **Title**: A one-sentence summary of the week's key work (include the week identifier)
- **Overview**: 2-3 sentences describing the overall activity (total commits, sessions, active members, key areas)
- **Key Decisions**: For each decision, describe what was chosen, why (intent), and what alternatives were rejected. Group by theme if multiple decisions relate to the same area. This section should be the longest and most detailed.
- **Member Summary**: For each active member, summarize their key contributions and sessions
- **Tag Distribution**: Breakdown of work by type (FEATURE, BUGFIX, REFACTORING, etc.)
- **Most Changed Files**: List the most frequently changed files with context on why they were hotspots
- **Continuity Notes**: Highlight any work that spans multiple members or builds on previous sessions

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

All statements MUST be derived from the data returned by `get_weekly_digest`. Do NOT add facts not present in the data (external meetings, customer feedback, schedules, etc.).

### Required Sections (5 — all mandatory)

Even if a section's data is sparse, do NOT omit it — instead state "Limited activity this week" or equivalent. Section consistency must be preserved.

1. **Title**: A one-sentence summary including the week identifier (e.g., `2026-W15: Official launch of the payment module and monitoring beta in progress`)
2. **Key Achievements This Week**: 2–3 bullets describing user/business-facing progress this week. Extract user-facing items from `keyDecisions` and `tagBreakdown`.
3. **Key Decisions and Their Impact**: Re-narrate `keyDecisions` in non-technical vocabulary. For each decision, state its business/product impact in one sentence.
4. **Team Workload Distribution**: From `memberDigests`, describe per-member work areas and proportions. If work is concentrated in one area or skewed to one person, state so explicitly.
5. **Reference Statistics**: Total commits, active member count, tag breakdown — kept brief, in appendix tone.
