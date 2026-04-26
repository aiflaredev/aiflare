#!/usr/bin/env bash
# AIFlare Capture Script
# Standalone script that can be run directly from subagents or hooks
#
# Usage:
#   capture.sh --title "title" --intent "intent" --commit-hash "abc123" --agent-type "CLAUDE_CODE" \
#     --claude-session-id "SESSION_ID" --changed-files "file1.kt,file2.kt" --tag "FEATURE" \
#     [--alternatives "alternatives"] [--diff-summary "diff summary"]
#
# If --claude-session-id is omitted, it is extracted from the most recent prompt file in .context-capture/.

set -euo pipefail

# --- Argument parsing ---
TITLE="${CB_TITLE:-}"
INTENT="${CB_INTENT:-}"
COMMIT_HASH="${CB_COMMIT_HASH:-}"
AGENT_TYPE="${CB_AGENT_TYPE:-CLAUDE_CODE}"
CLAUDE_SESSION_ID="${CB_CLAUDE_SESSION_ID:-}"
CHANGED_FILES="${CB_CHANGED_FILES:-}"
TAG="${CB_TAG:-}"
ALTERNATIVES="${CB_ALTERNATIVES:-}"
DIFF_SUMMARY="${CB_DIFF_SUMMARY:-}"
CONVERSATION_SNIPPET="${CB_CONVERSATION_SNIPPET:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title)             TITLE="$2";             shift 2 ;;
    --intent)            INTENT="$2";            shift 2 ;;
    --commit-hash)       COMMIT_HASH="$2";       shift 2 ;;
    --agent-type)        AGENT_TYPE="$2";        shift 2 ;;
    --claude-session-id) CLAUDE_SESSION_ID="$2"; shift 2 ;;
    --changed-files)     CHANGED_FILES="$2";     shift 2 ;;
    --tag)               TAG="$2";               shift 2 ;;
    --alternatives)      ALTERNATIVES="$2";      shift 2 ;;
    --diff-summary)      DIFF_SUMMARY="$2";      shift 2 ;;
    --conversation-snippet) CONVERSATION_SNIPPET="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# --- Find config file (relative to git root) ---
GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [[ -z "$GIT_ROOT" ]]; then
  echo "AIFlare capture skipped: not a git repository."
  exit 0
fi

CONFIG_FILE="${GIT_ROOT}/aiflare.yml"
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "AIFlare capture skipped: aiflare.yml not found."
  exit 0
fi

# --- Extract config values (using grep/sed without yq) ---
API_KEY="$(grep -E '^\s*api_key\s*:' "$CONFIG_FILE" | sed 's/^[^:]*:\s*//' | sed 's/^["'"'"']//' | sed 's/["'"'"']$//' | tr -d '[:space:]')"
ENDPOINT="$(grep -E '^\s*endpoint\s*:' "$CONFIG_FILE" | sed 's/^[^:]*:\s*//' | sed 's/^["'"'"']//' | sed 's/["'"'"']$//' | tr -d '[:space:]' || true)"
ENDPOINT="${ENDPOINT:-https://api.aiflare.dev}"

if [[ -z "$API_KEY" ]]; then
  echo "AIFlare capture skipped: api_key missing in aiflare.yml."
  exit 0
fi

# --- claude-session-id fallback: extract from most recent prompt file ---
if [[ -z "$CLAUDE_SESSION_ID" ]]; then
  LATEST_PROMPT="$(ls -t "${GIT_ROOT}/.context-capture"/.claude-prompts-* 2>/dev/null | head -1)"
  if [[ -n "$LATEST_PROMPT" ]]; then
    CLAUDE_SESSION_ID="$(basename "$LATEST_PROMPT" | sed 's/^\.claude-prompts-//')"
  fi
fi

# --- conversation-snippet fallback: read from delta file ---
if [[ -z "$CONVERSATION_SNIPPET" && -n "$CLAUDE_SESSION_ID" ]]; then
  DELTA_FILE="$(git rev-parse --show-toplevel 2>/dev/null)/.context-capture/.claude-conversation-delta-${CLAUDE_SESSION_ID}"
  if [[ -f "$DELTA_FILE" ]]; then
    CONVERSATION_SNIPPET="$(cat "$DELTA_FILE")"
    rm -f "$DELTA_FILE"
  fi
fi

