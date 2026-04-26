#!/usr/bin/env bash
set -euo pipefail
HOOK_NAME=post-tool-use-ask-user-question
source "$(dirname "$0")/_common.sh"

read_input || exit 0
git_root=$(get_git_root) || git_root=$(pwd)
ensure_context_dir "$git_root"
touch "$(pending_question_path "$SESSION_ID" "$git_root")"
