#!/usr/bin/env bash
set -euo pipefail
HOOK_NAME=session-end
source "$(dirname "$0")/_common.sh"

read_input || exit 0
git_root=$(get_git_root) || git_root=$(pwd)

# Clean up the 4 files in .context-capture/ on session end. No-op if files don't exist.
rm -f "$(prompt_file_path        "$SESSION_ID" "$git_root")"
rm -f "$(offset_file_path        "$SESSION_ID" "$git_root")"
rm -f "$(delta_file_path         "$SESSION_ID" "$git_root")"
rm -f "$(pending_question_path   "$SESSION_ID" "$git_root")"
