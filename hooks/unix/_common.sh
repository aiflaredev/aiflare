#!/usr/bin/env bash
# Claude Code hook common library. Do not execute directly (source-only).
# Usage: source "$(dirname "$0")/_common.sh"
# Variables exported after call: INPUT, SESSION_ID

# Read stdin JSON, export INPUT and SESSION_ID. Returns 1 if SESSION_ID is empty.
read_input() {
  INPUT=$(cat)
  SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty')
  [[ -n "$SESSION_ID" ]] || return 1
  export INPUT SESSION_ID
}

# Print git root. Empty if not in a git repo.
get_git_root() {
  git rev-parse --show-toplevel 2>/dev/null
}

# Create .context-capture directory.
ensure_context_dir() {
  local git_root="$1"
  mkdir -p "${git_root}/.context-capture"
}

# File path helpers. First arg: session_id, second: git_root.
prompt_file_path()        { printf '%s' "$2/.context-capture/.claude-prompts-$1"; }
offset_file_path()        { printf '%s' "$2/.context-capture/.claude-offset-$1"; }
delta_file_path()         { printf '%s' "$2/.context-capture/.claude-conversation-delta-$1"; }
pending_question_path()   { printf '%s' "$2/.context-capture/.pending-question-$1"; }

# Whether aiflare.yml exists.
has_aiflare_config() {
  local git_root="$1"
  [[ -f "${git_root}/aiflare.yml" ]]
}

# Extract api_key and endpoint from aiflare.yml and export. Returns 1 on failure.
read_aiflare_config() {
  local git_root="$1"
  local cfg="${git_root}/aiflare.yml"
  [[ -f "$cfg" ]] || return 1
  AIFLARE_API_KEY=$(grep -E '^api_key:' "$cfg" | awk '{print $2}' | tr -d '"'"'"'')
  AIFLARE_ENDPOINT=$(grep -E '^endpoint:' "$cfg" | awk '{print $2}' | tr -d '"'"'"'')
  [[ -n "$AIFLARE_API_KEY" ]] || return 1
  [[ -n "$AIFLARE_ENDPOINT" ]] || AIFLARE_ENDPOINT="https://api.aiflare.dev"
  export AIFLARE_API_KEY AIFLARE_ENDPOINT
}

# Whether the context-capture skill directory exists.
has_context_capture_skill() {
  local git_root="$1"
  [[ -d "${git_root}/.claude/skills/context-capture" ]]
}

# Logging (stderr). Format: "[LEVEL] [hook=<name> session=<sid 8 chars>] message"
_log() {
  local level="$1"; shift
  local sid_short="${SESSION_ID:0:8}"
  printf '[%s] [hook=%s session=%s] %s\n' \
    "$level" "${HOOK_NAME:-unknown}" "$sid_short" "$*" >&2
}
log_info()  { _log INFO  "$@"; }
log_warn()  { _log WARN  "$@"; }
log_error() { _log ERROR "$@"; }
