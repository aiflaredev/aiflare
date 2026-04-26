#!/usr/bin/env bash
set -euo pipefail
HOOK_NAME=user-prompt-submit
source "$(dirname "$0")/_common.sh"

read_input || exit 0
prompt=$(printf '%s' "$INPUT" | jq -r '.prompt // empty')
[[ -n "$prompt" ]] || exit 0
git_root=$(get_git_root) || git_root=$(pwd)
ensure_context_dir "$git_root"
prompt_file=$(prompt_file_path "$SESSION_ID" "$git_root")
content_json=$(printf '%s' "$prompt" | jq -Rs .)
printf '{"role":"user","content":%s}\n' "$content_json" >> "$prompt_file"
