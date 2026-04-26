#!/usr/bin/env bash
set -euo pipefail
HOOK_NAME=post-tool-use-bash-git-commit
source "$(dirname "$0")/_common.sh"

upload_prompt_file() {
  local session_id="$1" git_root="$2"
  local prompt_file; prompt_file=$(prompt_file_path "$session_id" "$git_root")
  [[ -f "$prompt_file" ]] || return 0
  local content; content=$(jq -Rs . < "$prompt_file")
  local payload; payload=$(printf '{"claudeSessionId":"%s","content":%s}' "$session_id" "$content")
  curl -sfS --connect-timeout 5 -X PUT \
    "${AIFLARE_ENDPOINT}/api/v1/work-sessions/prompt" \
    -H 'Content-Type: application/json' \
    -H "X-API-Key: ${AIFLARE_API_KEY}" \
    -d "$payload" > /dev/null \
    || log_warn "prompt upload failed"
}

update_delta() {
  local session_id="$1" git_root="$2"
  local prompt_file offset_file delta_file last_index total_lines
  prompt_file=$(prompt_file_path "$session_id" "$git_root")
  offset_file=$(offset_file_path "$session_id" "$git_root")
  delta_file=$(delta_file_path "$session_id" "$git_root")
  [[ -f "$prompt_file" ]] || return 0
  last_index=0
  [[ -f "$offset_file" ]] && last_index=$(<"$offset_file")
  total_lines=$(wc -l < "$prompt_file" | tr -d ' ')
  if (( total_lines > last_index )); then
    tail -n +$((last_index + 1)) "$prompt_file" > "$delta_file"
  fi
  printf '%s' "$total_lines" > "$offset_file"
}

emit_skill_trigger() {
  printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"git commit completed. You must invoke the context-capture skill to capture the work context."}}'
}

main() {
  read_input || exit 0
  local git_root; git_root=$(get_git_root)
  [[ -n "$git_root" ]] || exit 0
  if has_aiflare_config "$git_root"; then
    read_aiflare_config "$git_root"
    upload_prompt_file "$SESSION_ID" "$git_root"
    update_delta       "$SESSION_ID" "$git_root"
  fi
  if has_context_capture_skill "$git_root"; then
    emit_skill_trigger
  fi
}
main "$@"
