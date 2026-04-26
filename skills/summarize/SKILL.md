---
name: summarize
description: Generate a summary report for a Claude Code session, capturing what was done, why, and what alternatives were considered.
---

Generate a session summary report.

## Writing Language

Before generating the report, run `git log --oneline -3` to detect the language used in recent commit messages. Write the entire report in the same language. For example, if commit messages are in Korean, write the report in Korean. If in English, write in English.

## Instructions

1. Call the `get_session_summary` MCP tool to retrieve session data.
   - If a session ID is provided as an argument (`$ARGUMENTS` is not empty), pass it as `sessionId`.
   - If no argument is given, omit `sessionId` (the current session will be used automatically).

2. Based on the returned data, generate a summary report in Korean with the following sections:
   - **Title**: A one-sentence summary of the session's key work
   - **Overview**: 2-3 sentences describing the overall workflow of the session
   - **Key Changes**: For each capture entry, summarize what was done and why
   - **Rejected Alternatives**: Include alternatives if present
   - **Changed Files**: List all changed files
   - **Continuation Directive**: A structured directive for the next session's agent to continue the work. Generate using the template and guidelines below.

### Continuation Directive Template

**Important**: Always insert the HTML comment marker `<!-- CONTINUATION_DIRECTIVE_START -->` immediately before the Continuation Directive heading. This marker is used by the frontend to extract and display the directive separately.

If the session has incomplete work, use this template:

```markdown
<!-- CONTINUATION_DIRECTIVE_START -->
## Continuation Directive

> **Goal**: The end goal this session was working toward (one sentence)
> **Current State**: What has been completed so far (one sentence)
> **Completion**: Approximate percentage (e.g., ~60%)

### Remaining Tasks
- [ ] Specific incomplete item

### Recommended Order of Work
1. What to do first and why

### Design Decisions to Preserve
| Decision | Rationale |
|----------|-----------|
| What was decided | Why it was decided this way |

### Caveats
- Constraints or pitfalls the agent must be aware of
```

If all planned work is complete, replace the entire template with:

```markdown
<!-- CONTINUATION_DIRECTIVE_START -->
## Continuation Directive

All planned work for this session has been completed.
```

### Directive Quality Guidelines

- **Be specific**: Write "Implement DELETE /api/v1/feedbacks/{id} endpoint" instead of "Implement API" — the agent should be able to act immediately
- **Include rationale**: Every decision and task item must explain "why". Without rationale, the agent may arbitrarily change direction
- **Use present tense**: Write "X must be done" not "X was planned" — frame as current instructions, not past plans
- **Empty fields**: Write "None" but keep the field to maintain structural consistency
- **Data sources**:
  - Goal / Current State: synthesize from entries' intent fields
  - Remaining Tasks: infer planned items not yet completed from entries
  - Design Decisions: extract "chosen vs rejected" from entries' alternatives fields
  - Caveats: extract constraints from entries' intent/alternatives fields

3. Display the generated report to the user.

4. Call the `save_session_report` MCP tool to save the report to the server.
   - `title`: The title generated above
   - `content`: The full report content (Markdown)
   - `sessionId`: The same value used in step 1

5. Display a save confirmation message.