# --- continuation flag: true if the commit happens right after an AskUserQuestion ---
CONTINUATION="false"
if [[ -n "$CLAUDE_SESSION_ID" ]]; then
  PENDING_QUESTION_FILE="${GIT_ROOT}/.context-capture/.pending-question-${CLAUDE_SESSION_ID}"
  if [[ -f "$PENDING_QUESTION_FILE" ]]; then
    CONTINUATION="true"
    rm -f "$PENDING_QUESTION_FILE"
  fi
fi

# --- Required field validation ---
if [[ -z "$TITLE" || -z "$INTENT" || -z "$COMMIT_HASH" || -z "$CLAUDE_SESSION_ID" || -z "$CHANGED_FILES" || -z "$TAG" ]]; then
  echo "Error: --title, --intent, --commit-hash, --claude-session-id, --changed-files, --tag are required." >&2
  exit 1
fi

# --- Temp file (PID-based for concurrent execution safety) ---
PAYLOAD_FILE="/tmp/cb-capture-payload-$$.json"
trap 'rm -f "$PAYLOAD_FILE"' EXIT

# --- JSON escape function ---
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  echo "$s"
}

# --- Convert changedFiles to JSON array (comma-separated string → ["a","b"]) ---
build_changed_files_json() {
  local input="$1"
  local result="["
  local first=true
  IFS=',' read -ra FILES <<< "$input"
  for file in "${FILES[@]}"; do
    file="$(echo "$file" | xargs)"  # trim whitespace
    if [[ -n "$file" ]]; then
      if [[ "$first" == true ]]; then
        first=false
      else
        result+=","
      fi
      result+="\"$(json_escape "$file")\""
    fi
  done
  result+="]"
  echo "$result"
}

CHANGED_FILES_JSON="$(build_changed_files_json "$CHANGED_FILES")"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"

# --- Build payload ---
SNIPPET_FIELD=""
if [[ -n "$CONVERSATION_SNIPPET" ]]; then
  SNIPPET_FIELD=",\"conversationSnippet\": \"$(json_escape "$CONVERSATION_SNIPPET")\""
fi

cat > "$PAYLOAD_FILE" << PAYLOAD_EOF
{
  "title": "$(json_escape "$TITLE")",
  "intent": "$(json_escape "$INTENT")",
  "alternatives": "$(json_escape "$ALTERNATIVES")",
  "diffSummary": "$(json_escape "$DIFF_SUMMARY")",
  "commitHash": "$(json_escape "$COMMIT_HASH")",
  "agentType": "$(json_escape "$AGENT_TYPE")",
  "claudeSessionId": "$(json_escape "$CLAUDE_SESSION_ID")",
  "changedFiles": ${CHANGED_FILES_JSON},
  "tag": "$(json_escape "$TAG")",
  "branch": "$(json_escape "$BRANCH")",
  "continuation": ${CONTINUATION}${SNIPPET_FIELD}
}
PAYLOAD_EOF

# --- API call ---
RESPONSE="$(curl -s -w "\n%{http_code}" \
  -X POST "${ENDPOINT}/api/v1/captures" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d @"$PAYLOAD_FILE" 2>&1)"

HTTP_CODE="$(echo "$RESPONSE" | tail -1)"
BODY="$(echo "$RESPONSE" | sed '$d')"

# --- Error log helper ---
ERR_LOG_DIR="${GIT_ROOT}/.context-capture"
mkdir -p "$ERR_LOG_DIR"

log_error() {
  local msg="$1"
  local log_file="${ERR_LOG_DIR}/capture-error-$(date '+%Y%m%d%H%M%S').log"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ${msg} | commit=${COMMIT_HASH} title=${TITLE}" >> "$log_file"
}

# --- Handle response ---
case "$HTTP_CODE" in
  201) echo "AIFlare capture complete: ${TITLE}" ;;
  400) echo "AIFlare capture failed: invalid request data — ${BODY}";   log_error "HTTP 400: invalid request data — ${BODY}" ;;
  401) echo "AIFlare capture failed: API Key is invalid.";              log_error "HTTP 401: API Key is invalid" ;;
  404) echo "AIFlare capture failed: no project found for this API Key."; log_error "HTTP 404: no project found for this API Key" ;;
  429) echo "AIFlare capture failed: rate limit exceeded.";             log_error "HTTP 429: rate limit exceeded" ;;
  *)   echo "AIFlare capture failed: HTTP ${HTTP_CODE} — ${BODY}";     log_error "HTTP ${HTTP_CODE}: ${BODY}" ;;
esac
