#!/usr/bin/env bash
set -euo pipefail
HOOK_NAME=stop
source "$(dirname "$0")/_common.sh"

read_input || exit 0
stop_active=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false')
[[ "$stop_active" == "true" ]] && exit 0
last_msg=$(printf '%s' "$INPUT" | jq -r '.last_assistant_message // empty')
[[ -n "$last_msg" ]] || exit 0
git_root=$(get_git_root) || git_root=$(pwd)
ensure_context_dir "$git_root"
prompt_file=$(prompt_file_path "$SESSION_ID" "$git_root")
content_json=$(printf '%s' "$last_msg" | jq -Rs .)
printf '{"role":"assistant","content":%s}\n' "$content_json" >> "$prompt_file"
