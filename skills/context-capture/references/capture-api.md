# AIFlare Capture API Reference

## Authentication

Include the project API Key in the `X-API-Key` header.

---

## Create Capture

```
POST /api/v1/captures
```

### Request Body

Content-Type: application/json

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | Y | Work title (recommended under 50 characters) |
| intent | string | Y | Work intent — why this work was done |
| alternatives | string | N | Alternatives considered and reasons for rejection |
| diffSummary | string | N | Summary of key changes |
| commitHash | string | Y | Git commit hash |
| agentType | string | Y | One of: CLAUDE_CODE, GEMINI_CLI, CODEX, OTHER |
| claudeSessionId | string | Y | Claude session identifier |
| changedFiles | string[] | Y | List of files changed in the commit |
| tag | string | Y | One of: REFACTORING, FEATURE, BUGFIX, TEST, DOCS |
| branch | string | N | Git branch name |
| conversationSnippet | string | N | Conversation snippet related to this commit (user prompt delta) |

### Request Example

```json
{
  "title": "Replace payment retry logic with Exponential Backoff",
  "intent": "**Problem**: The existing Fixed Retry approach caused simultaneous retries to pile up during server overload, worsening outages.\n\n**Solution**: Applied Exponential Backoff + Jitter to distribute retry requests and secure server recovery time.\n\n**Effect**: Prevents simultaneous retry storms and ensures server recovery time.",
  "alternatives": "**Alternative 1 — Increase Fixed Retry interval**\n- Approach: Keep existing logic but increase interval to reduce load\n- Rejected because: Simultaneous requests could still pile up depending on traffic patterns.",
  "diffSummary": "- **PaymentRetryService.kt**: Replaced retry logic from FixedDelay to ExponentialBackoff.\n- **application.yml**: Added 3 retry-related settings (maxAttempts, initialInterval, multiplier).",
  "commitHash": "a1b2c3d4e5f6",
  "agentType": "CLAUDE_CODE",
  "claudeSessionId": "claude-session-abc123",
  "changedFiles": ["src/main/kotlin/PaymentRetryService.kt", "src/main/resources/application.yml"],
  "tag": "FEATURE",
  "branch": "feature/exponential-backoff",
  "conversationSnippet": "Change the project settings\nAdd tests too"
}
```

### Success Response (201 Created)

```json
{
  "success": true,
  "response": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "projectId": "project-uuid",
    "title": "Replace payment retry logic with Exponential Backoff",
    "createdAt": "2026-03-27T14:30:00Z"
  },
  "error": null
}
```

### Error Responses

| HTTP Status | Cause | Description |
|-------------|-------|-------------|
| 400 | Missing required fields | One or more of title, intent, commitHash, agentType, claudeSessionId, changedFiles, tag is missing |
| 401 | Invalid API Key | Key is missing, invalid, or deactivated |
| 404 | Project not found | The project linked to the API Key has been deleted or does not exist |
| 429 | Rate limit exceeded | Per-project rate limit exceeded |
| 5xx | Server error | Internal server error |

---

## Publish Entries

Marks timeline entries as "PUSHED" when commits are pushed to a remote repository. Typically called by the `pre-push` git hook.

```
POST /api/v1/captures/publish
```

### Request Body

Content-Type: application/json

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| commitHashes | string[] | Y | List of commit hashes being pushed |
| branch | string | Y | Branch name being pushed to |

### Request Example

```json
{
  "commitHashes": ["a1b2c3d4e5f6", "b2c3d4e5f6a7"],
  "branch": "feature/exponential-backoff"
}
```

### Success Response (200 OK)

```json
{
  "success": true,
  "response": {
    "publishedCount": 2
  },
  "error": null
}
```

### Error Responses

| HTTP Status | Cause | Description |
|-------------|-------|-------------|
| 400 | Missing required fields | commitHashes or branch is missing or empty |
| 401 | Invalid API Key | Key is missing, invalid, or deactivated |
| 429 | Rate limit exceeded | Per-project rate limit exceeded |
| 5xx | Server error | Internal server error |

---

## Error Response Format

```json
{
  "success": false,
  "response": null,
  "error": {
    "message": "Error description",
    "status": 401
  }
}
```

## Rate Limit

- Per-project, per-minute limit
- Returns 429 response when exceeded
